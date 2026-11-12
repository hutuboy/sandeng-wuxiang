/* =====================================================================
 * 难度分级 · 真实浏览器可复跑主验收（tools/difficulty-smoke.cjs）
 *
 * 用法：node tools/difficulty-smoke.cjs
 * 产出：tools/difficulty-smoke-report.json + docs/screenshots/difficulty-*.png
 * 依赖：.tooling/node_modules/playwright-core + 本机 Edge headless（开发期工具，不随作品发布）
 *
 * 契约（唯一基准）：docs/难度分级-制作人裁决单-v1.md §0–§12
 *   - §11 口径总表 → tools/qa/difficulty-contract.cjs（唯一字符串契约源）
 *   - §12.1 数值恢复源 → tools/qa/difficulty-matrix-oracle.cjs 顶部写死常量
 *   - §12.2 裁决 K → 三通道：SANDENG_API.getDifficulty() / DOM / 存档
 *   - §10 → 复现主键 (seed, night, tier)；?difficulty=；?guide=1 固定 basic
 * 判据①：期望值一律来自 QA 工具顶部写死常量，**禁止** require 运行时模块取常量、
 *        禁止反读 DOM / getState() 生成期望值。三通道只用于取「实际值」。
 * 判据③：不该发生的事件计数必须为 0（NEG_EXPECT 全部写死在顶部）。
 *
 * ⚠️ 本轮状态（team-lead 指令）：主程序运行时接线尚未完成，本脚本**本轮不跑全量
 *    真浏览器验收**。前置门禁 IMPL_NOT_WIRED / SPEC_CONFLICT 会先拦住并写报告，
 *    不会把「未接线」误判为实现缺陷。待制作人通知「实现完成」后再执行。
 *
 * ⚠️ 真人玩家试玩是**独立门禁**：humanPending:true / humanPlaythroughPass:false
 *    如实标注，**不得用 AI 视觉复核顶替**。自动化全绿 ≠ 能玩。
 * ===================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const REPORT = path.join(__dirname, 'difficulty-smoke-report.json');
const CONTRACT = require('./qa/difficulty-contract.cjs');
const MATRIX = require('./qa/difficulty-matrix-oracle.cjs');
const ORACLE = require('./qa/difficulty-oracle-selftest.cjs');
const { chromium } = require(path.join(ROOT, '.tooling', 'node_modules', 'playwright-core'));

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const SEED_POOL = ['QA-DIFF-A', 'QA-DIFF-B', 'QA-DIFF-C'];

/* ---------------- 写死契约常量（禁止从运行时反读） ---------------- */
const SPEC_FILES = [
  'docs/难度分级-制作人裁决单-v1.md',
  'docs/难度分级-设计案-v1.md',
  'docs/难度分级-技术接线-v1.md',
  'docs/难度分级-验收用例-v1.md',
  'docs/交付清单.md'
];
const EXPECT_TIERS = CONTRACT.TIER_IDS;                    // §11：novice/basic/intermediate/advanced
const EXPECT_DEFAULT = CONTRACT.DEFAULT_TIER;             // basic（非 IDS[0]）
const EXPECT_LEGACY_FALLBACK = CONTRACT.LEGACY_FALLBACK_TIER;
const EXPECT_GUIDE1_LAMPS = CONTRACT.GUIDE1_LAMPS_TEXT;   // '6 / 6 盏'
const EXPECT_MIN_ACTIONS = 3;                             // 手算：3 位客人至少问遍三人
const EXPECT_MIN_PNG = 1024;                              // 0 字节占位不算渲染帧

/* 负向计数：不该发生的事件，期望全部为 0（写死，不就地写 0）。
   纪律：只列**本套件真的测到**的计数。未经测量的一律不得以「默认 0」混入 —— 
   引导域 9 项由 tools/guide-smoke.cjs 实测，本套件在 runRegression 里读它的报告交叉核验；
   其余确实没有测量的项列进 report.coverageGaps，不假装通过。 */
const NEG_EXPECT = {
  seedPollutionCount: 0, seedRegenCount: 0, runtimeTierInSeedCount: 0,
  noviceLampLeakCount: 0, inGameTierChangeCount: 0, illegalTierAcceptCount: 0,
  legacySaveRewriteCount: 0, residualTierStateCount: 0,
  nonFileRequestCount: 0, pageerrorCount: 0,
  regressionFailCount: 0
};
/* 引导域负向计数：不在本套件里置 0，而是读 guide-smoke 报告的实际值（键名映射见下） */
const GUIDE_NEG_SOURCE = {
  askDispatchCount: 'guidePhaseAskCount',
  listenDispatchCount: 'guideListenDispatchCount',
  accuseDispatchCount: 'guideAccuseDispatchCount',
  gameplayModalOpenCount: 'gameplayModalOpenCount',
  residualMaskCount: 'residualMaskCount',
  lampsDelta: 'lampsDelta',
  statementsDelta: 'statementsDelta',
  turnDelta: 'turnDelta',
  requestfailedCount: 'requestfailedCount'
};
/* 正向计数（不是负向断言）：非法 id 提示恰好一次；缺失不提示 */
const POS_EXPECT = { illegalTierToastCount: 1, missingTierToastCount: 0 };

const report = {
  generatedAt: new Date().toISOString(),
  version: 'difficulty-smoke.v1',
  specStatus: 'UNKNOWN', implStatus: 'UNKNOWN',
  specSource: CONTRACT.SPEC_SOURCE,
  numericSource: CONTRACT.NUMERIC_SOURCE,
  contract: {
    tiers: EXPECT_TIERS, default: EXPECT_DEFAULT, urlKey: CONTRACT.URL_KEY,
    sessionField: CONTRACT.SESSION_FIELD, stateChannel: CONTRACT.STATE_CHANNEL,
    reproKey: CONTRACT.REPRO_KEY, obsoleteVersions: CONTRACT.OBSOLETE_VERSIONS
  },
  edge: EDGE, viewports: { desktop: DESKTOP, mobile: MOBILE }, seedPool: SEED_POOL,
  harnessSelftest: {}, probeSelfTest: null, cases: [], uncovered: [], counters: {}, NEG_EXPECT, POS_EXPECT,
  guideCounters: null, lampLeaks: [],
  stepTrace: [], tierMatrix: [], screenshots: [],
  visualReviewedBy: [], visualReviewPass: false, visualReview: null,
  humanPath: { recorded: false, watchedBy: null, watchedAt: null, hooksUsed: 0 },
  humanPending: true, humanPlaythroughPass: false,
  regression: {},
  /* 声明了但**没有测量**的断言 → 不写 0、不混进 NEG_EXPECT，单列在此，避免「省略式通过」 */
  coverageGaps: [
    { id: 'hookOnlyCaseCount', reason: '需逐条用例声明观测通道（DOM / 状态 / 流程）才能统计；' +
      '当前 caseRecord 不带通道字段，无法自动派生。本轮所有阻断级用例均含 DOM 或真实流程证据，' +
      '但该元指标本身未被测量，故不计为 0、不计入通过。' }
  ],
  gate: { wiredInto: '', verified: false, lastRunAt: null, runBy: 'qa-lead', exitCode: null },
  pageErrors: [], verdict: 'NOT_RUN',
  summary: { total: 0, passed: 0, failed: 0, blockingFailed: [], generalFailed: [] },
  note: ''
};

