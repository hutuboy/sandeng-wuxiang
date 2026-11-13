/* 物证条展开态探针：
   1) 点开 → 高度变大、全文可见
   2) 问一句话（触发整页 paint，innerHTML 被重写）→ 仍然是展开的
   3) 换夜 / 重开一局 → 复位成收起的
   用法：node tools/clue-toggle-probe.cjs */
const path = require('path');
/* 依赖随作品发布的 .tooling/node_modules（开发期工具，不进仓库、不进部署） */
const { chromium } = require(path.join(__dirname, '..', '.tooling', 'node_modules', 'playwright-core'));

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL_BASE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_BASE + '?seed=CLUE_TOGGLE&night=1');
  await page.waitForTimeout(500);
  if (await page.$('#btn-guide-skip')) await page.click('#btn-guide-skip');
  await page.waitForTimeout(200);
  // 保证在问询幕
  const act = await page.evaluate(() => document.querySelector('#act-windows').getAttribute('data-act'));

  const read = () => page.evaluate(() => {
    const c = document.querySelector('#clue-list .clue');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const t = c.querySelector('.clue-txt');
    return {
      open: c.classList.contains('open'),
      aria: c.getAttribute('aria-expanded'),
      w: Math.round(r.width),
      h: Math.round(r.height),
      clip: getComputedStyle(t).webkitLineClamp,
      scrollH: t.scrollHeight, clientH: t.clientHeight
    };
  });

  const closed = await read();
  await page.click('#clue-list .clue');
  await page.waitForTimeout(150);
  const opened = await read();

  // 问一句话，触发重绘
  await page.click('[data-guest="g0"]');
  await page.click('[data-topic="hour"]');
  await page.waitForTimeout(500);
  const afterAsk = await read();

  // 换夜 / 新局 → 复位
  await page.evaluate(() => window.SANDENG_API && window.SANDENG_API.newRun && window.SANDENG_API.newRun());
  await page.waitForTimeout(400);
  const afterNewRun = await page.evaluate(() => {
    const c = document.querySelector('#clue-list .clue');
    return c ? { open: c.classList.contains('open'), aria: c.getAttribute('aria-expanded') } : null;
  });

  const pass = !!closed && !!opened && !!afterAsk &&
    !closed.open && opened.open && opened.w > closed.w &&
    afterAsk.open && afterAsk.aria === 'true' &&
    (!afterNewRun || !afterNewRun.open);

  console.log(JSON.stringify({ closed, opened, afterAsk, afterNewRun, errors, pass }, null, 1));
  console.log(pass ? '=== clue-toggle PASS ===' : '=== clue-toggle FAIL ===');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
