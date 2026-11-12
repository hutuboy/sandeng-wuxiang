/* G5 几何探针：报告气泡与各高亮洞的矩形，判定重叠来源 */
const path = require('path');
/* 依赖随作品发布的 .tooling/node_modules（开发期工具，不进仓库、不进部署） */
const { chromium } = require(path.join(__dirname, '..', '.tooling', 'node_modules', 'playwright-core'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL_BASE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE });
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(URL_BASE + '?seed=GEOM5&night=1&guide=1');
    await page.waitForTimeout(700);
    // 走到 G5
    for (let i = 0; i < 4; i++) {
      if (await page.$('#btn-guide-next')) { await page.click('#btn-guide-next'); await page.waitForTimeout(320); }
    }
    const info = await page.evaluate(() => {
      const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const holes = [...document.querySelectorAll('.guide-hole')].map(h => r(h));
      const bub = r(document.querySelector('#guide-bubble'));
      const inter = (a, c) => (a && c) ? Math.max(0, Math.min(a.r, c.r) - Math.max(a.l, c.l)) * Math.max(0, Math.min(a.b, c.b) - Math.max(a.t, c.t)) : 0;
      return {
        step: document.querySelector('#guide-bubble .gb-step') ? document.querySelector('#guide-bubble .gb-step').textContent : '',
        bubble: bub, holes,
        overlaps: holes.map(h => inter(bub, h)),
        clue: r(document.querySelector('#clue-list')), stmt: r(document.querySelector('#statement-list')),
        listPanel: r(document.querySelector('#clue-list') && document.querySelector('#clue-list').closest('.panel'))
      };
    });
    console.log(vp.width, JSON.stringify(info));
    await page.close();
  }
  await browser.close();
})();
