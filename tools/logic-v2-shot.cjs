/* 推演幕 · 视觉与口径探针（P5）（开发期脚本，不随作品发布）
 * 用法：node tools/logic-v2-shot.cjs
 * 产出：docs/screenshots/p5-*.png + 口径体检
 *
 * P5 的口径变了，所以断言也变了：
 *   ① 残卷只给「破绽性质」，**不许**再出现式子（算子符号 ∧∨¬⊕ 与括号）——旧版正是这里把答案白送；
 *   ② 算子按钮（.opbtn）数量必须为 0；
 *   ③ 表尾有「不符处数」一行（性质要靠数出来才对得上）；
 *   ④ 四档残卷的性质文案与档位一致；
 *   ⑤ 「对簿」真实可点：一盏灯换至少一格，且入簿证词带［对簿］标记；
 *   ⑥ AI 掌柜审计是**点开才显示**的弹窗；
 *   ⑦ 窄屏 390 不横向溢出。
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
const fails = [];
function check(name, ok, detail) {
  if (!ok) fails.push({ name, detail });
  log((ok ? '✓ ' : '✗ ') + name, detail === undefined ? '' : JSON.stringify(detail));
}

async function startAt(page, tier) {
  await page.goto(URL + '?seed=P5-SHOT&guide=0', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  if (tier) await page.click('[data-action="set-tier"][data-tier="' + tier + '"]');
  await page.click('#btn-start');
  await page.waitForTimeout(320);
}

async function askSome(page, n) {
  const seq = [['g0', 'hour'], ['g1', 'hour'], ['g2', 'origin'], ['g0', 'origin']];
  for (const [g, t] of seq.slice(0, n)) {
    await page.click('[data-guest="' + g + '"]');
    await page.click('[data-topic="' + t + '"]');
    await page.waitForTimeout(140);
  }
}

async function boardText(page) {
  return page.evaluate(() => {
    const b = document.querySelector('#logic-stage .logic-board');
    if (!b) return null;
    const q = s => { const e = b.querySelector(s); return e ? e.textContent.trim() : null; };
    return {
      tag: q('.lg-tag'),
      kind: q('.lg-kind'),
      nature: q('.lg-expr'),
      verdict: q('.logic-verdict'),
      hasCountRow: !!b.querySelector('.lg-count'),
      countCells: Array.from(b.querySelectorAll('.lg-count td')).map(e => e.textContent.replace(/\s+/g, ' ').trim()),
      opbtn: b.querySelectorAll('.opbtn').length,
      hint: q('.lg-foot2'),
      overflowX: b.scrollWidth > b.clientWidth + 1
    };
  });
}

/* 残卷文案里不许出现式子：算子符号与「(…)」结构都算泄漏 */
const FORMULA_RE = /[∧∨¬⊕]/;
const NATURE = {
  novice: '有一处对不上，就是「无相」',
  basic: '处处都对不上，就是「无相」',
  intermediate: '并非处处对不上，就是「无相」',
  advanced: '恰好只错一处，就是「无相」'
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));

  /* ---- ①a 开局对话区不再写系统提示行 ---- */
  await startAt(page, 'basic');
  const opening = await page.evaluate(() => ({
    text: (document.getElementById('dialogue') || {}).textContent || '',
    systemLines: document.querySelectorAll('#dialogue .dline.sys').length
  }));
  check('开局对话区无系统提示行', opening.systemLines === 0 && opening.text.indexOf('三客投宿') < 0,
    opening.text.trim().slice(0, 24));

  /* ---- ① 四档残卷：只有性质，没有式子 ---- */
  for (const tier of ['novice', 'basic', 'intermediate', 'advanced']) {
    await startAt(page, tier);
    await askSome(page, 2);
    await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
    await page.waitForTimeout(240);
    await page.screenshot({ path: path.join(OUT, 'p5-' + tier + '-deduce.png') });
    const s = await boardText(page);
    check(tier + ' · 残卷无式子', !!s && !FORMULA_RE.test(s.nature || '') && !/[（(]/.test(s.nature || ''), s && s.nature);
    check(tier + ' · 性质与档位一致', !!s && (s.nature || '').indexOf(NATURE[tier]) >= 0, s && s.nature);
    check(tier + ' · 算子按钮已撤', !!s && s.opbtn === 0, s && s.opbtn);
    check(tier + ' · 表尾有「不符处数」', !!s && s.hasCountRow, s && s.countCells);
    check(tier + ' · 结论文案可读', !!s && /收口|同时合|还判不了|没有人合/.test(s.verdict || ''), s && s.verdict);
    check(tier + ' · 无横向溢出', !!s && !s.overflowX);
  }

  /* ---- ①b 第三夜：残卷多一条「改口」行为破绽 ---- */
  await page.goto(URL + '?seed=P5-SHOT&guide=0', { waitUntil: 'load' });
  await page.waitForTimeout(260);
  await page.evaluate(() => window.SANDENG_API.newRun('P5-SHOT', 3, 'basic'));
  await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await page.waitForTimeout(240);
  const n3 = await page.evaluate(() => {
    const b = document.querySelector('#logic-stage .logic-board');
    const g = b && b.querySelector('.lg-gloss');
    const e = b && b.querySelector('.lg-expr');
    return { nature: e ? e.textContent.trim() : null, drift: g ? g.textContent.trim() : null };
  });
  await page.screenshot({ path: path.join(OUT, 'p5-night3-drift.png') });
  check('第三夜 · 残卷多一条改口破绽', !!n3.drift && /说辞变了/.test(n3.drift), n3.drift);
  check('第三夜 · 主句仍是档位性质', (n3.nature || '').indexOf(NATURE.basic) >= 0, n3.nature);

  /* ---- ② 对簿：一盏灯换至多三格 ---- */
  await startAt(page, 'basic');
  const before = await page.evaluate(() => ({
    lamps: window.SANDENG_APP.game.lampsLeft,
    stmts: window.SANDENG_APP.game.statements.length,
    topic: window.SANDENG_APP.game.cs.clues[0].topic
  }));
  await page.screenshot({ path: path.join(OUT, 'p5-ask-confront.png') });
  const btnCount = await page.locator('#clue-list .clue-confront').count();
  check('问询幕 · 物证条上有「对簿」入口', btnCount >= 1, btnCount);
  await page.locator('#clue-list .clue-confront').first().click();
  await page.waitForTimeout(420);
  const after = await page.evaluate(() => ({
    lamps: window.SANDENG_APP.game.lampsLeft,
    stmts: window.SANDENG_APP.game.statements.length,
    marked: window.SANDENG_APP.game.statements.filter(s => s.byConfront).length,
    tags: Array.from(document.querySelectorAll('#statement-list .extra')).map(e => e.textContent.trim())
  }));
  check('对簿 · 恰好耗 1 盏灯', after.lamps === before.lamps - 1, { before: before.lamps, after: after.lamps });
  check('对簿 · 至少换回一格', after.stmts - before.stmts >= 1, { got: after.stmts - before.stmts });
  check('对簿 · 至多三格', after.stmts - before.stmts <= 3, { got: after.stmts - before.stmts });
  check('对簿 · 证词簿有［对簿］标记', after.tags.indexOf('［对簿］') >= 0, after.tags);
  await page.screenshot({ path: path.join(OUT, 'p5-after-confront.png') });

  /* ---- ③ 入口收敛：两个左栏弹窗按钮与问话提示已撤（v1.7.8） ---- */
  await page.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await page.waitForTimeout(200);
  const gone = await page.evaluate(() => ({
    compare: !!document.getElementById('btn-compare'),
    logic: !!document.getElementById('btn-logic'),
    hint: !!document.getElementById('guest-hint'),
    kbd: !!document.querySelector('.kbd-hint'),
    noModal: !document.querySelector('.modal-mask'),
    deduceLabel: (document.getElementById('btn-act-deduce') || {}).textContent || ''
  }));
  check('旧入口已撤 · 摊开比对 / AI 掌柜审计', !gone.compare && !gone.logic);
  check('旧提示已撤 · 正在问谁 / 1-2-3 与 QWERT 键位提示', !gone.hint && !gone.kbd);
  check('进推演幕不弹任何窗', gone.noModal);
  check('推演入口文案 = 「问完了 · AI推演」', gone.deduceLabel.trim() === '问完了 · AI推演', gone.deduceLabel.trim());

  /* ---- ③b 玩法说明：四档一律说判定句，不印算子（帮助菜单 → 玩法说明） ---- */
  await page.click('#btn-help');
  await page.waitForTimeout(220);
  await page.click('.modal-mask button[data-modal="howto"]');
  await page.waitForTimeout(320);
  const howto = await page.evaluate(() => {
    const mm = document.querySelector('.modal-mask');
    if (!mm) return null;
    const txt = mm.textContent;
    return {
      title: (mm.querySelector('.modal-head h3') || {}).textContent || '',
      tiers: ['有一处对不上，就是「无相」', '处处都对不上，就是「无相」',
        '并非处处对不上，就是「无相」', '恰好只错一处，就是「无相」'].filter(s => txt.indexOf(s) !== -1),
      leaksFormula: /[∧∨¬⊕]/.test(txt)
    };
  });
  await page.screenshot({ path: path.join(OUT, 'p5-howto.png') });
  check('玩法说明 · 四档都说判定句', !!howto && howto.tiers.length === 4, howto && howto.tiers.length + '/4');
  check('玩法说明 · 不印算子', !!howto && !howto.leaksFormula);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  /* ---- ③c 证词簿置顶 + 开夜提示框 ---- */
  /* 置顶那一行：只剩「✓ 找破绽：<判定句>」，件数/灯数已删（它们本来就在顶栏与物证条上） */
  const pin = await page.evaluate(() => {
    const el = document.getElementById('flaw-pin');
    if (!el) return null;
    const list = document.getElementById('statement-list');
    return {
      text: (el.textContent || '').replace(/\s+/g, ''),
      inLeft: !!el.closest('.col-left'),
      aboveList: !!(list && (el.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)),
      visible: el.getBoundingClientRect().height > 4
    };
  });
  const PIN_RE = /^✓找破绽：(有一处对不上|处处都对不上|并非处处对不上|恰好只错一处)$/;
  check('证词簿置顶 = 「✓ 找破绽：判定句」', !!pin && PIN_RE.test(pin.text), pin && pin.text);
  check('置顶挂在证词簿、压在证词之上', !!pin && pin.inLeft && pin.aboveList && pin.visible);
  check('置顶不再印件数 / 灯数', !!pin && !/件物证|盏灯/.test(pin.text));

  /* 开夜提示框：只有真人流程（无 seed / guide / autopilot 参数）才弹 */
  const seeded = await page.evaluate(() => !!document.querySelector('.modal-mask'));
  check('带 seed 参数不弹开夜框', !seeded);

  const nf = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  nf.on('pageerror', e => errs.push(String(e.message)));
  await nf.addInitScript(() => { try { localStorage.setItem('sandeng.guide.v1', 'skipped'); } catch (e) { } });
  await nf.goto(URL, { waitUntil: 'load' });
  await nf.waitForTimeout(260);
  await nf.click('[data-action="set-tier"][data-tier="intermediate"]');
  await nf.click('#btn-start');
  await nf.waitForTimeout(360);
  const nightModal = await nf.evaluate(() => {
    const mm = document.querySelector('.modal-mask');
    if (!mm) return null;
    return {
      title: (mm.querySelector('.modal-head h3') || {}).textContent || '',
      rule: (mm.querySelector('.nf-rule') || {}).textContent || '',
      body: mm.textContent,
      hasClose: !!mm.querySelector('[data-action="close-modal"]')
    };
  });
  await nf.screenshot({ path: path.join(OUT, 'p5-night-start.png') });
  check('开夜提示框 · 弹出', !!nightModal, nightModal && nightModal.title);
  check('开夜提示框 · 说今夜破绽（按档）',
    !!nightModal && /今夜「无相」的破绽：\s*并非处处对不上/.test(nightModal.rule.replace(/\s+/g, ' ')),
    nightModal && nightModal.rule.trim());
  check('开夜提示框 · 不印算子', !!nightModal && !/[∧∨¬⊕]/.test(nightModal.body));
  check('开夜提示框 · 可关闭', !!nightModal && nightModal.hasClose);
  await nf.keyboard.press('Escape');
  await nf.waitForTimeout(160);
  const nfClosed = await nf.evaluate(() => !document.querySelector('.modal-mask'));
  check('开夜提示框 · 关掉后不残留', nfClosed);
  /* 关掉开夜卡后直接落在「问询」幕：第①幕点灯已由卡片接替，不再单独开窗；
     幕条仍保留五步（① 显示为已过），所以这里只断言「窗口 data-act = ask」与五步条还在。 */
  const afterClose = await nf.evaluate(() => ({
    act: (document.getElementById('act-windows') || {}).dataset ? document.getElementById('act-windows').dataset.act : null,
    lampSection: !!document.querySelector('section.act[data-act="lamp"]'),
    steps: Array.from(document.querySelectorAll('#act-steps .act-step')).map(e => e.getAttribute('data-act-id')),
    lampCurrent: !!document.querySelector('#act-steps .act-step.on[data-act-id="lamp"]')
  }));
  await nf.screenshot({ path: path.join(OUT, 'p5-night-start-after.png') });
  check('关掉开夜卡 · 直接进问询幕', afterClose.act === 'ask' && !afterClose.lampSection, afterClose.act);
  check('幕条仍是五步、① 不再作为当前步',
    afterClose.steps.length === 5 && !afterClose.lampCurrent, afterClose.steps.join(','));
  await nf.close();

  /* 开夜框在 390 窄屏同样不横向溢出（新弹窗要跟别的一起过关） */
  const nfm = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  nfm.on('pageerror', e => errs.push(String(e.message)));
  await nfm.addInitScript(() => { try { localStorage.setItem('sandeng.guide.v1', 'skipped'); } catch (e) { } });
  await nfm.goto(URL, { waitUntil: 'load' });
  await nfm.waitForTimeout(240);
  await nfm.click('#btn-start');
  await nfm.waitForTimeout(340);
  await nfm.screenshot({ path: path.join(OUT, 'p5-night-start-m.png') });
  const nfmW = await nfm.evaluate(() => document.documentElement.scrollWidth);
  const nfmBox = await nfm.evaluate(() => {
    const el = document.querySelector('.modal-mask .modal');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), right: Math.round(r.right), vw: window.innerWidth };
  });
  check('开夜框 · 390 窄屏不溢出', nfmW <= 390 && !!nfmBox && nfmBox.right <= nfmBox.vw, { nfmW, nfmBox });
  await nfm.close();

  /* ---- ④ 窄屏 ---- */
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  m.on('pageerror', e => errs.push(String(e.message)));
  await startAt(m, 'advanced');
  await m.evaluate(() => window.SANDENG_API.setAct('deduce'));
  await m.waitForTimeout(240);
  await m.screenshot({ path: path.join(OUT, 'p5-m-adv.png') });
  const ms = await boardText(m);
  const docW = await m.evaluate(() => document.documentElement.scrollWidth);
  check('窄屏 390 · 不横向溢出', docW <= 390 && !!ms && !ms.overflowX, { docW });

  console.log('\npageerror:', errs.length ? errs : '[]');
  console.log('断言失败:', fails.length ? fails : '0');
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
