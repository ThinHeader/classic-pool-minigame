"use strict";

// 双人对战房间服务（微信小游戏 · 好友房模式）
//
// 设计要点：
//   1. 服务器权威：客户端只上行「击球参数（角度/力度）」，服务器用同一份物理代码算结果
//   2. 好友房码：房主创建 4 位房间码，好友凭码加入（不做匹配池）
//   3. 状态快照：每次结算下发完整球位 + 规则状态，客户端以服务器结果为准校正
//   4. 断线容错：座位断开后房间保留 2 分钟，重连同码可回到原座位
//
// 启动：node index.js   （默认 3010 端口，可用 PORT 环境变量覆盖）
// 生产建议：Caddy 反代 wss://你的域名/pool -> 127.0.0.1:3010

const http = require("http");
const { WebSocketServer } = require("ws");
const sim = require("./sim");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3010;
// 只监听回环地址：线上由 Caddy 反代进来，端口不对公网暴露
const HOST = process.env.HOST || "127.0.0.1";
const PATH = "/pool";
const ROOM_IDLE_MS = 2 * 60 * 1000;
const MAX_POWER = 75;

const rooms = new Map();

function log() {
    const args = Array.prototype.slice.call(arguments);
    console.log("[pool]", new Date().toISOString(), ...args);
}

function makeCode() {
    for (let i = 0; i < 500; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        if (!rooms.has(code)) return code;
    }
    return String(Date.now()).slice(-4);
}

// 昵称只保留可打印内容，最长 10 字，避免注入奇怪字符
function sanitizeName(value) {
    const text = String(value == null ? "" : value)
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();
    return text ? text.slice(0, 10) : "玩家";
}

function send(ws, obj) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
    }
}

function broadcast(room, obj, exceptSeat) {
    room.seats.forEach(function (ws, seat) {
        if (seat === exceptSeat) return;
        send(ws, obj);
    });
}

function createRoom() {
    const code = makeCode();
    const room = {
        code: code,
        seats: [null, null],
        // 双方昵称，开局随 start 一起下发，保证两端看到的名字一致
        names: ["玩家", "玩家"],
        state: null,
        // 每个座位独立计数：两个客户端的 seq 各自从 1 开始，不能共用一个游标
        lastSeq: [0, 0],
        createdAt: Date.now(),
        lastActive: Date.now(),
        timer: null
    };
    rooms.set(code, room);
    return room;
}

function startMatch(room) {
    room.state = sim.createState();
    room.lastSeq = [0, 0];
    room.lastActive = Date.now();

    const snap = sim.snapshot(room.state);

    room.seats.forEach(function (ws, seat) {
        send(ws, { t: "start", seat: seat, snapshot: snap, names: room.names });
    });

    log("对局开始", room.code);
}

function seatOf(room, ws) {
    return room.seats.indexOf(ws);
}

function removeClient(ws) {
    const room = ws._room;
    if (!room) return;

    const seat = seatOf(room, ws);
    if (seat >= 0) {
        room.seats[seat] = null;
        room.lastActive = Date.now();
        broadcast(room, { t: "opponentLeft", seat: seat });

        // 两边都走了就销毁
        if (room.seats[0] === null && room.seats[1] === null) {
            clearTimeout(room.timer);
            rooms.delete(room.code);
            log("房间销毁（无人）", room.code);
        } else {
            log("玩家离开", room.code, "座位", seat);
        }
    }
    ws._room = null;
}

