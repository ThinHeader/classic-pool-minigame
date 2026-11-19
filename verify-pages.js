// 线上 GitHub Pages 验收：加载 / 联机建房 / 进对局 / 击球（node verify-pages.js）
'use strict';
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://thinheader.github.io/classic-pool-minigame/';

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  (' + extra + ')' : '')); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  (' + extra + ')' : '')); }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: CHROME, headless: true,
        args: ['--disable-gpu', '--mute-audio', '--no-sandbox']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    const bad = [];
    const wsUrls = [];
    let wsFrames = 0;
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    page.on('websocket', (ws) => {
        wsUrls.push(ws.url());
        ws.on('framereceived', () => { wsFrames++; });
        ws.on('framesent', () => { wsFrames++; });
    });

    const t0 = Date.now();
    console.log('[1] 打开 ' + URL);
    await page.goto(URL, { waitUntil: 'load' });

    let ready = false;
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000);
        ready = await page.evaluate(() => {
            const g = window.GameGlobal && window.GameGlobal.Game;
            return !!(g && g.mainMenu && g.mainMenu.active);
        });
        if (ready) break;
    }
    const boot = ((Date.now() - t0) / 1000).toFixed(1);
    check('进入主菜单', ready, boot + 's');

    const info = await page.evaluate(() => ({
        scale: window.Canvas2D.scale,
        buttons: window.Game.mainMenu.buttons.map((b) => b.text)
    }));
    check('菜单按钮齐全', info.buttons.length >= 3, info.buttons.join(' / '));
    await page.screenshot({ path: 'shots/pages-online-menu.png' });

    // 联机：点「好友对战」看是否连到小程序共用的 wss
    console.log('[2] 打开好友对战');
    const toPage = (gx, gy) => ({ x: gx * info.scale, y: gy * info.scale + 8 });
    // 好友对战在菜单第三项，用按钮自身坐标定位
    const pos = await page.evaluate(() => {
        const b = window.Game.mainMenu.buttons.find((x) => x.text === '好友对战');
        return b && b.position ? { x: b.position.x, y: b.position.y } : null;
    });
    if (pos) {
        const c = toPage(pos.x + 100, pos.y + 25);
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.waitForTimeout(80);
        await page.mouse.up();
    }
    await page.waitForTimeout(4000);
    const ws = wsUrls.find((u) => /\/pool/.test(u));
    check('联机走小程序共用的 wss', !!ws && /wandou\.dongpouu\.top\/pool/.test(ws), ws || wsUrls.join(',') || '未发起连接');

    // 大厅连上后要再点「创建房间」才会真正和服务端交互
    const create = toPage(300, 365);
    await page.mouse.move(create.x, create.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(3000);
    const room = await page.evaluate(() => ({
        code: window.GameGlobal.Lobby.code || '',
        state: window.GameGlobal.Lobby.state,
        hint: window.GameGlobal.Lobby.hint || ''
    }));
    check('服务端下发了房间码', /^\d{4}$/.test(room.code), room.code ? '房号 ' + room.code : 'hint: ' + room.hint);
    check('WebSocket 有收发', wsFrames > 0, wsFrames + ' 帧');
    await page.screenshot({ path: 'shots/pages-online-lobby.png' });

    // 离开房间再回菜单，避免带着联机状态进对局
    await page.evaluate(() => window.GameGlobal.Net.leave());

    // 返回菜单 → 双人对战 → 击球
    console.log('[3] 双人对战 + 击球');
    await page.evaluate(() => { if (window.GameGlobal.Net) window.GameGlobal.Net.leave(); });
    await page.evaluate(() => {
        window.GameGlobal.Game.mainMenu.labels = [];
        window.GameGlobal.Game.mainMenu.buttons.forEach((b) => { b.text = b.text; });
    });
    await page.reload({ waitUntil: 'load' });
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000);
        if (await page.evaluate(() => !!(window.GameGlobal && window.GameGlobal.Game && window.GameGlobal.Game.mainMenu.active))) break;
    }
    const b2 = toPage(420, 305);
    await page.mouse.move(b2.x, b2.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    check('进入对局', await page.evaluate(() => !window.Game.mainMenu.active));

    await page.waitForTimeout(6500);
    const w = await page.evaluate(() => {
        const b = window.Game.gameWorld.whiteBall.position;
        return { x: b.x, y: b.y, stick: window.Game.gameWorld.stick.visible };
    });
    check('球杆显示等待出杆', w.stick === true);

    const from = toPage(w.x - 120, w.y + 60);
    const to = toPage(w.x - 260, w.y + 130);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
        await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6);
        await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(2000);
    const moved = await page.evaluate(() => window.Game.gameWorld.whiteBall.position.x);
    check('白球被击出', Math.abs(moved - w.x) > 5, w.x.toFixed(0) + ' → ' + moved.toFixed(0));
    await page.screenshot({ path: 'shots/pages-online-table.png' });

    check('无 4xx/5xx 资源', bad.length === 0, bad.slice(0, 3).join(' ; ') || '无');
    check('无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' ; ') || '无');

    console.log('\n' + (fail === 0 ? '===== GitHub Pages 验收 PASS =====' : '===== GitHub Pages 验收 FAIL ====='));
    console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
