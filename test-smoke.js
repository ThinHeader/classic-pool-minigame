// 无头冒烟测试：模拟微信小游戏运行环境，验证改造后的台球游戏可以
// 加载资源 → 进入主菜单 → 开局 → 触摸击球 → 物理跑帧，全程无异常。
// 仅用于本地验证，不属于小游戏工程文件。
"use strict";

const path = require("path");
const PROJ = path.join(__dirname, "classic-pool-minigame");

// ---------- 全局环境模拟 ----------
global.GameGlobal = global;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);

function makeCtxStub() {
    // 任何未显式定义的方法都返回 no-op 函数
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
const canvasStub = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctxStub
};

function makeImageStub() {
    const img = { width: 64, height: 64, onload: null };
    Object.defineProperty(img, "src", {
        set(v) {
            // 异步触发 onload，模拟真实图片加载
            queueMicrotask(() => { if (img.onload) img.onload(); });
        },
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
        play() { }, pause() { }, destroy() { },
        onEnded(cb) { }, onError(cb) { }
    }),
    onTouchStart: cb => { touchHandlers.start = cb; },
    onTouchMove: cb => { touchHandlers.move = cb; },
    onTouchEnd: cb => { touchHandlers.end = cb; },
    onTouchCancel: cb => { touchHandlers.cancel = cb; },
    loadSubpackage: ({ success }) => { success(); }
};

// ---------- 启动小游戏 ----------
require(path.join(PROJ, "game.js"));

const G = global;

let pass = true;
function check(name, cond) {
    console.log((cond ? "  ✓ " : "  ✗ ") + name);
    if (!cond) pass = false;
}

// 游戏坐标 → 模拟触点的逻辑屏幕坐标
function fireTouch(type, gameX, gameY) {
    const scale = G.Canvas2D.scale;
    const offset = G.Canvas2D.offset;
    const dpr = 2;
    const clientX = (gameX * scale + offset.x) / dpr;
    const clientY = (gameY * scale + offset.y) / dpr;
    touchHandlers[type]({ changedTouches: [{ clientX, clientY }] });
}

function waitFor(condFn, cb, timeoutMs) {
    const start = Date.now();
    const timer = setInterval(() => {
        if (condFn()) { clearInterval(timer); cb(); }
        else if (Date.now() - start > timeoutMs) {
            clearInterval(timer);
            console.error("  ✗ 等待超时: " + condFn.toString().slice(0, 60));
            process.exit(1);
        }
    }, 50);
}

console.log("[1] 等待资源加载完成、主菜单出现…");
waitFor(
    () => G.Game.gameWorld && G.Game.mainMenu.active === true,
    () => {
        check("画布已创建 (" + canvasStub.width + "x" + canvasStub.height + ")", canvasStub.width === 1600);
        check("主菜单已激活", G.Game.mainMenu.active === true);
        check("30 张贴图已加载", G.Game.spritesStillLoading === 0);
        check("音乐实例已创建(loop)", G.sounds.jazzTune.loop === true);

        console.log("[2] 点击「双人对战」开局…");
        fireTouch("start", 300, 330);
        fireTouch("end", 300, 330);

        setTimeout(() => {
            check("GAME_STOPPED 已解除", G.GAME_STOPPED === false);

            console.log("[3] 等待开局提示动画结束、主循环启动…");
            setTimeout(() => {
                const wp = G.Game.gameWorld.whiteBall;
                const x0 = wp.position.x;

                console.log("[4] 模拟拖动瞄准并松手击球（手势跨渲染帧，贴近真机节奏）…");
                fireTouch("start", 600, 413);
                setTimeout(() => {
                    fireTouch("move", 650, 413);
                    setTimeout(() => {
                        fireTouch("move", 700, 413);
                        setTimeout(() => {
                            fireTouch("end", 700, 413);
                        }, 150);
                    }, 150);
                }, 150);

                setTimeout(() => {
                    check("击杆后白球开始移动", wp.moving === true || Math.abs(wp.position.x - x0) > 5);
                    check("回合标记 turnPlayed = true", G.Game.policy.turnPlayed === true);

                    console.log("[5] 继续跑 12 秒物理帧（碰撞/落袋/回合切换）…");
                    setTimeout(() => {
                        check("主循环仍在运行", G.DISPLAY === true && G.GAME_STOPPED === false);
                        check("白球已停下", wp.moving === false);

                        console.log("[6] 点右上角「菜单」打开暂停菜单（验证中文文字按钮）…");
                        // 按钮位置会随系统胶囊/袋口动态让位，这里按实际矩形点它的中心
                        const menuRect = G.Game.menuButtonRect();
                        fireTouch("start", menuRect.x + menuRect.w / 2, menuRect.y + menuRect.h / 2);
                        fireTouch("end", menuRect.x + menuRect.w / 2, menuRect.y + menuRect.h / 2);
                        setTimeout(() => {
                            check("暂停菜单已打开", G.Game.mainMenu.active === true);

                            console.log("[7] 点「继续对局」返回对局…");
                            fireTouch("start", 300, 175);
                            fireTouch("end", 300, 175);
                            setTimeout(() => {
                                check("继续对局成功", G.GAME_STOPPED === false && G.Game.mainMenu.active === false);
                                console.log(pass ? "\n===== 冒烟测试 PASS =====" : "\n===== 冒烟测试 FAIL =====");
                                process.exit(pass ? 0 : 1);
                            }, 500);
                        }, 400);
                    }, 12000);
                }, 1000);
            }, 5400);
        }, 300);
    },
    15000
);
