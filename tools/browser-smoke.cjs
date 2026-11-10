/* 真实浏览器冒烟测试 + 截图采集
 * 用法：node tools/browser-smoke.cjs
 * 依赖：.tooling/node_modules/playwright-core（开发期工具，不随作品发布）
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', '.tooling', 'node_modules', 'playwright-core'));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({
    executablePath: EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox']
  });
  const errors = [], logs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); else logs.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '01-封面.png') });

  // 启动游戏
  await page.click('#btn-start');
  await page.waitForTimeout(550);
  await page.screenshot({ path: path.join(OUT, '02-开局.png') });

  // 走三步真实交互
  const topics = ['hour', 'hour', 'origin'];
  for (let i = 0; i < topics.length; i++) {
    await page.click(`[data-guest="g${i}"]`);
    await page.click(`[data-topic="${topics[i]}"]`);
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '03-对局与AI决策面板.png') });

  // 摊开比对
  await page.click('#btn-compare');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '04-证据比对.png') });
  await page.click('[data-action="close-modal"]');

  // 工程自检弹窗（回到封面后从入口打开）
  await page.click('#btn-home');
  await page.waitForTimeout(220);
  await page.click('[data-modal="selftest"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '05-工程自检.png') });
  await page.click('[data-action="close-modal"]');
  await page.click('#btn-continue');
  await page.waitForTimeout(280);

  // API 层校验
  const api = await page.evaluate(() => {
    const A = window.SANDENG_API;
    const st = A.getState();
    const acts = A.listActions();
    const rep = A.selftest(60);
    const tr = A.trace('API_TRACE', 3);
    const snap = A.create('SNAP', 2);
    const snapStr = JSON.stringify(A.dispatchPure(snap, { type: 'ASK', guestId: 'g0', topic: snap.cs.lieTopic, tone: 'warm' }));
    return {
      hasState: !!st, stateSchema: st && st.schema,
      actionCount: acts.length,
      selftest: rep.summary,
      trace: { seed: tr.seed, steps: tr.steps, correct: tr.correct },
      dispatchOk: snapStr.indexOf('"ok":true') >= 0,
      version: A.version
    };
  });

  // 走完一整夜直到结算
  for (let i = 0; i < 8; i++) {
    const ended = await page.evaluate(() => window.SANDENG_APP.game.phase === 'ended');
    if (ended) break;
    await page.evaluate(() => {
      const A = window.SANDENG_APP;
      const a = window.SD.Agent.choose(A.game);
      const r = window.SD.Game.dispatch(A.game, a);
      if (r.decision) A.lastDecision = r.decision;
      window.SD.UI.paint(A);
      if (A.game.phase === 'ended' && !A.ended) document.getElementById('btn-accuse') && null;
    });
    await page.waitForTimeout(120);
  }
  // 用界面按钮触发结算屏
  const resultVisible = await page.evaluate(() => {
    const A = window.SANDENG_APP;
    if (A.game.phase === 'ended' && !A.ended) {
      // 模拟主流程收尾
      A.ended = true;
      A.session.totalScore += A.game.result.score;
      A.session.nights.push({ night: A.game.night, ending: A.game.result.ending, correct: A.game.result.correct, score: A.game.result.score, chain: A.game.result.chain, lampsLeft: A.game.result.lampsLeft, seed: A.game.seed });
      window.SD.UI.paintResult(A);
      window.SD.UI.showScreen('screen-result');
      return true;
    }
    return false;
  });
  await page.waitForTimeout(350);
  if (resultVisible) await page.screenshot({ path: path.join(OUT, '06-单夜结算.png') });

  // 移动端
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errors.push('MOBILE PAGEERROR: ' + e.message));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForTimeout(500);
  await mp.click('#btn-start');
  await mp.waitForTimeout(450);
  await mp.screenshot({ path: path.join(OUT, '07-移动端对局.png'), fullPage: true });

  const report = {
    generatedAt: new Date().toISOString(),
    url: URL, browser: 'Microsoft Edge (headless)', viewport: '1440x900 / 390x844',
    api, resultVisible, screenshots: fs.readdirSync(OUT).filter(f => f.endsWith('.png')),
    errors, logs: logs.slice(0, 20)
  };
  fs.writeFileSync(path.join(ROOT, 'tools', 'browser-smoke-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
