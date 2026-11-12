/* 逻辑层 v2（P2）· 视觉复核（开发期脚本，不随作品发布）
 * 用法：node .tooling/logic-v2-shot.cjs
 * 产出：docs/screenshots/logicv2-*.png + 几何/文案体检
 * 检查点：① 残卷块（式子 + 一句话）是否在推演台顶部；② 换算子后结论是否变；
 *        ③ 高级档残卷 = ⊕、初级 = ∨；④ 窄屏不溢出。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', '.tooling', 'node_modules', 'playwright-core'));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const log = (...a) => console.log(' ', ...a);

async function startAt(page, tier) {
  await page.goto(URL + '?seed=LOGIC-V2&guide=0', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  if (tier) await page.click('[data-action="set-tier"][data-tier="' + tier + '"]');
  await page.click('#btn-start');
  await page.waitForTimeout(320);
}

async function askSome(page, n) {
  // 问 n 句，让表里有 ✓ / ✗ / ? 三种格子。
  // 注意灯数：高级档 n1 只有 4 盏，问满就「灯灭」直接进结算屏，拍不到推演台。
  const seq = [['g0', 'hour'], ['g1', 'hour'], ['g2', 'origin'], ['g0', 'origin']];
  for (const [g, t] of seq.slice(0, n)) {
    await page.click('[data-guest="' + g + '"]');
    await page.click('[data-topic="' + t + '"]');
    await page.waitForTimeout(150);
  }
}

async function boardText(page) {
  return page.evaluate(() => {
    const b = document.querySelector('#logic-stage .logic-board');
    if (!b) return null;
    const q = s => { const e = b.querySelector(s); return e ? e.textContent.trim() : null; };
    return {
      scrollExpr: q('.lg-expr'),
      gloss: q('.lg-gloss'),
      tag: q('.lg-tag'),
      verdict: q('.logic-verdict'),
      warn: q('.lg-warn'),
      foot: Array.from(b.querySelectorAll('.lg-foot')).map(e => e.textContent.trim()),
      activeOp: (b.querySelector('.opbtn.on span') || {}).textContent || null,
      scrollTop: Math.round(b.querySelector('.lg-scroll').getBoundingClientRect().top),
      boardTop: Math.round(b.getBoundingClientRect().top),
      overflowX: b.scrollWidth > b.clientWidth + 1
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));

  // ---- 桌面 · 高级档（残卷 = ⊕） ----
  await startAt(page, 'advanced');
  await askSome(page, 2);
  await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(OUT, 'logicv2-adv-xor.png') });
  let s = await boardText(page);
  log('高级档 · 默认算子:', JSON.stringify(s));

  // 换成 ∧，看结论是否变成「指错人 / 命中两人」
  await page.locator('#logic-stage .opbtn[data-op="AND"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'logicv2-adv-and.png') });
  const s2 = await boardText(page);
  log('高级档 · 换成 ∧:', JSON.stringify({ verdict: s2.verdict, warn: s2.warn }));

  // ---- 弹窗版推演台 ----
  await page.click('#btn-logic');
  await page.waitForTimeout(300);
  const modal = await page.evaluate(() => !!document.querySelector('.modal-mask'));
  await page.screenshot({ path: path.join(OUT, 'logicv2-modal.png') });
  log('弹窗推演台可开:', modal);
  if (modal) await page.keyboard.press('Escape');

  // ---- 初级档（残卷 = ∨） ----
  await startAt(page, 'basic');
  await askSome(page, 3);
  await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(OUT, 'logicv2-basic-or.png') });
  log('初级档 · 默认算子:', JSON.stringify(await boardText(page)));

  // ---- 中级档（残卷 = ¬） ----
  await startAt(page, 'intermediate');
  await askSome(page, 3);
  await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(OUT, 'logicv2-int-nand.png') });
  log('中级档 · 默认算子:', JSON.stringify(await boardText(page)));

  // ---- 新手档：把前两处问全（8 盏灯够用），看「命中唯一」的正向文案 ----
  await startAt(page, 'novice');
  const topics = await page.evaluate(() => window.SANDENG_APP.game.cs.clues.slice(0, 2).map(c => c.topic));
  for (const g of ['g0', 'g1', 'g2']) {
    for (const t of topics) {
      await page.click('[data-guest="' + g + '"]');
      await page.click('[data-topic="' + t + '"]');
      await page.waitForTimeout(120);
    }
  }
  await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(OUT, 'logicv2-novice-hit.png') });
  log('新手档 · 问全两处:', JSON.stringify(await boardText(page)));

  // ---- 窄屏 ----
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  m.on('pageerror', e => errs.push(String(e.message)));
  await startAt(m, 'advanced');
  await m.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await m.waitForTimeout(260);
  await m.screenshot({ path: path.join(OUT, 'logicv2-m-adv.png') });
  const ms = await boardText(m);
  log('窄屏 · 高级档:', JSON.stringify({ expr: ms.scrollExpr, overflowX: ms.overflowX, docW: await m.evaluate(() => document.documentElement.scrollWidth) }));

  console.log('\npageerror:', errs.length ? errs : '[]');
  await browser.close();
})();
