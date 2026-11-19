/**
 * 本地预览自动化验收（开发用）
 * 打开 http://127.0.0.1:5180/ ，检查渲染与控制台，模拟一次击球，产出截图。
 * 运行：node verify-preview.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:5180/';
const SHOTS = path.join(__dirname, 'shots');
const GAME_W = 1500, GAME_H = 825;

if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  (' + extra + ')' : '')); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  (' + extra + ')' : '')); }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--disable-gpu', '--mute-audio', '--no-sandbox']
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const errors = [];
    const missing = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const loc = msg.location();
            errors.push(msg.text() + (loc && loc.url ? ' @ ' + loc.url : ''));
        }
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('response', (res) => {
        if (res.status() >= 400) missing.push(res.status() + ' ' + res.url());
    });

    console.log('[1] 打开预览页 ' + URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 等待资源加载完成 + 主菜单激活
    await page.waitForFunction(() => {
        return window.Game && window.Game.mainMenu && window.Game.mainMenu.active === true
            && window.Game.spritesStillLoading === 0;
    }, { timeout: 30000 });
    await page.waitForTimeout(600);
    check('页面启动并进入主菜单', true);

    const bootHidden = await page.evaluate(() => {
        const el = document.getElementById('boot');
        return !el || el.classList.contains('hide');
    });
    console.log('  · 启动遮罩已隐藏:', bootHidden);

    // 画布尺寸与缩放
    const info = await page.evaluate(() => {
        const c = document.getElementById('game');
        return {
            cw: c.width, ch: c.height,
            scale: window.Canvas2D.scale,
            offX: window.Canvas2D.offset.x,
            offY: window.Canvas2D.offset.y,
            ballCount: window.Game.gameWorld.balls.length,
            menuButtons: window.Game.mainMenu.buttons.map((b) => b.text || '(图标)')
        };
    });
    check('画布按 dpr 创建', info.cw > 0 && info.ch > 0, info.cw + 'x' + info.ch);
    check('球桌球数 = 16', info.ballCount === 16, '共 ' + info.ballCount + ' 颗');
    check('菜单中文按钮齐全', info.menuButtons.length >= 4, info.menuButtons.join(' / '));

    await page.screenshot({ path: path.join(SHOTS, 'preview-01-menu.png') });

    // 游戏逻辑坐标 -> 页面坐标
    const toPage = (gx, gy) => ({
        x: gx * info.scale + info.offX,
        y: gy * info.scale + info.offY
    });

    console.log('[2] 点击「双人对战」');
    const btn = toPage(420, 305);
    await page.mouse.move(btn.x, btn.y);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();

    await page.waitForTimeout(700);
    const entered = await page.evaluate(() => ({
        menuActive: window.Game.mainMenu.active,
        stopped: window.GAME_STOPPED
    }));
    check('已离开菜单进入对局流程', entered.menuActive === false && entered.stopped === false);

    // 等 5 秒操作说明页过去
    await page.waitForTimeout(6000);
    const running = await page.evaluate(() => ({
        display: window.DISPLAY,
        stopped: window.GAME_STOPPED,
        stickVisible: window.Game.gameWorld.stick.visible,
        turn: window.Game.policy.turn
    }));
    check('主循环运行中（DISPLAY=true）', running.display === true && running.stopped === false);
    check('球杆已显示，等待击球', running.stickVisible === true);
    await page.screenshot({ path: path.join(SHOTS, 'preview-02-table.png') });

    console.log('[2.5] 校验右上角「菜单」按钮避开系统胶囊与袋口');
    const layout = await page.evaluate(() => {
        const r = window.Game.menuButtonRect();
        const c = window.Canvas2D.getCapsuleRect();
        const hole = window.Game.policy.topRightHolePos;
        return {
            menu: r,
            capsule: c,
            hidesCapsule: c ? !(r.x + r.w <= c.left || r.x >= c.right) : false,
            hidesPocket: (r.x + r.w) > (hole.x - 46)
        };
    });
    check('菜单按钮不与系统胶囊重叠', layout.hidesCapsule === false,
        '按钮右缘 ' + Math.round(layout.menu.x + layout.menu.w)
        + (layout.capsule ? ' / 胶囊左缘 ' + Math.round(layout.capsule.left) : ' / 无胶囊'));
    check('菜单按钮不压右上袋口', layout.hidesPocket === false,
        '按钮右缘 ' + Math.round(layout.menu.x + layout.menu.w) + ' / 袋口左缘 ' + (1435 - 46));

    console.log('[3] 拖动瞄准并击球（按下 → 跨帧拖动 → 松手）');
    const before = await page.evaluate(() => window.Game.gameWorld.whiteBall.position.x);
    const p1 = toPage(560, 413);
    const p2 = toPage(880, 413);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(p1.x + (p2.x - p1.x) * i / 12, p1.y);
        await page.waitForTimeout(28);
    }
    await page.waitForTimeout(120);
    const power = await page.evaluate(() => Math.round(window.Game.gameWorld.stick.power));
    await page.mouse.up();
    await page.waitForTimeout(1600);

    const after = await page.evaluate(() => ({
        x: window.Game.gameWorld.whiteBall.position.x,
        turnPlayed: window.Game.policy.turnPlayed,
        power: Math.round(window.Game.gameWorld.stick.power)
    }));
    check('蓄力生效', power > 5, '力度 ' + power);
    check('松手后白球被击出', Math.abs(after.x - before) > 20,
        '白球 ' + before.toFixed(0) + ' → ' + after.x.toFixed(0));
    await page.screenshot({ path: path.join(SHOTS, 'preview-03-shot.png') });

    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(SHOTS, 'preview-04-after.png') });

    console.log('[4.5] 验证 HUD：玩家昵称/配色、已落袋球展示');
    const hud = await page.evaluate(() => {
        const p = window.Game.policy;
        const w = window.Game.gameWorld;
        p.setNames(['小嘟', '阿豪']);
        p.players[0].color = window.Color.yellow;
        p.players[1].color = window.Color.red;

        // 模拟双方各有进球：实心 1/3/5 与花色 10/13
        [1, 3, 5, 10, 13].forEach((n) => {
            const b = w.balls.find((x) => x.number === n);
            if (b) { b.inHole = true; b.visible = false; }
        });
        p.players[0].matchScore.value = 3;
        p.players[1].matchScore.value = 2;

        return {
            names: p.players.map((x) => x.name),
            accents: p.players.map((x) => x.accent),
            pocketed: w.balls.filter((b) => b.inHole).map((b) => b.number).sort((a, b) => a - b)
        };
    });
    check('玩家昵称已应用', hud.names[0] === '小嘟' && hud.names[1] === '阿豪', hud.names.join(' / '));
    check('两名玩家配色不同', hud.accents[0] !== hud.accents[1], hud.accents.join(' / '));
    check('落袋球统计正确', hud.pocketed.join(',') === '1,3,5,10,13', hud.pocketed.join(','));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'preview-08-hud.png') });

    console.log('[4.7] 验证昵称本地缓存：改完重开仍在、超长截断');
    const nickState = await page.evaluate(() => {
        const N = window.GameGlobal.Nick;
        const backup = { main: N.get(), second: N.getSecond() };

        N.set('缓存验证甲');
        N.setSecond('缓存验证乙');
        // 模拟重启：清掉内存缓存，只能从 storage 读回
        N._cached = null;
        N._cached2 = null;

        const result = {
            main: N.get(),
            second: N.getSecond(),
            storedMain: wx.getStorageSync('playerNickname'),
            storedSecond: wx.getStorageSync('playerNickname2'),
            clipped: N.set('一二三四五六七八九十十一'),
            // 12 个 emoji 应截成 10 个完整字符，而不是 10 个 UTF-16 码元（会劈出半个）
            emoji: N.set('🎱🎱🎱🎱🎱🎱🎱🎱🎱🎱🎱🎱')
        };

        // 还原现场，避免影响后面的用例
        N.set(backup.main);
        N.setSecond(backup.second);
        return result;
    });
    check('昵称重启后从本地缓存读回', nickState.main === '缓存验证甲' && nickState.storedMain === '缓存验证甲',
        nickState.storedMain || '空');
    check('玩家 2 昵称同样持久化', nickState.second === '缓存验证乙' && nickState.storedSecond === '缓存验证乙',
        nickState.storedSecond || '空');
    check('超长昵称截断到 10 字', nickState.clipped === '一二三四五六七八九十', nickState.clipped);
    check('emoji 截断不产生半个字符', nickState.emoji === '🎱🎱🎱🎱🎱🎱🎱🎱🎱🎱',
        nickState.emoji + ' (' + Array.from(nickState.emoji).length + ' 字)');

    console.log('[4.6] 验证自由球视觉提示');
    await page.evaluate(() => {
        const p = window.Game.policy;
        p.turnPlayed = false;
        p.foul = true;
    });
    await page.waitForFunction(() => window.Game.gameWorld.freeBall.active === true, { timeout: 5000 });
    check('自由球状态已进入', true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'preview-09-freeball.png') });

    console.log('[5] 检查控制台与资源请求');
    const realErrors = errors.filter((e) =>
        !/AudioContext|play\(\) failed|NotAllowedError|user gesture/i.test(e));
    check('无 JS 运行时报错', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));
    check('无资源 404', missing.length === 0, missing.slice(0, 2).join(' | '));

    await browser.close();

    console.log('\n' + (fail === 0 ? '===== 预览验收 PASS =====' : '===== 预览验收 FAIL ====='));
    console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项，截图在 shots/');
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
    console.error('验收脚本异常:', e.message);
    process.exit(1);
});