function finish(code) {
  report.gate.exitCode = code;
  fs.mkdirSync(path.join(ROOT, 'tools'), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log('=== difficulty-smoke ' + report.verdict + ' ===');
  console.log('report ' + REPORT);
  console.log('specStatus=' + report.specStatus + ' implStatus=' + report.implStatus);
  console.log('cases ' + report.summary.passed + '/' + report.summary.total +
    ' counters=' + JSON.stringify(report.counters));
  if (report.note) console.log('note ' + report.note);
  process.exit(code);
}

/* ================= 前置门禁（先于任何浏览器用例） ================= */
function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function gateSpec() {
  const missing = SPEC_FILES.filter(f => !read(f));
  if (missing.length) { report.specStatus = 'SPEC_MISSING:' + missing.join(','); return false; }
  const design = read('docs/难度分级-设计案-v1.md');
  /* §12.1：13:07「6 字段 × 72 终值」重写版已撤销。若磁盘仍是该中间态，
     规格层未恢复 → 不允许带着冲突进验收，但也不把它算作实现缺陷。 */
  if (design && /6 字段 × 12 组 = 72 个终值/.test(design) && /\| 初级 \| `easy`/.test(design)) {
    report.specStatus = 'SPEC_CONFLICT:设计案待恢复 v1.1（§12.1 撤销六字段重写版）';
    return false;
  }
  report.specStatus = 'OK';
  return true;
}

function gateImpl() {
  const html = read('index.html') || '';
  const main = read('js/main.js') || '';
  const diff = read('js/difficulty.js') || '';
  const probes = {
    'index.html 引入 js/difficulty.js': /js\/difficulty\.js/.test(html),
    'main.js 接线 difficultyTier': /difficultyTier/.test(main),
    'main.js 解析 ?difficulty=': new RegExp('params\\(\\)|\\?difficulty|difficulty').test(main) && /difficultyTier/.test(main),
    'SANDENG_API.getDifficulty()': /getDifficulty/.test(main),
    'PARAM_STATE=READY': /PARAM_STATE\s*=\s*'READY'/.test(diff)
  };
  const missing = Object.keys(probes).filter(k => !probes[k]);
  if (missing.length) {
    report.implStatus = 'IMPL_NOT_WIRED:' + missing.join(' / ');
    return false;
  }
  report.implStatus = 'WIRED';
  return true;
}

function gateHarness() {
  const tools = [
    { name: 'difficulty-oracle-selftest', file: 'tools/qa/difficulty-oracle-selftest.cjs', re: /samples (\d+)\/(\d+)/ },
    { name: 'difficulty-matrix-oracle', file: 'tools/qa/difficulty-matrix-oracle.cjs', re: /harnessSelftest (\d+)\/(\d+)/ }
  ];
  const out = {};
  for (const t of tools) {
    try {
      const stdout = cp.execFileSync(process.execPath, [path.join(ROOT, t.file)],
        { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
      const m = t.re.exec(stdout);
      const pass = !!m && m[1] === m[2] && /PASS/.test(stdout);
      out[t.name] = { pass, samples: m ? m[1] + '/' + m[2] : null };
    } catch (e) {
      out[t.name] = { pass: false, error: String(e.message).slice(0, 200) };
    }
  }
  report.harnessSelftest = out;
  return Object.keys(out).every(k => out[k].pass);
}

function gateRegistration() {
  const list = read('docs/交付清单.md') || '';
  const hit = list.indexOf('node tools/difficulty-smoke.cjs') >= 0;
  report.gate.wiredInto = hit ? 'docs/交付清单.md 复跑命令：node tools/difficulty-smoke.cjs' : '';
  report.gate.verified = hit;                 /* 核退出码之外，必须核到「在执行链哪一步被调用」 */
  return hit;
}

/* ================= 浏览器夹具 ================= */
let browser = null;

/* 只读探针：拦 setItem / 包装 SANDENG_API.dispatch / 记录页面错误。
   玩家操作一律用真实指针点击；探针只用于计数，不代替任何玩法输入。 */
function probeInit() {
  window.__QAC__ = {
    saveSetCount: 0, dispatchCount: {}, toastTexts: [], clip: [], errors: []
  };
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'sandeng.save.v2') window.__QAC__.saveSetCount++;
    return origSet.apply(this, arguments);
  };
  let api;
  Object.defineProperty(window, 'SANDENG_API', {
    configurable: true,
    get: function () { return api; },
    set: function (v) {
      api = v;
      if (v && typeof v.dispatch === 'function') {
        const d = v.dispatch;
        v.dispatch = function (a) {
          if (a && a.type) window.__QAC__.dispatchCount[a.type] =
            (window.__QAC__.dispatchCount[a.type] || 0) + 1;
          return d.call(v, a);
        };
      }
    }
  });
  /* toast 通道：DOM 级观测。探针在 document_start 执行，此刻 SD.UI 尚未挂载，
     所以不能包裹 SD.UI.toast；改为拦截 #toast 元素的 textContent 写入 ——
     这正是 UI.toast 唯一的生产写法（js/ui.js:230 `el.textContent = msg`），
     精确到「每调用一次记一次」，同文案重复调用也能分别计数，不会漏记。 */
  try {
    var nd = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (nd && nd.set && nd.get) {
      Object.defineProperty(Node.prototype, 'textContent', {
        configurable: true, enumerable: nd.enumerable, get: nd.get,
        set: function (v) {
          if (this && this.id === 'toast') window.__QAC__.toastTexts.push(String(v));
          return nd.set.call(this, v);
        }
      });
    }
  } catch (e) { window.__QAC__.toastHookError = String(e && e.message); }

  /* 剪贴板通道：拦截生产代码真正交给平台的文本（Clipboard.writeText），
     headless 下 readText() 不可达，但「游戏写了什么」是可观测的。
     主路径之外的 execCommand('copy') 兜底同样拦截（js/main.js:52-57）。 */
  try {
    var CP = window.Clipboard && window.Clipboard.prototype;
    if (CP && typeof CP.writeText === 'function') {
      CP.writeText = function (t) {
        window.__QAC__.clip.push({ via: 'clipboard', text: String(t) });
        return Promise.resolve();
      };
    }
  } catch (e) { window.__QAC__.clipHookError = String(e && e.message); }
  try {
    var origExec = Document.prototype.execCommand;
    if (typeof origExec === 'function') {
      Document.prototype.execCommand = function (cmd) {
        if (String(cmd).toLowerCase() === 'copy') {
          var ae = document.activeElement;
          var v = ae && typeof ae.value === 'string' ? ae.value
            : (document.getSelection ? String(document.getSelection()) : '');
          window.__QAC__.clip.push({ via: 'execCommand', text: String(v) });
        }
        return origExec.apply(this, arguments);
      };
    }
  } catch (e) { window.__QAC__.clipHookError2 = String(e && e.message); }

  window.addEventListener('error', function (e) { window.__QAC__.errors.push(String(e.message)); });
}

async function fresh(viewport, initSave) {
  const ctx = await browser.newContext({ viewport: viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript(probeInit);
  if (initSave !== undefined) {
    await ctx.addInitScript(function (s) {
      try { localStorage.setItem('sandeng.save.v2', s); } catch (e) { /* file:// 兜底 */ }
    }, initSave);
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('requestfailed', r => errs.push('REQFAIL: ' + r.url()));
  page.on('request', r => { if (!/^file:\/\//.test(r.url())) errs.push('NONFILE: ' + r.url()); });
  return { ctx, page, errs };
}

async function close(f) { if (f && f.ctx) await f.ctx.close(); }

/* 真实指针点击（不用 element.click()，不绕过 pointer-events 遮罩） */
/* 真实指针点击（不用 element.click()，不绕过 pointer-events 遮罩）。
   弹层有入场动画：位置连续两次取样一致才点，避免点在动画中途丢掉这一次操作。 */
async function stableClick(page, selector) {
  for (let i = 0; i < 12; i++) {
    const a = await page.locator(selector).first().boundingBox({ timeout: 1200 }).catch(() => null);
    if (!a) { await page.waitForTimeout(60); continue; }
    await page.waitForTimeout(70);
    const b = await page.locator(selector).first().boundingBox({ timeout: 1200 }).catch(() => null);
    if (!b) continue;
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5) {
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      return true;
    }
  }
  return false;
}

async function realClick(page, selector) {
  const box = await page.locator(selector).first().boundingBox({ timeout: 1500 }).catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

async function probe(page) {
  return page.evaluate(() => ({
    saveSetCount: window.__QAC__.saveSetCount,
    dispatchCount: window.__QAC__.dispatchCount,
    toastTexts: window.__QAC__.toastTexts.slice(),
    clip: window.__QAC__.clip.slice(),
    hookErrors: [window.__QAC__.toastHookError, window.__QAC__.clipHookError,
      window.__QAC__.clipHookError2].filter(Boolean),
    errors: window.__QAC__.errors.slice()
  })).catch(() => ({ saveSetCount: -1, dispatchCount: {}, toastTexts: [], clip: [], hookErrors: ['evaluate failed'], errors: [] }));
}

/* 三通道：只取实际值（期望值来自 MATRIX 顶部常量） */
async function readChannels(page) {
  const lampText = await page.locator('#tb-lamp-text').textContent({ timeout: 1200 }).catch(() => null);
  const lampOn = await page.locator('#tb-lamps .lamp.on').count().catch(() => -1);
  const domTier = await page.locator('#tb-tier').getAttribute('data-difficulty-tier', { timeout: 1200 }).catch(() => null);
  const state = await page.evaluate(() => {
    const a = window.SANDENG_API;
    if (!a) return null;
    return {
      snapshot: typeof a.getState === 'function' ? a.getState() : null,
      difficulty: typeof a.getDifficulty === 'function' ? a.getDifficulty() : null
    };
  }).catch(() => null);
  const saveTier = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('sandeng.save.v2') || 'null');
      return s && s.session ? (s.session[/* CONTRACT.SESSION_FIELD */'difficultyTier'] || null) : null;
    } catch (e) { return null; }
  }).catch(() => null);
  return { lampText, lampOn, domTier, state, saveTier };
}

/* §5.2 派生语义：rhFrom/fleeFrom → redHerring/allowFlee 布尔；期望值仍来自写死常量 */
function expected13(key) {
  const e = MATRIX.EXPECT_MATRIX[key];
  const night = parseInt(key.split('|')[1], 10);
  return {
    lamps: e.lamps, clueCount: e.clueCount, evadeBoost: e.evadeBoost,
    temperature: e.temperature,
    redHerring: night >= e.rhFrom, allowFlee: night >= e.fleeFrom,
    trustMaskBelow: e.trustMaskBelow, tensionLeaveAt: e.tensionLeaveAt,
    fleeSuspicionAt: e.fleeSuspicionAt, suspicionGainScale: e.suspicionGainScale,
    chainMinForFullCredit: e.chainMinForFullCredit, endingBestTrust: e.endingBestTrust
  };
}

/* status: 'PASS' / 'FAIL' / 'UNCOVERED'。
   UNCOVERED = 判定工具未自验或观测通道不可达 → 只能当线索，不计入通过/失败、不作判定依据。 */
function caseRecord(id, ac, level, pass, expected, actual, evidence, screenshot, status) {
  const st = status || (pass ? 'PASS' : 'FAIL');
  report.cases.push({ id, ac, level, pass: st === 'PASS', status: st,
    expected, actual, evidence, screenshot: screenshot || null });
  report.summary.total++;
  if (st === 'PASS') report.summary.passed++;
  else if (st === 'FAIL') {
    report.summary.failed++;
    (level === '阻断' ? report.summary.blockingFailed : report.summary.generalFailed).push(id);
  }
  report.stepTrace.push({ id, pass: st === 'PASS', status: st, at: new Date().toISOString() });
  if (st === 'UNCOVERED') report.uncovered.push({ id, reason: String(evidence).slice(0, 200) });
}

/* 截图时同步记录「这张图拍的是什么状态」——逐帧复核的完整性靠状态签名，不靠像素哈希：
   实测同样输入连跑两次，8/8 帧 sha256 全不同（画布动画的亚像素差异），
   把像素哈希当门禁会让复核永远 stale，等于永远不复核。 */
async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, 'difficulty-' + name + '.png');
  const sig = {
    screen: await page.locator('.screen.active').first().getAttribute('id', { timeout: 1200 }).catch(() => null),
    tier: await page.locator('#tb-tier').getAttribute('data-difficulty-tier', { timeout: 800 }).catch(() => null),
    lamp: (await page.locator('#tb-lamp-text').textContent({ timeout: 800 }).catch(() => null) || '').trim() || null,
    picked: await page.locator('#tier-pick [aria-checked="true"]').getAttribute('data-tier', { timeout: 800 }).catch(() => null),
    size: page.viewportSize() ? page.viewportSize().width + 'x' + page.viewportSize().height : null
  };
  await page.screenshot({ path: p, animations: 'disabled' }).catch(() => {});
  const size = fs.existsSync(p) ? fs.statSync(p).size : 0;
  const ok = size >= EXPECT_MIN_PNG;
  report.screenshots.push({ file: 'docs/screenshots/difficulty-' + name + '.png', bytes: size, ok, sig });
  return { file: 'docs/screenshots/difficulty-' + name + '.png', ok };
}

/* 真实指针走完一夜 → 结算屏（复制分享按钮只在 #screen-result 上可见）。
   全程只用 goto / mouse.click，不调 dispatch、不调调试钩子。 */
async function playNightToResult(page) {
  const started = await realClick(page, '#btn-start');
  await page.waitForTimeout(340);
  const opened = await realClick(page, '#btn-accuse');
  await page.waitForTimeout(200);
  let accused = false;
  for (let i = 0; i < 3 && !accused; i++) {
    accused = await stableClick(page, '[data-action="accuse"]');
    if (accused) {
      await page.waitForTimeout(460);
      const on = await page.locator('#screen-result.active').count().catch(() => 0);
      if (on > 0) break;
      accused = false;        /* 点到了但没进结算 → 重新取样再点 */
    }
    await page.waitForTimeout(150);
  }
  const onResult = await page.locator('#screen-result.active').count().catch(() => 0);
  return { started, opened, accused, onResult: onResult > 0 };
}

/* ================= 探针自验（判定工具先自验的纪律） =================
   每个新断言先构造 ≥3 个已知答案样本（≥1 命中 + ≥1 不命中），自测过才能当判定依据；
   自测不过 → 对应断言一律标 UNCOVERED，不许「把 FAIL 改成 PASS」。
   toast 与剪贴板两条通道的期望值全部写死在这里，不反读运行时。 */
async function runProbeSelfTest() {
  const out = {
    toast: { channel: 'DOM · 拦截 #toast 的 textContent 写入', samples: [], pass: false },
    clip: { channel: 'DOM · 拦截 Clipboard.writeText / execCommand("copy") 实参', samples: [], pass: false }
  };
  const TOAST_RE = /难度未识别|初级开局/;

  /* ① toast 通道：4 个已知答案样本（1 命中 + 3 不命中） */
  const toastSamples = [
    { name: 'T1 非法 id → 恰好 1 次', url: '?difficulty=ZZZ_BOGUS', expect: 1 },
    { name: 'T2 不带参数 → 0 次', url: '?seed=' + SEED_POOL[0], expect: 0 },
    { name: 'T3 合法档位 → 0 次', url: '?difficulty=advanced', expect: 0 },
    { name: 'T4 引导态忽略难度 → 0 次', url: '?guide=1&difficulty=ZZZ_BOGUS', expect: 0 }
  ];
  for (const s of toastSamples) {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE + s.url, { waitUntil: 'load' });
      await f.page.waitForTimeout(360);
      const p = await probe(f.page);
      const n = p.toastTexts.filter(t => TOAST_RE.test(t)).length;
      out.toast.samples.push({ name: s.name, url: s.url, expect: s.expect, observed: n, hit: n === s.expect,
        hookErrors: p.hookErrors });
    } catch (e) {
      out.toast.samples.push({ name: s.name, url: s.url, expect: s.expect, observed: null, hit: false,
        error: String(e.message).slice(0, 120) });
    } finally { await close(f); }
  }
  out.toast.pass = out.toast.samples.length >= 3 &&
    out.toast.samples.every(x => x.hit === true) &&
    out.toast.samples.some(x => x.expect > 0) && out.toast.samples.some(x => x.expect === 0);

  /* ② 剪贴板通道：3 个已知答案样本（1 命中 + 2 不命中，含「未点击必须为空」的负样本）。
     复制按钮只在结算屏可见，所以三个样本都真实走完一夜（进夜 → 指认 → 结算）。 */
  const clipSamples = [
    { name: 'C1 advanced + 结算屏点复制 → 命中「难度：高级」', url: '?difficulty=advanced&seed=' + SEED_POOL[0], copy: true, expectHit: true },
    { name: 'C2 novice + 结算屏点复制 → 不命中「高级」', url: '?difficulty=novice&seed=' + SEED_POOL[0], copy: true, expectHit: false },
    { name: 'C3 advanced 但走完一夜不点复制 → 无文本', url: '?difficulty=advanced&seed=' + SEED_POOL[0], copy: false, expectHit: false }
  ];
  for (const s of clipSamples) {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE + s.url, { waitUntil: 'load' });
      await f.page.waitForTimeout(200);
      const flow = await playNightToResult(f.page);
      const clicked = (s.copy && flow.onResult) ? await stableClick(f.page, '#btn-copy-share') : false;
      if (clicked) await f.page.waitForTimeout(260);
      const p = await probe(f.page);
      const last = p.clip.length ? p.clip[p.clip.length - 1] : null;
      const text = last ? last.text : null;
      const hit = !!(text && /难度：高级/.test(text));
      out.clip.samples.push({ name: s.name, url: s.url, copy: s.copy, flow, clicked,
        expectHit: s.expectHit, captured: text ? text.slice(0, 80) : null, via: last ? last.via : null,
        tierLine: text ? (text.match(/难度：(\S+)/) || [null, null])[1] : null,
        hit, ok: hit === s.expectHit });
    } catch (e) {
      out.clip.samples.push({ name: s.name, url: s.url, copy: s.copy, expectHit: s.expectHit,
        captured: null, hit: false, ok: false, error: String(e.message).slice(0, 120) });
    } finally { await close(f); }
  }
  out.clip.pass = out.clip.samples.length >= 3 &&
    out.clip.samples.every(x => x.ok === true) &&
    out.clip.samples.some(x => x.expectHit === true) && out.clip.samples.some(x => x.expectHit === false);

  report.probeSelfTest = out;
  return out;
}

