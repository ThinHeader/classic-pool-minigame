// 自由球（犯规后摆白球）专项测试
// 重点回归：原实现 `whiteBall.position = Mouse.position` 是引用赋值，
// 触摸时 Mouse._position 每次移动都被替换成新对象 → 白球只跳一次、不跟手。
"use strict";

const path = require("path");
const PROJ = path.join(__dirname, "classic-pool-minigame");

global.GameGlobal = global;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);

function makeCtxStub() {
    return new Proxy({ _calls: [] }, {
        get(target, prop) {
            if (prop in target) return target[prop];
            target[prop] = () => undefined;
            return target[prop];
        },
        set(target, prop, value) { target[prop] = value; return true; }
    });
}

const ctxStub = makeCtxStub();
const canvasStub = { width: 0, height: 0, style: {}, getContext: () => ctxStub };

function makeImageStub() {
    const img = { width: 64, height: 64, onload: null };
    Object.defineProperty(img, "src", {
        set() { queueMicrotask(() => { if (img.onload) img.onload(); }); },
        get() { return ""; }
    });
    return img;
}

const touchHandlers = {};

global.wx = {
    createCanvas: () => canvasStub,
    getSystemInfoSync: () => ({ windowWidth: 800, windowHeight: 450, pixelRatio: 2 }),
    createImage: () => makeImageStub(),
    createInnerAudioContext: () => ({
        src: "", volume: 1, loop: false, autoplay: false,
        play() { }, pause() { }, destroy() { }, onEnded() { }, onError() { }
    }),
    onTouchStart: cb => { touchHandlers.start = cb; },
    onTouchMove: cb => { touchHandlers.move = cb; },
    onTouchEnd: cb => { touchHandlers.end = cb; },
    onTouchCancel: cb => { touchHandlers.cancel = cb; },
    loadSubpackage: ({ success }) => { success(); }
};

require(path.join(PROJ, "game.js"));

const G = global;

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log("  ✓ " + name + (extra ? "  (" + extra + ")" : "")); }
    else { fail++; console.log("  ✗ " + name + (extra ? "  (" + extra + ")" : "")); }
}

