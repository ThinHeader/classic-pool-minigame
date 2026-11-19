"use strict";

// 联机层：负责 WebSocket 连接、协议收发、快照校正。
// 服务器权威 —— 客户端只上行击球参数，结果以服务器下发的快照为准。
//
// 协议（JSON，t 为消息类型）：
//   c→s  create | join{code} | shot{seq,angle,power} | ballInHand{x,y} | rematch | leave | ping
//   s→c  room{code,seat} | start{seat,snapshot} | shotStart{by,angle,power}
//        shotResult{by,seq,snapshot} | state{snapshot} | opponentLeft{seat} | error{msg} | pong

function Net_Singleton() {
    this.socket = null;
    this.connected = false;
    this.online = false;      // 是否处于联机对局中
    this.roomCode = null;
    this.seat = -1;
    this.seq = 0;
    this.pendingSnapshot = null;
    this.retry = 0;
    this.openCallback = null;
    this.lastLaunchRoom = null;
    // 双方昵称（服务器开局时统一下发，保证两边看到的一致）
    this.names = null;
}

Net_Singleton.prototype.url = function () {
    return GameGlobal.SERVER_URL;
};

Net_Singleton.prototype.connect = function (cb) {
    if (this.connected) {
        if (cb) cb();
        return;
    }

    var self = this;
    this.openCallback = cb || this.openCallback;

    try {
        this.socket = wx.connectSocket({ url: this.url() });
    } catch (e) {
        console.error("[Net] 建立连接失败", e);
        wx.showToast({ title: "连接服务器失败", icon: "none" });
        return;
    }

    this.socket.onOpen(function () {
        self.connected = true;
        self.retry = 0;
        console.log("[Net] 已连接", self.url());
        if (self.openCallback) {
            var fn = self.openCallback;
            self.openCallback = null;
            fn();
        }
    });

    this.socket.onMessage(function (res) {
        var msg;
        try {
            msg = JSON.parse(res.data);
        } catch (e) {
            return;
        }
        self.dispatch(msg);
    });

    this.socket.onClose(function () {
        self.connected = false;
        if (self.online) {
            wx.showToast({ title: "连接断开，正在重连…", icon: "none" });
            self.reconnect();
        }
    });

    this.socket.onError(function (e) {
        self.connected = false;
        console.error("[Net] 连接异常", e);
    });
};

Net_Singleton.prototype.reconnect = function () {
    var self = this;
    if (this.retry >= 5) {
        wx.showToast({ title: "无法连接服务器，请检查网络", icon: "none" });
        return;
    }
    this.retry++;
    setTimeout(function () {
        if (self.connected) return;
        self.openCallback = function () {
            if (self.roomCode) {
                self.send({ t: "join", code: self.roomCode, name: self.myName() });
            }
        };
        self.connect();
    }, 1000 * this.retry);
};

Net_Singleton.prototype.send = function (obj) {
    if (!this.connected || !this.socket) {
        console.warn("[Net] 未连接，消息丢弃", obj && obj.t);
        return false;
    }
    this.socket.send({ data: JSON.stringify(obj) });
    return true;
};

Net_Singleton.prototype.myName = function () {
    if (typeof Nick !== "undefined" && Nick.get) {
        return Nick.get();
    }
    return "玩家";
};

Net_Singleton.prototype.createRoom = function () {
    this.send({ t: "create", name: this.myName() });
};

Net_Singleton.prototype.joinRoom = function (code) {
    this.roomCode = String(code);
    this.send({ t: "join", code: String(code), name: this.myName() });
};

Net_Singleton.prototype.sendShot = function (angle, power) {
    this.seq++;
    this.send({ t: "shot", seq: this.seq, angle: angle, power: power });
};

Net_Singleton.prototype.sendBallInHand = function (x, y) {
    this.send({ t: "ballInHand", x: x, y: y });
};

Net_Singleton.prototype.leave = function () {
    if (this.online) {
        this.send({ t: "leave" });
    }
    this.online = false;
    this.roomCode = null;
    this.seat = -1;
    this.pendingSnapshot = null;
    NET_ON = false;
    NET_SEAT = 0;
};

Net_Singleton.prototype.dispatch = function (msg) {
    switch (msg.t) {
        case "room":
            this.roomCode = msg.code;
            this.seat = msg.seat;
            NET_SEAT = msg.seat;
            if (typeof Lobby !== "undefined") {
                Lobby.onRoom(msg.code, msg.seat);
            }
            break;

        case "start":
            this.roomCode = this.roomCode || msg.code;
            this.seat = msg.seat;
            NET_SEAT = msg.seat;
            NET_ON = true;
            this.online = true;
            this.seq = 0;
            this.pendingSnapshot = null;
            this.names = msg.names || null;
            Game.startOnlineMatch(msg.seat, msg.snapshot, msg.names);
            break;

        case "shotStart":
            // 对手出杆：本地同步播放，让画面立刻有反馈
            if (msg.by !== NET_SEAT && Game.gameWorld) {
                Game.policy.turnPlayed = true;
                Game.gameWorld.stick.visible = false;
                Game.gameWorld.whiteBall.shoot(msg.power, msg.angle);
            }
            break;

        case "shotResult":
            // 服务器裁决结果：等本地动画停下再套用，避免球飞到一半被瞬移
            this.pendingSnapshot = msg.snapshot;
            this.applyPendingIfIdle();
            break;

        case "state":
            this.pendingSnapshot = msg.snapshot;
            this.applyPendingIfIdle();
            break;

        case "opponentLeft":
            wx.showToast({ title: "对手已离开房间", icon: "none" });
            this.backToMenu();
            break;

        case "error":
            console.warn("[Net] 服务器提示:", msg.msg);
            wx.showToast({ title: msg.msg || "操作失败", icon: "none" });
            break;

        default:
            break;
    }
};

// 本地球还在动就先存着，停下后立刻套用服务器快照
Net_Singleton.prototype.applyPendingIfIdle = function () {
    if (!this.pendingSnapshot || !Game.gameWorld) return;
    if (Game.gameWorld.ballsMoving()) return;

    var snap = this.pendingSnapshot;
    this.pendingSnapshot = null;
    this.applySnapshot(snap);
};

Net_Singleton.prototype.applySnapshot = function (snap) {
    if (!snap || !Game.gameWorld) return;

    var world = Game.gameWorld;
    var balls = world.balls;

    for (var i = 0; i < balls.length && i < snap.balls.length; i++) {
        var b = balls[i];
        var s = snap.balls[i];
        b.position.x = s.x;
        b.position.y = s.y;
        b.inHole = !!s.h;
        b.visible = !!s.v;
        b.moving = false;
        b.velocity = Vector2.zero;
    }

    Game.policy.initiateState(snap.policy);

    world.stick.reset();

    // 犯规后轮到本方，允许摆自由球
    if (Game.policy.foul && Game.policy.turn === NET_SEAT) {
        world.stick.visible = false;
    }
};

Net_Singleton.prototype.backToMenu = function () {
    this.leave();
    GAME_STOPPED = true;
    DISPLAY = false;
    Game.initMenus(false);
    Game.mainMenu.load();
};

var Net = new Net_Singleton();
GameGlobal.Net = Net;