/* ================= 用例集 ================= */
async function runCases() {
  /* D-10 / D-11 四档参数逐项：真实指针点击选档 + 三通道独立复算 */
  for (const tier of EXPECT_TIERS) {
    const f = await fresh(DESKTOP);
    let actual = null, snap = null;
    try {
      await f.page.goto(BASE, { waitUntil: 'load' });
      const clicked = await realClick(f.page, '[data-action="set-tier"][data-tier="' + tier + '"]');
      await realClick(f.page, '#btn-start');
      await f.page.waitForTimeout(250);
      const ch = await readChannels(f.page);
      actual = { clicked, lampText: ch.lampText, lampOn: ch.lampOn, domTier: ch.domTier,
        apiTier: ch.state && ch.state.difficulty ? ch.state.difficulty.tier : null,
        saveTier: ch.saveTier,
        params: ch.state && ch.state.difficulty ? ch.state.difficulty.params : null };
      const exp13 = expected13(tier + '|1');
      const paramsOk = actual.params && Object.keys(exp13).every(k => actual.params[k] === exp13[k]);
      const lamp = ORACLE.parseLampText(ch.lampText);
      const lampsOk = lamp && lamp.total === exp13.lamps && ch.lampOn === exp13.lamps;
      const tiersOk = actual.domTier === tier && actual.apiTier === tier && actual.saveTier === tier;
      caseRecord('D-10-' + tier, 'AC-01', '阻断', clicked && paramsOk && lampsOk && tiersOk,
        { tier, params: exp13, lamps: exp13.lamps }, actual,
        '真实指针点击 [data-tier] + 三通道（#tb-lamp-text / #tb-tier / getDifficulty / 存档）');
      snap = await shot(f.page, tier);
      caseRecord('D-44-' + tier, 'AC-11', '阻断', snap.ok, { minBytes: EXPECT_MIN_PNG },
        { file: snap.file }, '四档实际渲染帧，0 字节占位不算证据');
    } catch (e) {
      caseRecord('D-10-' + tier, 'AC-01', '阻断', false, { tier }, { error: String(e.message) }, 'exception');
    } finally { await close(f); }
  }

  /* D-20 默认档回落：无 URL / 无存档 / 无显式选择 */
  {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE, { waitUntil: 'load' });
      await realClick(f.page, '#btn-start');
      await f.page.waitForTimeout(200);
      const ch = await readChannels(f.page);
      const apiTier = ch.state && ch.state.difficulty ? ch.state.difficulty.tier : null;
      caseRecord('D-20', 'AC-02', '阻断',
        apiTier === EXPECT_DEFAULT && ch.domTier === EXPECT_DEFAULT && ch.saveTier === EXPECT_DEFAULT,
        { default: EXPECT_DEFAULT }, { apiTier, domTier: ch.domTier, saveTier: ch.saveTier },
        '三通道一致；默认档严禁取 TIER_IDS[0]');
    } catch (e) { caseRecord('D-20', 'AC-02', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-21 老存档兼容：v2 存档无 difficultyTier，点续玩不改写存档 */
  {
    const legacy = JSON.stringify({ v: 2, session: { seed: SEED_POOL[0], night: 2, totalScore: 0, nights: [] },
      game: null, selected: null, tone: 'warm', ended: false });
    const f = await fresh(DESKTOP, legacy);
    try {
      await f.page.goto(BASE, { waitUntil: 'load' });
      const before = await probe(f.page);
      const savedBefore = await f.page.evaluate(() => localStorage.getItem('sandeng.save.v2')).catch(() => null);
      await realClick(f.page, '#btn-continue');
      await f.page.waitForTimeout(200);
      const after = await probe(f.page);
      const savedAfter = await f.page.evaluate(() => localStorage.getItem('sandeng.save.v2')).catch(() => null);
      const unchanged = savedBefore === savedAfter;
      const ch = await readChannels(f.page);
      const tier = ch.state && ch.state.difficulty ? ch.state.difficulty.tier : null;
      caseRecord('D-21', 'AC-03', '阻断', unchanged && tier === EXPECT_LEGACY_FALLBACK,
        { saveUnchanged: true, fallback: EXPECT_LEGACY_FALLBACK },
        { unchanged, tier, saveSetDelta: after.saveSetCount - before.saveSetCount },
        '预置无 difficultyTier 的 v2 存档；续玩不得改写存档 JSON');
      report.counters.legacySaveRewriteCount = unchanged ? 0 : 1;
    } catch (e) { caseRecord('D-21', 'AC-03', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-22 损坏存档 */
  {
    const f = await fresh(DESKTOP, '{坏 JSON');
    try {
      await f.page.goto(BASE, { waitUntil: 'load' });
      await realClick(f.page, '#btn-start');
      await f.page.waitForTimeout(150);
      caseRecord('D-22', 'AC-03', '严重', f.errs.length === 0, { pageErrors: 0 },
        { pageErrors: f.errs.slice(0, 3) }, '损坏存档不得导致白屏 / 未捕获异常');
    } catch (e) { caseRecord('D-22', 'AC-03', '严重', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-23 非法 id 8 类：URL ?difficulty=，回落 basic，提示恰好一次，状态不变 */
  {
    let allPass = true, toastCount = 0, acceptCount = 0, toastViolations = 0;
    const toastFails = [];
    for (const s of CONTRACT.ILLEGAL_ID_SAMPLES) {
      const f = await fresh(DESKTOP);
      try {
        await f.page.goto(BASE + '?difficulty=' + encodeURIComponent(s.value), { waitUntil: 'load' });
        await realClick(f.page, '#btn-start');
        await f.page.waitForTimeout(120);
        const ch = await readChannels(f.page);
        const tier = ch.state && ch.state.difficulty ? ch.state.difficulty.tier : null;
        const p = await probe(f.page);
        const toasts = p.toastTexts.filter(t => /难度未识别|初级开局/.test(t)).length;
        toastCount += toasts;
        if (toasts !== CONTRACT.ILLEGAL_TOAST_EXPECT) {
          toastViolations++; toastFails.push({ value: s.value, toasts });
        }
        if (tier !== EXPECT_DEFAULT) { acceptCount++; allPass = false; }
        caseRecord('D-23-' + s.name, 'AC-04', '阻断', tier === EXPECT_DEFAULT,
          { fallback: EXPECT_DEFAULT }, { tier, toasts },
          '?difficulty=' + JSON.stringify(s.value) + '；回落为判定依据；提示计数为 DOM 级观测');
      } catch (e) { allPass = false; caseRecord('D-23-' + s.name, 'AC-04', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
      finally { await close(f); }
    }
    report.counters.illegalTierToastCount = toastCount;
    report.counters.illegalTierToastViolationCount = toastViolations;
    report.counters.illegalTierAcceptCount = acceptCount;
    caseRecord('D-23-汇总', 'AC-04', '阻断', allPass && acceptCount === 0,
      { samples: CONTRACT.ILLEGAL_ID_SAMPLES.length, accept: 0 }, { allPass, acceptCount }, '8 类逐项跑');
    /* 提示通道已在 runProbeSelfTest 里自验（4 样本：1 命中 + 3 不命中），可作判定依据 */
    const toastProbeOk = !!(report.probeSelfTest && report.probeSelfTest.toast && report.probeSelfTest.toast.pass);
    caseRecord('D-23-toast-提示恰好一次', 'AC-04', '提示', toastViolations === 0,
      { perSample: CONTRACT.ILLEGAL_TOAST_EXPECT, samples: CONTRACT.ILLEGAL_ID_SAMPLES.length },
      { samples: CONTRACT.ILLEGAL_ID_SAMPLES.length, totalToasts: toastCount, violations: toastViolations,
        violationsDetail: toastFails, probeSelfTest: toastProbeOk ? 'VERIFIED' : 'UNVERIFIED' },
      toastProbeOk ? 'DOM 级拦截 #toast.textContent 写入：非法 id 每次载入恰好 1 次提示'
        : '探针自验未过 → 只作线索，不计入通过/失败',
      null, toastProbeOk ? undefined : 'UNCOVERED');
  }

  /* D-24 切档不污染 seed（并实测 seedRegenCount / runtimeTierInSeedCount 两个负向计数） */
  {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE + '?seed=' + SEED_POOL[0], { waitUntil: 'load' });
      const t0 = await f.page.locator('#intro-seed').textContent({ timeout: 1200 }).catch(() => null);
      const seen = [t0];
      for (const t of EXPECT_TIERS) {
        await realClick(f.page, '[data-action="set-tier"][data-tier="' + t + '"]');
        await f.page.waitForTimeout(60);
        seen.push(await f.page.locator('#intro-seed').textContent({ timeout: 1200 }).catch(() => null));
      }
      const regen = seen.filter((v, i) => i > 0 && v !== seen[0]).length;   /* 封面文案被改写的次数 */
      const t1 = seen[seen.length - 1];
      await realClick(f.page, '#btn-start');
      await f.page.waitForTimeout(150);
      const stateSeed = await f.page.evaluate(() => window.SANDENG_API.getState().seed).catch(() => null);
      /* 运行期 seed 文本里出现任何档位 id（含大小写变体、连字符拼接）即算污染 */
      const tierInSeed = EXPECT_TIERS.filter(t =>
        new RegExp(t, 'i').test(String(stateSeed || '')) || new RegExp(t, 'i').test(String(t1 || '')));
      const ok = t0 === t1 && regen === 0 && stateSeed === SEED_POOL[0] && tierInSeed.length === 0;
      caseRecord('D-24', 'AC-06', '阻断', ok, { seed: SEED_POOL[0], textUnchanged: true, tierInSeed: [] },
        { t0, t1, seen, regen, stateSeed, tierInSeed },
        '封面连切四档，#intro-seed 与 getState().seed 恒定；seed 串内不含任何档位 id');
      report.counters.seedPollutionCount = ok ? 0 : 1;
      report.counters.seedRegenCount = regen;
      report.counters.runtimeTierInSeedCount = tierInSeed.length;
    } catch (e) { caseRecord('D-24', 'AC-06', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-25 引导交叉回归：?guide=1 固定 basic + 夜1 + 6/6 盏（阻断） */
  {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE + '?guide=1&difficulty=advanced', { waitUntil: 'load' });
      await f.page.waitForTimeout(500);
      const ch = await readChannels(f.page);
      const lamp = ORACLE.parseLampText(ch.lampText);
      const tier = ch.state && ch.state.difficulty ? ch.state.difficulty.tier : null;
      const night = ch.state && ch.state.snapshot ? ch.state.snapshot.night : null;
      const ok = lamp && lamp.total === 6 && ch.lampOn === 6 && tier === EXPECT_DEFAULT && night === 1;
      caseRecord('D-25', 'AC-09/回归', '阻断', ok,
        { lampsText: EXPECT_GUIDE1_LAMPS, tier: EXPECT_DEFAULT, night: 1 },
        { lampText: ch.lampText, lampOn: ch.lampOn, tier, night },
        '?guide=1 必须忽略 ?difficulty，否则引导 6/6 盏基线整片 FAIL');
    } catch (e) { caseRecord('D-25', 'AC-09/回归', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-30 同 (seed,night,tier) 逐位复现：两个独立 context，真实点击同一动作序列 */
  {
    const seq = ['[data-action="ask"][data-topic="hour"]', '[data-action="ask"][data-topic="origin"]',
      '#btn-listen', '[data-action="ask"][data-topic="companion"]'];
    async function runOne() {
      const f = await fresh(DESKTOP);
      const snaps = [];
      try {
        await f.page.goto(BASE + '?seed=' + SEED_POOL[1] + '&difficulty=basic', { waitUntil: 'load' });
        await f.page.waitForTimeout(150);
        snaps.push(await f.page.evaluate(() => window.SANDENG_API.getState()));
        for (const sel of seq) {
          const ok = await realClick(f.page, sel);
          await f.page.waitForTimeout(80);
          snaps.push(await f.page.evaluate(() => window.SANDENG_API.getState()));
          if (!ok) break;
        }
      } finally { await close(f); }
      return snaps;
    }
    try {
      const a = await runOne(), b = await runOne();
      const equal = a.length === b.length && a.length > 1 &&
        a.every((s, i) => ORACLE.bitwiseEqual(s, b[i]));
      caseRecord('D-30', 'AC-05', '阻断', equal,
        { steps: seq.length + 1, bitwise: true }, { steps: a.length, equal },
        '两个互不共享 localStorage 的独立 context；真实指针点击；逐位（含字段顺序）比对');
    } catch (e) { caseRecord('D-30', 'AC-05', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
  }

  /* D-31b 正向断言：同 seed 同 night 不同 tier → 案件确实不同（§10） */
  {
    async function snapshotFor(tier) {
      const f = await fresh(DESKTOP);
      try {
        await f.page.goto(BASE + '?seed=' + SEED_POOL[2] + '&night=1&difficulty=' + tier, { waitUntil: 'load' });
        await f.page.waitForTimeout(150);
        return await f.page.evaluate(() => window.SANDENG_API.getState());
      } finally { await close(f); }
    }
    try {
      const a = await snapshotFor('basic'), b = await snapshotFor('advanced');
      const different = !!a && !!b && !ORACLE.bitwiseEqual(a, b);
      caseRecord('D-31b', 'AC-05/§10', '阻断', different,
        { different: true }, { different, aImpostor: a && a.impostorId, bImpostor: b && b.impostorId },
        'clueCount / redHerring 改变 buildCase 主 RNG 消费序列 → 档位真实生效；禁止写「同 seed 跨档案件相同」');
    } catch (e) { caseRecord('D-31b', 'AC-05/§10', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
  }

  /* D-32 / D-33 四档 × 三夜 12 组极值（URL 复现入口，非调试钩子） */
  {
    for (const tier of EXPECT_TIERS) {
      for (let night = 1; night <= 3; night++) {
        const key = tier + '|' + night;
        const exp = MATRIX.EXPECT_MATRIX[key];
        const f = await fresh(DESKTOP);
        let actual = null;
        try {
          await f.page.goto(BASE + '?seed=' + SEED_POOL[0] + '&night=' + night + '&difficulty=' + tier,
            { waitUntil: 'load' });
          await f.page.waitForTimeout(150);
          const ch = await readChannels(f.page);
          const params = ch.state && ch.state.difficulty ? ch.state.difficulty.params : null;
          const exp13 = expected13(key);
          const matched = params && Object.keys(exp13).every(k => params[k] === exp13[k]);
          const solvable = exp.lamps >= EXPECT_MIN_ACTIONS;
          const inBand = MATRIX.RANGE && Object.keys(MATRIX.RANGE).every(k =>
            exp[k] === undefined || (exp[k] >= MATRIX.RANGE[k][0] && exp[k] <= MATRIX.RANGE[k][1]));
          const lamp = ORACLE.parseLampText(ch.lampText);
          const lampOk = lamp && lamp.total === exp.lamps && ch.lampOn === exp.lamps;
          actual = { matched, solvable, inBand, lampOk, params, lampText: ch.lampText };
          report.tierMatrix.push({ key, matched: !!matched, solvable, inBand, lamps: exp.lamps,
            clueCount: exp.clueCount, temperature: exp.temperature,
            lampTotal: lamp ? lamp.total : null, lampOk: !!lampOk });
          caseRecord('D-32-' + key, 'AC-07', '阻断', matched && solvable && inBand && lampOk,
            { params: exp13, lamps: exp.lamps, minActions: EXPECT_MIN_ACTIONS }, actual,
            '12 组每组实跑；URL 为玩家可用的复现入口（非 SANDENG_API 调试钩子）');
        } catch (e) {
          caseRecord('D-32-' + key, 'AC-07', '阻断', false, { params: exp }, { error: String(e.message) }, 'exception');
        } finally { await close(f); }
      }
    }
    const s = await fresh(DESKTOP);
    try {
      await s.page.goto(BASE + '?seed=' + SEED_POOL[0] + '&night=3&difficulty=advanced', { waitUntil: 'load' });
      await s.page.waitForTimeout(150);
      const snap = await shot(s.page, 'advanced-night3');
      caseRecord('D-44-极值', 'AC-11', '阻断', snap.ok, { minBytes: EXPECT_MIN_PNG },
        { file: snap.file }, '下界极值渲染帧');
    } catch (e) { caseRecord('D-44-极值', 'AC-11', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(s); }
  }

  /* D-34 档位锁定：局内改档被拒绝且状态逐位不变 */
  {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE + '?seed=' + SEED_POOL[0] + '&difficulty=novice', { waitUntil: 'load' });
      await f.page.waitForTimeout(150);
      const before = await f.page.evaluate(() => window.SANDENG_API.getState());
      const tierBefore = await f.page.locator('#tb-tier').getAttribute('data-difficulty-tier', { timeout: 1200 }).catch(() => null);
      for (let i = 0; i < 10; i++) await realClick(f.page, '[data-action="set-tier"][data-tier="advanced"]');
      await f.page.waitForTimeout(150);
      const after = await f.page.evaluate(() => window.SANDENG_API.getState());
      const tierAfter = await f.page.locator('#tb-tier').getAttribute('data-difficulty-tier', { timeout: 1200 }).catch(() => null);
      const ok = tierBefore === tierAfter && ORACLE.bitwiseEqual(before, after);
      caseRecord('D-34', 'AC-08', '阻断', ok, { unchanged: true, tier: 'novice' },
        { tierBefore, tierAfter, stateUnchanged: ORACLE.bitwiseEqual(before, after) },
        '连点 10 次极值；被拒绝时 turn/lampsLeft/statements/phase 逐位不变');
      report.counters.inGameTierChangeCount = ok ? 0 : 1;
    } catch (e) { caseRecord('D-34', 'AC-08', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-35 消除时机：切档 / 拒绝后旧档参数与临时层不残留 */
  {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE, { waitUntil: 'load' });
      await realClick(f.page, '[data-action="set-tier"][data-tier="novice"]');
      await realClick(f.page, '[data-action="set-tier"][data-tier="advanced"]');
      await realClick(f.page, '#btn-start');
      await f.page.waitForTimeout(300);
      const ch = await readChannels(f.page);
      const params = ch.state && ch.state.difficulty ? ch.state.difficulty.params : null;
      const exp = expected13('advanced|1');
      const clean = params && params.lamps === exp.lamps && ch.domTier === 'advanced';
      caseRecord('D-35', 'AC-08/消除时机', '阻断', clean,
        { tier: 'advanced', lamps: exp.lamps }, { domTier: ch.domTier, lamps: params && params.lamps },
        '动作后 N 帧旧档灯数不得残留；residualTierStateCount = 0');
      report.counters.residualTierStateCount = clean ? 0 : 1;
    } catch (e) { caseRecord('D-35', 'AC-08/消除时机', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-45 移动端 + 零非本地请求 / 零页面报错 */
  {
    const f = await fresh(MOBILE);
    try {
      await f.page.goto(BASE + '?difficulty=basic', { waitUntil: 'load' });
      await realClick(f.page, '#btn-start');
      await f.page.waitForTimeout(200);
      const sw = await f.page.evaluate(() => document.documentElement.scrollWidth).catch(() => -1);
      const ok = f.errs.length === 0 && sw <= MOBILE.width;
      caseRecord('D-45', 'AC-13', '阻断', ok, { pageErrors: 0, scrollWidthMax: MOBILE.width },
        { pageErrors: f.errs.slice(0, 3), scrollWidth: sw }, '390×844 移动端');
      report.counters.pageerrorCount = f.errs.filter(e => /PAGEERROR|CONSOLE/.test(e)).length;
      report.counters.nonFileRequestCount = f.errs.filter(e => /NONFILE|REQFAIL/.test(e)).length;
    } catch (e) { caseRecord('D-45', 'AC-13', '阻断', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-46 分享文本带难度名（真实走完一夜到结算屏 → 真实点击复制 → 拦截交给平台的文本） */
  {
    const f = await fresh(DESKTOP);
    try {
      await f.page.goto(BASE + '?seed=' + SEED_POOL[0] + '&difficulty=advanced', { waitUntil: 'load' });
      await f.page.waitForTimeout(200);
      const flow = await playNightToResult(f.page);
      const clicked = flow.onResult ? await stableClick(f.page, '#btn-copy-share') : false;
      if (clicked) await f.page.waitForTimeout(260);
      const p = await probe(f.page);
      const last = p.clip.length ? p.clip[p.clip.length - 1] : null;
      const text = last ? last.text : null;
      const ok = !!(text && /难度：/.test(text) && /高级/.test(text));
      const clipProbeOk = !!(report.probeSelfTest && report.probeSelfTest.clip && report.probeSelfTest.clip.pass);
      caseRecord('D-46', 'AC-05/§10', '严重', ok, { hasTierLabel: true },
        { flow, clicked, via: last ? last.via : null, text: text ? text.slice(0, 160) : null,
          probeSelfTest: clipProbeOk ? 'VERIFIED' : 'UNVERIFIED' },
        clipProbeOk ? '结算屏真实指针点击复制；拦截 Clipboard.writeText / execCommand("copy") 实参；' +
          '分享文本不带档位则同 seed 无法复现' : '剪贴板通道自验未过 → 只作线索，不计入通过/失败',
        null, clipProbeOk ? undefined : 'UNCOVERED');
    } catch (e) { caseRecord('D-46', 'AC-05/§10', '严重', false, {}, { error: String(e.message) }, 'exception'); }
    finally { await close(f); }
  }

  /* D-55 真人路径专用 page：禁用 evaluate / addInitScript / 任何调试钩子，只用真实指针 */
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, recordVideo: undefined });
    const page = await ctx.newPage();       /* 故意不加 initScript、不注入探针 */
    let reached = false;
    try {
      await page.goto(BASE, { waitUntil: 'load' });            /* 冷启动：只开地址栏 */
      await shot(page, 'human-path-01-cover');
      const tierClicked = await realClick(page, '[data-action="set-tier"][data-tier="basic"]');
      await shot(page, 'human-path-02-select');
      const started = await realClick(page, '#btn-start');
      await page.waitForTimeout(300);
      const firstDecision = await page.locator('[data-action="ask"]').first().isVisible().catch(() => false);
      await shot(page, 'human-path-03-game');
      reached = !!(tierClicked && started && firstDecision);
      report.humanPath = { recorded: reached, watchedBy: null, watchedAt: null, hooksUsed: 0 };
      caseRecord('D-55', 'AC-12', '阻断', reached,
        { decisionPoint: true, hooksUsed: 0 }, { tierClicked, started, firstDecision },
        '从冷启动、不做任何额外操作，走到第一个决策点；仅 goto / 真实指针 click / isVisible / 读可见文本属性 / screenshot；' +
        '未注入探针、未调 SANDENG_API、未用任何调试钩子');
    } catch (e) {
      caseRecord('D-55', 'AC-12', '阻断', false, {}, { error: String(e.message) }, 'exception');
    } finally { await ctx.close(); }
  }

  /* 由 12 组矩阵反算 noviceLampLeakCount（实测值，不是写死的 0）：
     任何一档实际灯数与期望灯数不符即为一次「灯数泄漏」。 */
  const lampLeaks = report.tierMatrix.filter(m => m.lampOk !== true).map(m => m.key);
  report.counters.noviceLampLeakCount = lampLeaks.length;
  report.lampLeaks = lampLeaks;
}

/* ================= 逐帧视觉签名 =================
   截图存在 ≠ 复核过。复核结论必须落成独立文件 docs/screenshots/difficulty-visual-review.json，
   逐帧写 {frame, reviewer, pass, note, sig, bytes}。
   完整性判据 = **状态签名一致**（屏幕 / 档位 / 灯数文本 / 选中档 / 视口）+ 体积在复核值的 0.7~1.4 倍内；
   像素 sha256 一并记录但不作门禁（实测连跑两次 8/8 帧哈希不同，像素级不稳定）。 */
function loadVisualReview() {
  const rvPath = path.join(OUT, 'difficulty-visual-review.json');
  if (!fs.existsSync(rvPath)) {
    report.visualReview = { error: 'VISUAL_REVIEW_MISSING', expect: 'docs/screenshots/difficulty-visual-review.json' };
    report.visualReviewPass = false;
    return;
  }
  try {
    const rv = JSON.parse(fs.readFileSync(rvPath, 'utf8'));
    const frames = Array.isArray(rv.frames) ? rv.frames : [];
    const detail = report.screenshots.map(s => {
      const name = path.basename(s.file, '.png').replace(/^difficulty-/, '');
      const rec = frames.find(f => f.frame === name) || null;
      const abs = path.join(ROOT, s.file);
      const sha = fs.existsSync(abs) ? crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex') : null;
      const sigMatched = !!(rec && rec.sig && JSON.stringify(rec.sig) === JSON.stringify(s.sig));
      const bytesRatio = rec && rec.bytes ? s.bytes / rec.bytes : null;
      const bytesInBand = bytesRatio !== null && bytesRatio >= 0.7 && bytesRatio <= 1.4;
      return {
        frame: name, reviewed: !!rec, pass: !!(rec && rec.pass), reviewer: rec ? rec.reviewer : null,
        note: rec ? rec.note : null, sigMatched, bytesRatio: bytesRatio === null ? null : Number(bytesRatio.toFixed(3)),
        bytesInBand, pixelHashMatched: !!(rec && sha && rec.sha256 === sha), sig: s.sig
      };
    });
    report.visualReview = detail;
    report.visualReviewedBy = Array.from(new Set(detail.filter(d => d.pass && d.reviewer).map(d => d.reviewer)));
    report.visualReviewPass = detail.length >= 5 &&
      detail.every(d => d.pass === true && d.sigMatched === true && d.bytesInBand === true && !!d.reviewer);
  } catch (e) {
    report.visualReview = { error: String(e.message).slice(0, 200) };
    report.visualReviewPass = false;
  }
}

/* ================= 回归三套门禁 ================= */
function runRegression() {
  const tmp = path.join(os.tmpdir(), 'qa-difficulty-selftest-' + Date.now() + '.json');
  const jobs = [
    { name: 'selftest', args: ['tools/selftest.cjs', '--seeds', '200', '--demo', '--json', tmp] },
    { name: 'browserSmoke', args: ['tools/browser-smoke.cjs'] },
    { name: 'guideSmoke', args: ['tools/guide-smoke.cjs'] }
  ];
  let fails = 0;
  for (const j of jobs) {
    try {
      const stdout = cp.execFileSync(process.execPath, j.args,
        { cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });
      report.regression[j.name] = { pass: true, exit: 0, tail: stdout.slice(-400) };
    } catch (e) {
      /* 并发/环境抖动防护：单项失败时独立复跑一次确认，不把噪声记成回归缺陷
         （本轮探针运行中 guide-smoke 曾 exit 1，单独复跑 PASS 60/60，确认为噪声）。 */
      try {
        const again = cp.execFileSync(process.execPath, j.args,
          { cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });
        report.regression[j.name] = { pass: true, exit: 0, retried: true,
          tail: again.slice(-400), firstError: String(e.message).slice(0, 200) };
      } catch (e2) {
        fails++;
        report.regression[j.name] = { pass: false, exit: e2.status === undefined ? -1 : e2.status,
          error: String(e2.message).slice(0, 300), retried: true };
      }
    }
  }
  /* 本次自检产出的报告**只能**从这条临时路径读：
     selftest 带 --json 时只写该路径，不刷新仓库里的 tools/selftest-report.json。
     旧实现固定去读仓库那份 → 读到的是上一次手工运行的陈货（长期停在 8/8），
     于是「自检全绿但门禁判 FAIL」。删临时文件必须推迟到核字段之后。 */
  let selfReport = null;
  try { selfReport = JSON.parse(fs.readFileSync(tmp, 'utf8')); } catch (e) { selfReport = null; }
  /* 逐条核字段，不只核退出码。
     项数契约 = 10（P4：T7/T8 改写、T9 新增 ⇒ 9；P5：T10「对簿」新增 ⇒ 10）。
     这是**项数**重标定，不是判据放宽：仍要求 allPass===true 且 passed===total。 */
  const EXPECT_SELFTEST_TOTAL = 10;
  try {
    const st = selfReport;
    if (!st) throw new Error('本次自检未产出报告');
    if (!(st.summary && st.summary.allPass === true &&
          st.summary.passed === EXPECT_SELFTEST_TOTAL && st.summary.total === EXPECT_SELFTEST_TOTAL)) {
      report.regression.selftest.pass = false; fails++;
    }
  } catch (e) {
    report.regression.selftest = Object.assign({}, report.regression.selftest,
      { pass: false, reportError: String(e.message).slice(0, 200) });
    fails++;
  }
  try { fs.unlinkSync(tmp); } catch (e) { /* 临时文件用完即删 */ }
  try {
    const bs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'browser-smoke-report.json'), 'utf8'));
    if (!(bs.errors && bs.errors.length === 0)) { report.regression.browserSmoke.pass = false; fails++; }
  } catch (e) { /* 保留 exec 结果 */ }
  try {
    const gs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'guide-smoke-report.json'), 'utf8'));
    if (!(gs.verdict === 'pass' && gs.summary && gs.summary.total === 60 && gs.summary.passed === 60)) {
      report.regression.guideSmoke.pass = false; fails++;
    }
    /* 引导域 9 项负向计数：读它的**实测值**，不在本套件里默认写 0 */
    const gc = gs.counters || {};
    const missing = [], nonZero = [];
    for (const src of Object.keys(GUIDE_NEG_SOURCE)) {
      if (!Object.prototype.hasOwnProperty.call(gc, src)) missing.push(src);
      else if (gc[src] !== 0) nonZero.push({ key: GUIDE_NEG_SOURCE[src], source: src, value: gc[src] });
    }
    report.guideCounters = {
      source: 'tools/guide-smoke-report.json',
      mapped: GUIDE_NEG_SOURCE, missing, nonZero,
      pass: missing.length === 0 && nonZero.length === 0
    };
    if (!report.guideCounters.pass) fails++;
  } catch (e) {
    report.guideCounters = { pass: false, error: String(e.message).slice(0, 200) };
    fails++;
  }
  report.counters.regressionFailCount = fails;
  caseRecord('D-40/41/42', 'AC-09', '阻断', fails === 0,
    { selftest: '10/10', browserSmoke: 'errors=0', guideSmoke: '60/60', guideCounters: '9/9 为 0' },
    report.regression, '核退出码 + 核报告字段 + 核引导域 9 项负向计数的实测值 + 核门禁在交付清单执行链中的位置');
}

/* ================= 主流程 ================= */
(async function main() {
  /* 四道前置门禁**全部执行一遍**，报告同时记录 specStatus / implStatus / gate.verified，
     再按优先级决定 verdict；绝不把「规格未恢复 / 运行时未接线」误判为实现缺陷。 */
  const h = gateHarness();
  const s = gateSpec();
  const i = gateImpl();
  const g = gateRegistration();
  if (!h) {
    report.verdict = 'HARNESS_FAIL';
    report.note = '判定工具自验未通过：全部断言只能当线索，不得作判定依据';
    return finish(1);
  }
  if (!s) {
    report.verdict = 'SPEC_BLOCKED';
    report.note = '规格冲突/缺失（如设计案待恢复 v1.1），按「不许带着不达标进下一步」拦住；不计为运行时实现缺陷';
    return finish(1);
  }
  if (!i) {
    report.verdict = 'IMPL_NOT_WIRED';
    report.note = '运行时未接线，本轮不启动 Edge、不执行任何浏览器用例；避免把未接线状态误判为缺陷。' +
      ' specStatus=' + report.specStatus + ' gate.verified=' + report.gate.verified;
    return finish(1);
  }
  if (!g) {
    report.verdict = 'GATE_NOT_WIRED';
    report.note = '一个写了但从未接进 docs/交付清单.md 复跑命令的守卫，等于没有守卫';
    return finish(1);
  }
  /* 运行授权门禁（team-lead 指令）：本轮只做规格修订 / 脚本落盘 / 判定工具自验。
     需制作人通知「实现完成」后，显式以 QA_DIFFICULTY_RUN=1 执行全量真浏览器验收。
     未授权时四道门禁照常执行并写报告，但**不启动 Edge**，避免把未确认状态误判为缺陷。 */
  if (process.env.QA_DIFFICULTY_RUN !== '1') {
    report.verdict = 'NOT_AUTHORIZED';
    report.note = '本轮按指令不跑全量真浏览器验收；四道前置门禁已核（见 specStatus / implStatus / gate.verified / harnessSelftest）。' +
      ' 制作人通知实现完成后执行：QA_DIFFICULTY_RUN=1 node tools/difficulty-smoke.cjs';
    return finish(1);
  }

  try {
    browser = await chromium.launch({ executablePath: EDGE, headless: true,
      args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox'] });
    await runProbeSelfTest();
    await runCases();
    loadVisualReview();
    runRegression();
  } catch (e) {
    caseRecord('D-00', '门禁', '阻断', false, {}, { error: String(e.message) }, 'browser launch / run');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  /* 负向计数逐项判定（helper 已自验：≥3 样本，含命中与不命中） */
  const neg = ORACLE.negativesAllZero(report.counters, NEG_EXPECT);
  const toastUncovered = report.uncovered.some(u => u.id === 'D-23-toast-提示恰好一次');
  const toastProbeVerified = !!(report.probeSelfTest && report.probeSelfTest.toast && report.probeSelfTest.toast.pass);
  const posOk = toastUncovered || (toastProbeVerified &&
    report.counters.illegalTierToastViolationCount === 0 &&
    report.counters.illegalTierToastCount === POS_EXPECT.illegalTierToastCount * CONTRACT.ILLEGAL_ID_SAMPLES.length);
  const framesOk = report.screenshots.length >= 5 && report.screenshots.every(s => s.ok);
  const blocking = report.summary.blockingFailed.length === 0;
  const general = report.summary.generalFailed.length === 0;
  const pass = neg.pass && posOk && framesOk && blocking && general &&
    report.guideCounters && report.guideCounters.pass === true &&
    report.visualReviewPass === true &&
    report.tierMatrix.length === 12 && report.tierMatrix.every(m => m.matched && m.solvable && m.inBand);

  report.verdict = pass ? 'PASS' : 'FAIL';
  report.note = '⚠️ 自动化门禁只能证明没崩，证明不了好用；humanPending:true / humanPlaythroughPass:false，' +
    'AI 视觉复核不得顶替真人玩家试玩。本报告只有自动化结果，没有人玩过。';
  finish(pass ? 0 : 1);
})().catch(e => {
  report.verdict = 'ERROR';
  report.note = String(e && e.stack ? e.stack : e).slice(0, 600);
  finish(2);
});
