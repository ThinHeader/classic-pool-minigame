// AI 分帧训练验证：进入「大师」模式（AI 先手），
// 检查训练期间主线程不被长时间阻塞（心跳间隔正常），且 AI 最终正常出杆。
"use strict";

const path = require("path");
const PROJ = path.join(__dirname, "classic-pool-minigame");

global.GameGlobal = global;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);

function makeCtxStub() {
    return new Proxy({}, {
        get(t, p) { if (p in t) return t[p]; t[p] = () => undefined; return t[p]; },
        set(t, p, v) { t[p] = v; return true; }
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
        volume: 1, loop: false, play() { }, pause() { }, destroy() { },
        onEnded() { }, onError() { }
    }),
    onTouchStart: cb => { touchHandlers.start = cb; },
    onTouchMove: cb => { touchHandlers.move = cb; },
    onTouchEnd: cb => { touchHandlers.end = cb; },
    onTouchCancel: cb => { touchHandlers.cancel = cb; },
    loadSubpackage: ({ success }) => success(),
    showToast() { }, setClipboardData() { }, shareAppMessage() { },
    connectSocket: () => ({ onOpen() { }, onMessage() { }, onClose() { }, onError() { }, send() { } })
};

require(path.join(PROJ, "game.js"));

const G = global;
let pass = true;
function check(name, cond, extra) {
    console.log((cond ? "  ✓ " : "  ✗ ") + name + (extra ? "  " + extra : ""));
    if (!cond) pass = false;
}

function fireTouch(type, gx, gy) {
    const s = G.Canvas2D.scale, o = G.Canvas2D.offset, dpr = 2;
    touchHandlers[type]({ changedTouches: [{ clientX: (gx * s + o.x) / dpr, clientY: (gy * s + o.y) / dpr }] });
}

function waitFor(fn, cb, timeoutMs) {
    const start = Date.now();
    const t = setInterval(() => {
        if (fn()) { clearInterval(t); cb(); }
        else if (Date.now() - start > timeoutMs) {
            clearInterval(t);
            console.error("  ✗ 超时");
            process.exit(1);
        }
    }, 50);
}

waitFor(() => G.Game.gameWorld && G.Game.mainMenu.active === true, () => {
    console.log("[1] 进入人机对战 → 大师（AI 先手）…");
    fireTouch("start", 300, 420);   // 人机对战
    fireTouch("end", 300, 420);

    setTimeout(() => {
        fireTouch("start", 300, 620); // 大师
        fireTouch("end", 300, 620);

        console.log("[2] 监测训练期间主线程阻塞情况…");
        let maxGap = 0, last = Date.now();
        const ticker = setInterval(() => {
            const now = Date.now();
            maxGap = Math.max(maxGap, now - last);
            last = now;
        }, 20);

        const t0 = Date.now();
        let aiShotSeen = false;
        let maxIter = 0;
        let trainDoneAt = 0;

        const poll = setInterval(() => {
            if (!G.AI.finishedSession && G.AI.iteration > 0) {
                aiShotSeen = true;
            }
            if (G.AI.iteration > maxIter) {
                maxIter = G.AI.iteration;
            }
            if (aiShotSeen && G.AI.finishedSession && !trainDoneAt) {
                trainDoneAt = Date.now() - t0;
            }
        }, 30);

        // 观测窗口：训练 300 次迭代在本机约 6 秒，给到 16 秒
        setTimeout(() => {
            clearInterval(ticker);
            clearInterval(poll);
            const policy = G.Game.policy;

            check("AI 训练过程已被观测到", aiShotSeen);
            check("训练期间无长阻塞（心跳最大间隔 < 250ms）", maxGap < 250, "实测 " + maxGap + "ms");
            check("训练持续加深（峰值迭代 > 100）", maxIter > 100, "峰值 " + maxIter);
            check("AI 训练结束并出杆", trainDoneAt > 0 && policy.turnPlayed === true,
                "训练耗时 " + trainDoneAt + "ms");
            check("分帧渲染函数存在", typeof G.AI.drawThinkingOverlay === "function");

            setTimeout(() => {
                console.log(pass ? "\n===== AI 测试 PASS =====" : "\n===== AI 测试 FAIL =====");
                process.exit(pass ? 0 : 1);
            }, 1000);
        }, 16000);
    }, 400);
}, 15000);
