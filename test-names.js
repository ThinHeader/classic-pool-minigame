// 批量测试小程序名称是否可用（只看名称字段的校验提示，不提交）
const { chromium } = require('playwright-core');

const CANDIDATES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['一杆清台', '撞球小馆', '绿呢球房', '八号球桌', '白球小馆', '台球小时光',
     '球房时光', '慢慢撞球', '撞一下球', '八号小馆', '蓝球台球', '角落球房'];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];
  const nameInput = page.locator('input.frm_input').nth(0);

  const usable = [];
  for (const name of CANDIDATES) {
    await nameInput.click();
    await nameInput.fill('');
    await page.keyboard.type(name, { delay: 40 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1600);

    const tip = await page.evaluate(() => {
      const inp = document.querySelector('input.frm_input');
      const box = inp.closest('.frm_controls') || inp.closest('.frm_control_group');
      return box ? (box.innerText || '').replace(/\s+/g, ' ').trim() : '';
    });

    const ok = /你的名字可以使用/.test(tip);
    if (ok) usable.push(name);
    console.log((ok ? 'OK  ' : 'NO  ') + name + (ok ? '' : '  -> ' + tip.slice(0, 40)));
  }

  console.log('\n可用：' + (usable.join('、') || '（无）'));
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