function fireTouch(type, gameX, gameY) {
    const scale = G.Canvas2D.scale;
    const offset = G.Canvas2D.offset;
    const dpr = 2;
    touchHandlers[type]({
        changedTouches: [{
            clientX: (gameX * scale + offset.x) / dpr,
            clientY: (gameY * scale + offset.y) / dpr
        }]
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(fn, timeout = 15000, label = "") {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fn()) return true;
        await sleep(50);
    }
    console.log("  ! 等待超时 " + label);
    return false;
}

(async function main() {
    console.log("[1] 启动并进入双人对局");
    const ready = await waitUntil(() => G.Game.mainMenu && G.Game.mainMenu.active === true, 20000, "主菜单");
    check("主菜单已就绪", ready);

    fireTouch("start", 300, 330);   // 双人对战
    fireTouch("end", 300, 330);

    const started = await waitUntil(() => G.Game.gameWorld && G.DISPLAY === true && !G.GAME_STOPPED, 12000, "开局");
    check("对局已开始", started);

    // 开局有 5 秒中文操作说明页，主循环结束后才开始跑物理帧
    console.log("    等待 5 秒操作说明页结束…");
    await sleep(6000);
    check("主循环已在跑物理帧", await waitUntil(() => G.Game.gameWorld.stick.shooting === false, 3000));

    const world = G.Game.gameWorld;
    const policy = G.Game.policy;

    // 制造一次犯规（白球落袋 = 自由球），并让它进入「待摆球」状态
    console.log("[2] 触发犯规 → 应自动进入自由球状态");
    policy.turnPlayed = false;
    policy.foul = true;

    const entered = await waitUntil(() => world.freeBall.active === true, 3000, "自由球状态");
    check("进入自由球状态", entered);
    check("白球重新可见（不再停在袋里/桌外）",
        world.whiteBall.visible === true && world.whiteBall.inHole === false);
    check("球杆被隐藏（此时不能出杆）", world.stick.visible === false);

    const homeX = Math.round(world.whiteBall.position.x);
    const homeY = Math.round(world.whiteBall.position.y);
    check("白球被放到台面内", homeX > 76 && homeX < 1424 && homeY > 76 && homeY < 749,
        "(" + homeX + "," + homeY + ")");

    // ---- 跟手性回归：分三次移动，白球应每次都跟上 ----
    console.log("[3] 按住拖动：白球必须逐帧跟手（原实现只跟一次）");
    fireTouch("start", 500, 300);
    await sleep(120);
    const p1 = { x: Math.round(world.whiteBall.position.x), y: Math.round(world.whiteBall.position.y) };
    check("第一次移动白球跟随", Math.abs(p1.x - 500) < 6 && Math.abs(p1.y - 300) < 6,
        "(" + p1.x + "," + p1.y + ")");

    fireTouch("move", 700, 420);
    await sleep(120);
    const p2 = { x: Math.round(world.whiteBall.position.x), y: Math.round(world.whiteBall.position.y) };
    check("第二次移动白球继续跟随", Math.abs(p2.x - 700) < 6 && Math.abs(p2.y - 420) < 6,
        "(" + p2.x + "," + p2.y + ")");

    fireTouch("move", 900, 560);
    await sleep(120);
    const p3 = { x: Math.round(world.whiteBall.position.x), y: Math.round(world.whiteBall.position.y) };
    check("第三次移动白球继续跟随", Math.abs(p3.x - 900) < 6 && Math.abs(p3.y - 560) < 6,
        "(" + p3.x + "," + p3.y + ")");

    check("自由球期间没有被误当成击球", policy.turnPlayed === false && world.freeBall.active === true);

    // ---- 夹边：拖到桌外应被夹在台面内 ----
    console.log("[4] 拖到桌外：白球应被夹在台面内");
    fireTouch("move", -400, -400);
    await sleep(120);
    const clamped = world.whiteBall.position;
    check("白球不会飞出桌外",
        clamped.x >= 76 && clamped.x <= 1424 && clamped.y >= 76 && clamped.y <= 749,
        "(" + Math.round(clamped.x) + "," + Math.round(clamped.y) + ")");

    // ---- 非法落点：压在别的球上，松手应回弹并保持自由球 ----
    console.log("[5] 松手在别的球上：应回弹并保持自由球状态");
    const other = world.balls.find((b) => b !== world.whiteBall && !b.inHole);
    fireTouch("start", other.position.x, other.position.y);
    await sleep(120);
    fireTouch("end", other.position.x, other.position.y);
    await sleep(250);

    const afterReject = world.whiteBall.position;
    const overlap = world.balls.some((b) => b !== world.whiteBall && !b.inHole &&
        afterReject.distanceFrom(b.position) < G.BALL_SIZE - 0.5);
    check("非法落点被拒绝（白球弹回合法位置）", overlap === false,
        "(" + Math.round(afterReject.x) + "," + Math.round(afterReject.y) + ")");
    check("仍处于自由球状态，可以继续摆", world.freeBall.active === true && policy.foul === true);

    // ---- 合法落点：松手应完成放置 ----
    console.log("[6] 松手在空位：完成放置并恢复出杆");
    const legal = world.freeBallHome();
    fireTouch("start", legal.x, legal.y);
    await sleep(120);
    fireTouch("end", legal.x, legal.y);
    await sleep(300);

    check("自由球状态结束", world.freeBall.active === false);
    check("犯规已清除", policy.foul === false);
    check("球杆重新出现、可以出杆", world.stick.visible === true);
    check("白球停在放置点",
        Math.abs(world.whiteBall.position.x - legal.x) < 6 &&
        Math.abs(world.whiteBall.position.y - legal.y) < 6,
        "(" + Math.round(world.whiteBall.position.x) + "," + Math.round(world.whiteBall.position.y) + ")");

    // ---- 放置完成后应该能正常击球 ----
    console.log("[7] 放置后正常击球");
    fireTouch("start", 700, 413);
    await sleep(80);
    for (let i = 1; i <= 6; i++) {
        fireTouch("move", 700 + i * 30, 413);
        await sleep(40);
    }
    fireTouch("end", 880, 413);
    await sleep(400);
    check("放置后可以正常出杆", policy.turnPlayed === true || world.whiteBall.moving === true);

    console.log("\n" + (fail === 0 ? "===== 自由球测试 PASS =====" : "===== 自由球测试 FAIL ====="));
    console.log("通过 " + pass + " 项，失败 " + fail + " 项");
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
    console.error("测试异常:", e);
    process.exit(1);
});
