/* 音效专项自检（P1+P2）
 * 用法：node tools/audio-smoke.cjs
 * 在 file:// 真实浏览器里用假 AudioContext 记录所有合成调用，验证：
 *  1. 各预设能合成出声（振荡器 / 程序噪声、波形、频率、包络参数）
 *  2. 剧情/结局/评级音效都被真实交互触发，且音色彼此不同（不泄漏真伪）
 *  3. 音效开关能静默；无 AudioContext 时不报错
 *  4. hover 节流生效
 *  5. file:// 零网络请求（不引入任何外部音频素材）
 * 依赖：.tooling/node_modules/playwright-core（开发期工具，不随作品发布）
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', '.tooling', 'node_modules', 'playwright-core'));
const ROOT = path.join(__dirname, '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?guide=0';

/* 在页面脚本运行前注入假 AudioContext，捕获全部节点创建与调度。 */
function stubScript() {
  window.__AC = { osc: [], noise: [], gains: [], filters: [], started: [], resumed: 0, suspended: 0 };
  function param(v) {
    return {
      value: v == null ? 0 : v,
      setValueAtTime(x) { this.value = x; },
      exponentialRampToValueAtTime(x) { this.value = x; },
      linearRampToValueAtTime(x) { this.value = x; }
    };
  }
  function node(extra) {
    return Object.assign({
      connect() { return this; }, disconnect() { return this; },
      start(t) { window.__AC.started.push({ kind: this.__kind, t, freq: this.frequency && this.frequency.value, type: this.type }); },
      stop() {}
    }, extra || {});
  }
  function FakeAC() {
    this._t0 = Date.now();
    this.sampleRate = 44100; this.destination = node({ __kind: 'dest' });
    this.state = 'running';
  }
  Object.defineProperty(FakeAC.prototype, 'currentTime', {
    get() { return (Date.now() - this._t0) / 1000; }
  });
  FakeAC.prototype.createGain = function () {
    const n = node({ __kind: 'gain', gain: param(1) }); window.__AC.gains.push(n); return n;
  };
  FakeAC.prototype.createOscillator = function () {
    const n = node({ __kind: 'osc', type: 'sine', frequency: param(440) }); window.__AC.osc.push(n); return n;
  };
  FakeAC.prototype.createBiquadFilter = function () {
    const n = node({ __kind: 'filter', type: 'lowpass', frequency: param(350) }); window.__AC.filters.push(n); return n;
  };
  FakeAC.prototype.createBuffer = function (ch, n) {
    return { getChannelData() { return new Float32Array(n); } };
  };
  FakeAC.prototype.createBufferSource = function () {
    const n = node({ __kind: 'noise', buffer: null }); window.__AC.noise.push(n); return n;
  };
  FakeAC.prototype.resume = function () { window.__AC.resumed++; };
  FakeAC.prototype.suspend = function () { this.state = 'suspended'; window.__AC.suspended++; };
  window.AudioContext = FakeAC;
  window.webkitAudioContext = FakeAC;
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], nonfile = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('request', r => { if (!/^file:\/\//.test(r.url())) nonfile.push(r.url()); });
  await page.addInitScript(stubScript);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  /* --- 1. 预设逐项播放：确认每种都能合成出声、参数合法 --- */
  const presets = [
    'click', 'lantern', 'reveal', 'bad', 'win', 'type',
    'hover', 'modal-open', 'modal-close', 'page', 'load',
    'lantern-out', 'wind-gust', 'ask-warm', 'ask-press', 'ask-show', 'listen', 'confront', 'leave',
    'ending-灯灭', 'ending-一灯独明', 'ending-灯下留名', 'ending-破晓', 'ending-空盏',
    'rank-3', 'rank-2', 'rank-1', 'rank-0'
  ];
  const presetReport = await page.evaluate((kinds) => {
    const a = window.SD.UI.audio;
    return kinds.map(k => {
      window.__AC.osc = []; window.__AC.noise = []; window.__AC.started = [];
      a.sfx(k);
      const waves = window.__AC.osc.map(o => o.type);
      const freqs = window.__AC.osc.map(o => Math.round(o.frequency.value));
      return { k, osc: window.__AC.osc.length, noise: window.__AC.noise.length, waves, freqs };
    });
  }, presets);
  const silent = presetReport.filter(r => r.osc + r.noise === 0);
  check('28 种预设全部能合成出声', silent.length === 0, silent.length ? silent.map(r => r.k).join(',') : '28/28');
  const noisyPreset = presetReport.find(r => r.k === 'wind-gust');
  check('wind-gust 使用程序噪声源', noisyPreset && noisyPreset.noise >= 1, noisyPreset && noisyPreset.noise);
  const revealPreset = presetReport.find(r => r.k === 'reveal');
  check('reveal 为升频音色（不泄密的通用揭示音）', revealPreset && revealPreset.freqs.some(f => f >= 1000), revealPreset && revealPreset.freqs);
  const endingReport = presetReport.filter(r => r.k.indexOf('ending-') === 0);
  const endingSigs = endingReport.map(r => r.freqs.join(',') + '|' + r.noise);
  check('五种结局音色彼此不同', new Set(endingSigs).size === 5, endingSigs.join(' / '));

  /* --- 2. hover 节流 --- */
  const hover = await page.evaluate(() => {
    const a = window.SD.UI.audio;
    a.lastHover = -1;
    let calls = 0;
    const orig = a.sfx.bind(a);
    a.sfx = function (k) { if (k === 'hover') calls++; return orig(k); };
    for (let i = 0; i < 10; i++) a.hover();   // 同一毫秒内连调 10 次
    a.sfx = orig;
    return calls;
  });
  check('hover 60ms 节流：连调 10 次只响 1 次', hover === 1, `osc=${hover}`);

  /* --- 3. 音效开关静默 --- */
  const mute = await page.evaluate(() => {
    const a = window.SD.UI.audio;
    a.on = false; window.__AC.osc = [];
    a.sfx('reveal'); a.hover();
    const offCount = window.__AC.osc.length;
    a.on = true; a.sfx('reveal');
    return { offCount, onCount: window.__AC.osc.length };
  });
  check('关闭音效后零合成调用', mute.offCount === 0, `off=${mute.offCount}`);
  check('重新开启后恢复合成', mute.onCount > 0, `on=${mute.onCount}`);

  /* --- 4. 真实交互触发语气音 --- */
  await page.click('#btn-start');
  await page.waitForTimeout(200);
  const toneReport = await page.evaluate(() => {
    const a = window.SD.UI.audio, seen = [];
    const orig = a.sfx.bind(a);
    a.sfx = function (k) { seen.push(k); return orig(k); };
    window.__seen = seen;
    return true;
  });
  /* 三种语气各问一句（force 点击：问询卡内按钮可能被装饰层覆盖） */
  for (const tone of ['warm', 'press', 'show']) {
    const tb = page.locator(`[data-tone="${tone}"]`);
    if (await tb.count()) await tb.first().click({ force: true }).catch(() => {});
    /* 必须限定 data-action=ask —— 同页还有 data-action=confront 的物证按钮也带 data-topic */
    const tp = page.locator('[data-action="ask"][data-topic="hour"]');
    if (await tp.count()) await tp.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(140);
  }
  const seenTones = await page.evaluate(() => (window.__seen || []).slice());
  check('三种语气分别触发 ask-warm/press/show',
    ['ask-warm', 'ask-press', 'ask-show'].every(k => seenTones.includes(k)),
    seenTones.filter(k => k.indexOf('ask-') === 0).join(','));

  /* --- 5. 无 AudioContext 环境静默降级 --- */
  const noAC = await page.evaluate(() => {
    const AC = window.AudioContext, WAC = window.webkitAudioContext;
    window.AudioContext = undefined; window.webkitAudioContext = undefined;
    const a = window.SD.UI.audio, savedCtx = a.ctx; a.ctx = null;
    let threw = false;
    try { a.sfx('reveal'); a.startAmbient(); a.hover(); } catch (e) { threw = true; }
    a.ctx = savedCtx; window.AudioContext = AC; window.webkitAudioContext = WAC;
    return threw;
  });
  check('无 AudioContext 时不抛异常（全站静默降级）', noAC === false, `threw=${noAC}`);

  /* --- 6. file:// 零网络 --- */
  check('无外部音频/网络请求', nonfile.length === 0, nonfile.slice(0, 3).join(','));
  check('无页面运行时错误', errors.length === 0, errors.slice(0, 3).join(','));

  const pass = results.every(r => r.pass);
  const report = {
    generatedAt: new Date().toISOString(), url: URL,
    presets: presetReport, results, errors, nonfile,
    pass, passed: results.filter(r => r.pass).length, total: results.length
  };
  fs.writeFileSync(path.join(ROOT, 'tools', 'audio-smoke-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ results, errors, nonfile, pass, passed: report.passed, total: report.total }, null, 2));
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
