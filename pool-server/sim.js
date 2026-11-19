"use strict";

// 服务器端无头物理适配层。
// 直接复用 classic-pool-minigame/src 下的同一份物理与规则代码，
// 只把 wx / Canvas / 音频 / 广告 / AI 这些表现层依赖打成桩。
// 这样「客户端怎么算，服务器就怎么算」，不存在两套物理实现。

const path = require("path");
const fs = require("fs");

// 客户端物理源码的位置，两种布局都支持：
//   开发：<仓库根>/pool-server/sim.js + <仓库根>/classic-pool-minigame/src
//   部署：/opt/pool-server/sim.js + /opt/pool-server/classic-pool-minigame/src
function resolveSrc() {
    const candidates = [
        path.join(__dirname, "classic-pool-minigame", "src"),
        path.join(__dirname, "..", "classic-pool-minigame", "src")
    ];
    for (let i = 0; i < candidates.length; i++) {
        if (fs.existsSync(path.join(candidates[i], "GameWorld.js"))) {
            return candidates[i];
        }
    }
    return candidates[candidates.length - 1];
}

const SRC = resolveSrc();

let booted = false;
let timerQueue = [];
let virtualNow = 0;

function stubContext() {
    return new Proxy({}, {
        get(t, p) {
            if (p in t) return t[p];
            t[p] = () => undefined;
            return t[p];
        },
        set(t, p, v) { t[p] = v; return true; }
    });
}

function boot() {
    if (booted) return;
    booted = true;

    global.GameGlobal = global;

    // 物理与规则代码里用了 setTimeout（球落袋后隐藏、结算、重摆），
    // 服务器上必须可控推进，所以换成虚拟定时器队列，模拟结束后统一 flush。
    global.setTimeout = function (fn, ms) {
        timerQueue.push({ fn: fn, at: virtualNow + (ms || 0) });
        return 0;
    };
    global.clearTimeout = function () {};
    global.requestAnimationFrame = function () { return 0; };

    // ---- wx 桩 ----
    global.wx = {
        createImage: function () {
            return { width: 50, height: 50, set src(v) { }, onload: null };
        },
        createCanvas: function () {
            return { width: 1500, height: 825, getContext: stubContext };
        },
        createInnerAudioContext: function () {
            return {
                play() { }, pause() { }, destroy() { }, onEnded() { }, onError() { },
                volume: 1, loop: false, src: ""
            };
        },
        getSystemInfoSync: function () {
            return { windowWidth: 800, windowHeight: 450, pixelRatio: 1 };
        },
        connectSocket: function () { return null; },
        loadSubpackage: function (o) { if (o && o.success) o.success(); },
        onTouchStart() { }, onTouchMove() { }, onTouchEnd() { }, onTouchCancel() { }
    };

    require(path.join(SRC, "system/Color.js"));
    require(path.join(SRC, "geom/Vector2.js"));
    require(path.join(SRC, "Global.js"));

    // 以下桩必须在 Vector2 之后、其余模块之前就位
    const Vector2 = global.Vector2;

    global.Canvas2D = {
        clear() { }, drawText() { }, drawImage() { }, fillRect() { }, drawPoolBall() { },
        _canvas: null, _canvasContext: null, scale: 1, offset: new Vector2(0, 0)
    };
    global.sprites = {};
    global.Mouse = {
        position: new Vector2(0, 0),
        left: { down: false, pressed: false },
        reset() { this.left.down = false; this.left.pressed = false; }
    };
    global.Ad = {
        showBanner() { }, hideBanner() { }, showInterstitial() { }, showRewardedVideo() { }
    };
    global.AI = {
        finishedSession: true,
        startSession() { }, init() { }, train() { }, playTurn() { }
    };
    global.playSfx = function () { };
    global.Button = { drawBox() { } };
    global.Game = {
        size: new Vector2(1500, 825),
        sound: false,
        sfx: {},
        gameWorld: null,
        policy: null,
        mainMenu: { active: false }
    };

    // 服务器侧不要 AI 接管、不要声音、不要渲染
    GameGlobal.AI_ON = false;
    GameGlobal.SOUND_ON = false;
    GameGlobal.DISPLAY = false;
    GameGlobal.GAME_STOPPED = true;

    require(path.join(SRC, "game_objects/Score.js"));
    require(path.join(SRC, "game_objects/Player.js"));
    require(path.join(SRC, "game_objects/Ball.js"));
    require(path.join(SRC, "game_objects/Stick.js"));
    require(path.join(SRC, "GamePolicy.js"));
    require(path.join(SRC, "GameWorld.js"));
}