function handleMessage(ws, msg) {
    switch (msg.t) {
        case "ping":
            send(ws, { t: "pong", now: Date.now() });
            return;

        case "create": {
            const room = createRoom();
            room.seats[0] = ws;
            room.names[0] = sanitizeName(msg.name);
            ws._room = room;
            ws._seat = 0;
            send(ws, { t: "room", code: room.code, seat: 0 });
            log("创建房间", room.code, room.names[0]);
            return;
        }

        case "join": {
            const code = String(msg.code || "").trim();
            const room = rooms.get(code);

            if (!room) {
                send(ws, { t: "error", msg: "房间不存在或已结束" });
                return;
            }
            if (seatOf(room, ws) >= 0) return;

            let seat = -1;
            if (room.seats[0] === null) seat = 0;
            else if (room.seats[1] === null) seat = 1;

            if (seat < 0) {
                send(ws, { t: "error", msg: "房间已满" });
                return;
            }

            room.seats[seat] = ws;
            room.names[seat] = sanitizeName(msg.name);
            room.lastActive = Date.now();
            ws._room = room;
            ws._seat = seat;

            send(ws, { t: "room", code: room.code, seat: seat });

            if (room.seats[0] && room.seats[1]) {
                startMatch(room);
            } else {
                // 回到一个空房间：把当前棋面同步给他
                if (room.state) {
                    send(ws, {
                        t: "start",
                        seat: seat,
                        snapshot: sim.snapshot(room.state),
                        names: room.names
                    });
                }
            }
            log("加入房间", room.code, "座位", seat, room.names[seat]);
            return;
        }

        case "shot": {
            const room = ws._room;
            if (!room || !room.state) return;

            const seat = seatOf(room, ws);
            if (seat < 0) return;

            const policy = room.state.policy;

            if (room.seats[0] === null || room.seats[1] === null) {
                send(ws, { t: "error", msg: "对手不在房间" });
                return;
            }
            if (policy.turn !== seat) {
                send(ws, { t: "error", msg: "还没到你出杆" });
                return;
            }
            if (policy.won) {
                send(ws, { t: "error", msg: "本局已结束" });
                return;
            }

            const seq = Number(msg.seq) || 0;
            if (seq <= room.lastSeq[seat]) {
                send(ws, { t: "error", msg: "重复的击球请求" });
                return;
            }

            const power = Number(msg.power);
            const angle = Number(msg.angle);

            if (!isFinite(power) || !isFinite(angle) ||
                power <= 0 || power > MAX_POWER || Math.abs(angle) > Math.PI * 4) {
                send(ws, { t: "error", msg: "击球参数非法" });
                return;
            }

            room.lastSeq[seat] = seq;
            room.lastActive = Date.now();

            // 先通知对手「开始出杆」，让对手也能看到球动
            broadcast(room, {
                t: "shotStart",
                by: seat,
                angle: angle,
                power: power
            }, seat);

            let result;
            try {
                result = sim.simulateShot(room.state, { angle: angle, power: power });
            } catch (e) {
                log("模拟失败", room.code, e.message);
                send(ws, { t: "error", msg: "服务器计算异常，请重开一局" });
                return;
            }

            broadcast(room, {
                t: "shotResult",
                by: seat,
                seq: seq,
                snapshot: result.snapshot
            });

            return;
        }

        case "ballInHand": {
            const room = ws._room;
            if (!room || !room.state) return;

            const seat = seatOf(room, ws);
            if (seat < 0 || room.state.policy.turn !== seat) return;

            const res = sim.setWhiteBall(room.state, Number(msg.x), Number(msg.y));
            if (!res.ok) {
                send(ws, { t: "error", msg: res.reason });
                return;
            }

            broadcast(room, { t: "state", snapshot: res.snapshot });
            return;
        }

        case "rematch": {
            const room = ws._room;
            if (!room || !room.state) return;
            if (!room.seats[0] || !room.seats[1]) {
                send(ws, { t: "error", msg: "对手已离开" });
                return;
            }
            startMatch(room);
            return;
        }

        case "leave": {
            removeClient(ws);
            return;
        }

        default:
            send(ws, { t: "error", msg: "未知消息类型" });
    }
}

const server = http.createServer(function (req, res) {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            rooms: rooms.size,
            uptime: Math.round(process.uptime())
        }));
        return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("8-ball pool room server\n");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", function (req, socket, head) {
    const url = req.url.split("?")[0];
    if (url !== PATH && url !== "/") {
        socket.destroy();
        return;
    }
    wss.handleUpgrade(req, socket, head, function (ws) {
        wss.emit("connection", ws, req);
    });
});

wss.on("connection", function (ws) {
    ws.isAlive = true;
    ws._room = null;
    ws._seat = -1;

    ws.on("pong", function () { ws.isAlive = true; });

    ws.on("message", function (raw) {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            send(ws, { t: "error", msg: "消息格式错误" });
            return;
        }
        try {
            handleMessage(ws, msg);
        } catch (e) {
            log("处理消息异常", e.message);
            send(ws, { t: "error", msg: "服务器内部错误" });
        }
    });

    ws.on("close", function () { removeClient(ws); });
    ws.on("error", function () { removeClient(ws); });
});

// 心跳：清掉半死连接
const heartbeat = setInterval(function () {
    wss.clients.forEach(function (ws) {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        try { ws.ping(); } catch (e) { }
    });

    const now = Date.now();
    rooms.forEach(function (room, code) {
        const empty = room.seats[0] === null && room.seats[1] === null;
        const idleTooLong = now - room.lastActive > ROOM_IDLE_MS;
        if (empty || (idleTooLong && !room.state)) {
            rooms.delete(code);
            log("房间清理", code);
        }
    });
}, 30000);

server.listen(PORT, HOST, function () {
    sim.boot();
    log("房间服务已启动", HOST + ":" + PORT, "路径", PATH);
});

function shutdown() {
    clearInterval(heartbeat);
    server.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(0); }, 3000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