function flushTimers() {
    let guard = 0;
    while (timerQueue.length && guard++ < 500) {
        const t = timerQueue.shift();
        try {
            t.fn();
        } catch (e) {
            console.error("[sim] 定时器回调异常:", e.message);
        }
    }
    timerQueue = [];
    return guard;
}

// 创建一局新棋面
function createState() {
    boot();
    const world = new GameWorld();
    const policy = new GamePolicy();
    Game.gameWorld = world;
    Game.policy = policy;
    return { world: world, policy: policy };
}

function bind(state) {
    Game.gameWorld = state.world;
    Game.policy = state.policy;
}

// 球位快照（数组顺序与 GameWorld.balls 一致，客户端按索引对应）
function snapshot(state) {
    const world = state.world;
    const policy = state.policy;
    return {
        balls: world.balls.map(function (b) {
            return {
                n: b.number,
                x: Math.round(b.position.x * 100) / 100,
                y: Math.round(b.position.y * 100) / 100,
                h: b.inHole ? 1 : 0,
                v: b.visible ? 1 : 0
            };
        }),
        policy: {
            turn: policy.turn,
            firstCollision: policy.firstCollision,
            foul: policy.foul,
            scored: policy.scored,
            won: policy.won,
            turnPlayed: policy.turnPlayed,
            validBallsInsertedOnTurn: policy.validBallsInsertedOnTurn,
            players: [
                {
                    color: policy.players[0].color || null,
                    matchScore: { value: policy.players[0].matchScore.value },
                    totalScore: { value: policy.players[0].totalScore.value }
                },
                {
                    color: policy.players[1].color || null,
                    matchScore: { value: policy.players[1].matchScore.value },
                    totalScore: { value: policy.players[1].totalScore.value }
                }
            ]
        }
    };
}

// 模拟一杆：服务器权威计算，返回结果快照
// shot: { angle: 弧度, power: 0~75 }
function simulateShot(state, shot) {
    boot();
    bind(state);

    timerQueue = [];
    virtualNow = 0;

    const world = state.world;
    const policy = state.policy;

    policy.turnPlayed = true;
    world.stick.visible = false;
    world.stick.trackMouse = false;
    world.whiteBall.shoot(shot.power, shot.angle);

    // 全速把这一杆跑到所有球静止（不按 60fps 实时跑，几毫秒即可算完）
    let guard = 0;
    while (world.ballsMoving() && guard++ < 30000) {
        world.update(DELTA);
    }

    // 再来一帧触发回合结算（updateTurnOutcome 只在球停下后调用）
    world.update(DELTA);

    // 结算里的定时器（球出桌、白球复现、重摆）统一执行
    flushTimers();

    return {
        iterations: guard,
        snapshot: snapshot(state)
    };
}

// 自由球放置：服务器校验位置合法性
function setWhiteBall(state, x, y) {
    boot();
    bind(state);

    const world = state.world;
    const policy = state.policy;

    if (typeof x !== "number" || typeof y !== "number" ||
        !isFinite(x) || !isFinite(y)) {
        return { ok: false, reason: "位置非法" };
    }

    const pos = new Vector2(x, y);

    if (policy.isOutsideBorder(pos, world.whiteBall.origin) ||
        policy.isInsideHole(pos)) {
        return { ok: false, reason: "白球不能放在边框外或袋口" };
    }

    for (let i = 0; i < world.balls.length; i++) {
        const b = world.balls[i];
        if (b !== world.whiteBall && !b.inHole && pos.distanceFrom(b.position) < BALL_SIZE) {
            return { ok: false, reason: "白球与其他球重叠" };
        }
    }

    world.whiteBall.position = pos;
    world.whiteBall.inHole = false;
    world.whiteBall.visible = true;
    world.whiteBall.moving = false;
    world.whiteBall.velocity = Vector2.zero;
    world.stick.position = world.whiteBall.position;
    policy.foul = false;

    return { ok: true, snapshot: snapshot(state) };
}

function resetState(state) {
    boot();
    bind(state);
    state.world.reset();
    state.policy.reset();
    flushTimers();
    return snapshot(state);
}

module.exports = {
    boot: boot,
    createState: createState,
    simulateShot: simulateShot,
    setWhiteBall: setWhiteBall,
    resetState: resetState,
    snapshot: snapshot
};
