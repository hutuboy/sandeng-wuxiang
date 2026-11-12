/* =====================================================================
 * 三更灯 · 无相客栈  |  main.js
 * 流程编排：三夜会话、事件、存档、影子掌柜自动试玩、弹窗、对外 API
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = g.SD, C = SD.Core, Game = SD.Game, NPC = SD.NPC, Agent = SD.Agent, UI = SD.UI;
  var SAVE_KEY = 'sandeng.save.v2';
  var REPO_URL = 'https://github.com/hutuboy/sandeng-wuxiang'; // MIT 开源仓库

  var App = {
    screen: 'intro', game: null, selected: null, tone: 'warm',
    lastDecision: null, ended: false, autopilot: false, autoTrace: null,
    // logicOp = null 表示「还没动过算子」→ 推演台默认落在当夜残卷给的那个算子上
    logicOp: null, act: 'lamp',
    session: { seed: '', night: 1, totalScore: 0, nights: [], difficultyTier: 'basic' },
    soundOn: true, aiShown: true
  };
  g.SANDENG_APP = App;

  /* 五幕顺序：点灯 → 问询 → 推演 → 指认 →（结案 = 结算屏） */
  var ACT_ORDER = ['lamp', 'ask', 'deduce', 'accuse'];
  function setAct(act) {
    if (ACT_ORDER.indexOf(act) < 0) return;
    if (App.act === act) return;
    App.act = act;
    UI.paint(App);
    save();
  }

  function q(id) { return document.getElementById(id); }
  function randSeed() {
    return 'SD-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  }
  function params() {
    var o = {};
    (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return; var p = kv.split('='); o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return o;
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2, session: App.session, game: App.game, selected: App.selected, tone: App.tone, ended: App.ended, act: App.act
      }));
    } catch (e) { /* file:// 或隐私模式下 localStorage 不可用，保留内存态即可 */ }
    refreshContinue();
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }
  function refreshContinue() {
    var b = q('btn-continue'); if (!b) return;
    var has = !!App.game || !!load();
    b.disabled = !has;
    b.title = has ? '续上第 ' + (App.game ? App.game.night : 1) + ' 夜' : '暂无存档';
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { UI.toast('已复制到剪贴板'); }, function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); UI.toast('已复制到剪贴板'); } catch (e) { UI.toast('复制失败，请手动选择文本'); }
    document.body.removeChild(ta);
  }

  /* ---------------- 会话 ---------------- */
  function newRun(seed, night, tierId, opts) {
    var D = SD.Difficulty;
    var prevTier = App.session ? App.session.difficultyTier : null;
    var tier = D ? D.normalize(tierId == null ? prevTier : tierId) : 'basic';
    App.session = { seed: seed || randSeed(), night: night || 1, totalScore: 0, nights: [], difficultyTier: tier };
    startNight(App.session.night, true, opts);
  }
  /* opts.skipLamp：从封面「点灯 · 开始守夜」进来时，点灯幕已由封面承担，直接入问询幕；
     第二/三夜从结算屏「接着守下一夜」进来时走完整五幕，先看这一夜的客人。 */
  function startNight(night, fresh, opts) {
    App.session.night = night;
    var D = SD.Difficulty;
    App.game = Game.create(App.session.seed, night, {
      tierId: D ? D.normalize(App.session.difficultyTier) : 'basic'
    });
    App.selected = App.game.guests[0].id;
    // 每一夜都从「残卷给的算子」起手，别把上一夜的选择带过来
    App.logicOp = null;
    App.lastDecision = null;
    App.ended = false;
    App.act = (opts && opts.skipLamp) ? 'ask' : 'lamp';
    UI.resetCache();
    UI.showScreen('screen-game');
    App.screen = 'game';
    UI.paint(App);
    UI.audio.startAmbient();
    save();
    if (!fresh) UI.toast('续上第 ' + night + ' 夜');
    /* 新用户引导：仅「首次点灯」的第 1 夜全新局触发；其余守卫在 Guide 内 */
    if (fresh && night === 1 && SD.Guide) SD.Guide.maybeAutoStart(App);
  }
  function continueRun() {
    var s = load();
    if ((!s || !s.game) && App.game) {
      // localStorage 不可用时，直接恢复内存中的这一局
      UI.resetCache();
      if (App.ended || App.game.phase === 'ended') { UI.paintResult(App); UI.showScreen('screen-result'); App.screen = 'result'; }
      else { if (App.act === 'lamp' && App.game.turn > 0) App.act = 'ask'; UI.paint(App); UI.showScreen('screen-game'); App.screen = 'game'; }
      UI.toast('已续上第 ' + App.game.night + ' 夜');
      return;
    }
    if (!s || !s.game) { UI.toast('没有找到存档，先点灯吧'); return; }
    App.session = s.session; App.game = s.game; App.selected = s.selected || App.game.guests[0].id;
    App.tone = s.tone || 'warm'; App.ended = !!s.ended; App.lastDecision = null;
    /* 五幕位置随存档恢复；已开过口的夜不再停在「点灯」幕 */
    var savedAct = ACT_ORDER.indexOf(s.act) >= 0 ? s.act : 'ask';
    if (savedAct === 'lamp' && (App.game.turn > 0)) savedAct = 'ask';
    App.act = savedAct;
    /* 老存档兼容：忽略 URL；缺字段一律按 basic 契约值在内存补齐，不改写存档 */
    var D = SD.Difficulty;
    var tier = D ? D.normalize(App.session.difficultyTier) : 'basic';
    App.session.difficultyTier = tier;
    if (App.game && App.game.cs && App.game.cs.difficulty) {
      var cd = App.game.cs.difficulty;
      var full = D ? D.apply(tier, { night: App.game.night || 1 }) : null;
      if (full) D.PARAM_KEYS.forEach(function (k) {
        if (cd[k] === undefined || cd[k] === null) cd[k] = full[k];
      });
    }
    UI.resetCache();
    if (App.ended || App.game.phase === 'ended') {
      UI.paintResult(App); UI.showScreen('screen-result'); App.screen = 'result';
    } else {
      UI.paint(App); UI.showScreen('screen-game'); App.screen = 'game';
    }
    UI.audio.startAmbient();
  }

  /* ---------------- 动作 ---------------- */
  function afterDispatch(res) {
    if (!res || res.ok === false) { UI.toast(res && res.error ? res.error : '这一步走不通'); UI.audio.sfx('bad'); return; }
    if (res.decision) App.lastDecision = res.decision;
    UI.audio.sfx(res.decision && res.decision.revealed ? 'reveal' : 'lantern');
    UI.paint(App);
    save();
    l2Polish(res);
    if (App.game.phase === 'ended' && !App.ended) endNight();
  }
  /* L2 云端兜底：可选、默认关、超时静默回退；只润色台词，不改决策与存档 */
  function l2Polish(res) {
    try {
      if (!window.SANDENG_LLM || !window.SANDENG_LLM.enabled || !window.SANDENG_LLM.enabled()) return;
      if (!res.decision || !res.decision.text) return;
      if (App.game.phase === 'ended') return;
      var log = App.game.log, entry = null;
      for (var i = log.length - 1; i >= 0; i--) {
        if (log[i] && log[i].text === res.decision.text) { entry = log[i]; break; }
      }
      if (!entry) return;
      var gst = Game.guest(App.game, App.selected);
      window.SANDENG_LLM.polishLog(entry, {
        persona: gst ? gst.name : '', state: gst ? gst.state : null, action: res.decision.chosen
      }, function () { UI.paint(App); });
    } catch (e) { /* 云端兜底任何异常都不得影响游戏 */ }
  }
  function doAsk(topic) {
    if (App.autopilot) { UI.toast('影子掌柜正在试玩，稍等一下'); return; }
    if (!App.selected) { UI.toast('先点一位客人'); return; }
    if (App.game.phase !== 'playing') return;
    var guest = Game.guest(App.game, App.selected);
    if (!guest || guest.flags.left) { UI.toast('这位客人已不在座'); return; }
    /* 快捷键可能在「点灯 / 推演 / 指认」幕里按下 —— 先落回问询幕，别让灯灭了却看不见对话 */
    if (App.act !== 'ask') App.act = 'ask';
    UI.audio.sfx('click');
    afterDispatch(Game.dispatch(App.game, { type: 'ASK', guestId: App.selected, topic: topic, tone: App.tone }));
  }
  function doListen() {
    if (App.autopilot) return;
    if (App.act !== 'ask') App.act = 'ask';
    UI.audio.sfx('click');
    afterDispatch(Game.dispatch(App.game, { type: 'LISTEN' }));
  }
  function doAccuse(guestId) {
    UI.closeModal();
    UI.audio.sfx('lantern');
    afterDispatch(Game.dispatch(App.game, { type: 'ACCUSE', guestId: guestId }));
  }
  function endNight() {
    if (SD.Guide) SD.Guide.forceCleanup();   /* 引导层不得跨屏残留 */
    App.ended = true;
    var r = App.game.result;
    App.session.totalScore += (r.score || 0);
    App.session.nights.push({ night: App.game.night, ending: r.ending, correct: r.correct, score: r.score, chain: r.chain, lampsLeft: r.lampsLeft, seed: App.game.seed });
    save();
    UI.audio.sfx(r.correct ? 'win' : 'bad');
    UI.paintResult(App);
    UI.showScreen('screen-result'); App.screen = 'result';
  }
  function nextNight() {
    if (App.game.night >= 3) { showFinale(); return; }
    startNight(App.game.night + 1, false);
  }
  function showFinale() {
    if (SD.Guide) SD.Guide.forceCleanup();   /* 引导层不得跨屏残留 */
    var ns = App.session.nights, correct = ns.filter(function (n) { return n.correct; }).length;
    var title = correct === 3 ? '守夜人' : correct === 2 ? '掌灯人' : correct === 1 ? '值夜人' : '夜行人';
    q('finale-title').textContent = title;
    q('finale-desc').textContent = '三夜过去，你认出了 ' + correct + ' 位无相。' +
      (correct === 3 ? '灯一直没灭，簿上每个名字都对得上。' : '有些灯灭得早，但天总会亮。') +
      '　累计 ' + App.session.totalScore + ' 分。';
    q('finale-table').innerHTML = '<table class="finale-table"><thead><tr><th>夜</th><th>结局</th><th>指认</th><th>证据链</th><th>余灯</th><th>得分</th></tr></thead><tbody>' +
      ns.map(function (n) {
        return '<tr><td>第 ' + ['一', '二', '三'][n.night - 1] + ' 夜</td><td>' + UI.esc(n.ending) + '</td><td class="' + (n.correct ? 'ok' : 'no') + '">' + (n.correct ? '命中' : '失手') + '</td><td>' + n.chain + '</td><td>' + n.lampsLeft + '</td><td class="' + (n.score > 0 ? 'ok' : 'no') + '">' + (n.score > 0 ? '+' : '') + n.score + '</td></tr>';
      }).join('') + '</tbody></table>';
    UI.showScreen('screen-finale'); App.screen = 'finale';
    save();
  }
  function shareText() {
    var ns = App.session.nights, c = ns.filter(function (n) { return n.correct; }).length;
    return '《三更灯 · 无相客栈》｜AI 原生推理游戏\n' +
      '三夜守灯，认出 ' + c + '/3 位无相，累计 ' + App.session.totalScore + ' 分，评级「' + (c === 3 ? '守夜人' : c === 2 ? '掌灯人' : c === 1 ? '值夜人' : '夜行人') + '」。\n' +
      '三位客人由本地 AI 决策引擎驱动：量化状态 + 持久记忆 + 规则校验，会记住你说过的每句话。\n' +
      'seed：' + App.session.seed + '（同一 seed 可复现同一夜）\n' +
      '难度：' + (SD.Difficulty ? SD.Difficulty.label(App.session.difficultyTier) : '初级') + '\n' +
      'AI+∞ 开发者创作大赛 · 第三期「AI 造游戏」参赛作品';
  }

  /* ---------------- 影子掌柜：可视化自动试玩 ---------------- */
  function startAutopilot() {
    if (App.autopilot) return;
    if (!App.game || App.game.phase !== 'playing' || App.screen !== 'game') {
      newRun('AUTO-' + Date.now().toString(36).toUpperCase(), 1);
    }
    App.autopilot = true;
    App.act = 'ask';   /* 影子掌柜不需要「点灯」幕，直接进问询 */
    App.autoTrace = { seed: App.game.seed, night: App.game.night, initial: Game.snapshot(App.game), actions: [] };
    UI.toast('影子掌柜接手 · 只通过结构化状态与动作接口决策');
    UI.audio.sfx('click');
    step();
    function step() {
      if (!App.autopilot) return;
      if (App.game.phase !== 'playing') { finish(); return; }
      var action = Agent.choose(App.game);
      if (!action) { finish(); return; }
      var before = Game.belief(App.game);
      var res = Game.dispatch(App.game, action);
      App.autoTrace.actions.push({
        turn: App.game.turn, action: action,
        npcAction: res.decision ? res.decision.chosen : action.type,
        npcText: res.decision ? res.decision.text : '',
        beliefBefore: before, beliefAfter: Game.belief(App.game)
      });
      App.selected = action.guestId || App.selected;
      afterDispatch(res);
      if (App.game.phase === 'playing') setTimeout(step, 720); else finish();
    }
    function finish() {
      App.autopilot = false;
      App.autoTrace.final = Game.snapshot(App.game);
      App.autoTrace.correct = !!(App.game.result && App.game.result.correct);
      setTimeout(function () { openAgentTrace(); }, 500);
    }
  }

  /* ---------------- 弹窗内容 ---------------- */
  /* 顶栏「?」→ 帮助菜单：两项顺序固定（设计案 3.3）。
     玩法说明沿用 modalHowto()，内容一字不改；第二项为主动重看引导。 */
  function modalHelpMenu() {
    UI.openModal('帮助 · 掌柜手札',
      '<p>要重温规则，还是再看一遍上手指引？</p>' +
      '<div class="help-menu">' +
      '<button class="btn" data-modal="howto" style="display:block;width:100%;margin:8px 0">玩法说明</button>' +
      '<button class="btn btn-primary" data-action="guide-replay" style="display:block;width:100%;margin:8px 0">重看操作指引</button>' +
      '</div>');
  }
  function modalHowto() {
    UI.openModal('玩法说明 · 掌柜手札',
      '<h4>你要做的事</h4>' +
      '<p>每夜三位客人投宿，其中一位是<strong>「无相」</strong>——他的证词与柜上物证对不上。天亮前把他认出来。</p>' +
      '<h4>五步走完，结论自然出来</h4>' +
      '<ul><li><b>① 点灯</b>：三位客人到齐，柜上物证的真值先摆出来，你手上几盏灯一清二楚。</li>' +
      '<li><b>② 问询</b>：三位客人自上而下排开，一人一行（立绘在左、五维在右），点谁问谁。选语气（温问 / 逼问 / 示物），点话头（来路 / 时辰 / 同行 / 行囊 / 信物）——问一句灭一盏灯。</li>' +
      '<li><b>③ 推演</b>：把「物证 × 客人」的相符 / 不符摆成一张表，用四个逻辑算子筛人：' +
      '<code>∧</code> 全部不符（标准解）、<code>∨</code> 任一不符、<code>¬</code> 并非全部不符、<code>⊕</code> 恰好一条不符。</li>' +
      '<li><b>④ 指认</b>：选一位，点灯。选错，灯灭人走。</li>' +
      '<li><b>⑤ 结案</b>：真相摊开，附复盘卡——你漏掉了哪条物证、哪句自相矛盾、离最高结局还差几条证据。</li></ul>' +
      '<h4>为什么 ∧ 才是标准解</h4>' +
      '<p>无相在<strong>每一条</strong>物证上都对不上；清白的客人至多「记岔一句」。所以只用 <code>∨</code> 会把记岔的人也网进来，' +
      '只有 <code>∧</code> 能把范围压到一个人。推演台上四个算子可以随便切，切错了会看到命中两人以上——那就是提示。</p>' +
      '<h4>他们不是剧本</h4>' +
      '<p>每位客人是一套 <code>量化状态 × 人格权重 → softmax 决策 → 规则掩码校验 → 状态回写</code> 的本地推理引擎。' +
      '信任低了会拒绝交付物件，张力高了会拂袖离店，第三夜疑心过高时无相甚至会趁夜遁走；重复提问会被记住并写进措辞。' +
      '右侧「AI 决策轨迹」把每一步打分与校验全部摊开给你看。</p>' +
      '<h4>可复现</h4>' +
      '<p>每一夜由 <code>seed</code> 决定，地址栏加 <code>?seed=你的种子&amp;night=2</code> 可重开同一局；' +
      '<code>?autopilot=1</code> 直接看影子掌柜试玩。工程自检会跨 200 组种子验证案件可解性、逻辑标准解唯一、记忆一致性与规则闭环。</p>' +
      '<h4>快捷键</h4>' +
      '<p><code>1/2/3</code> 选人 · <code>Q W E R T</code> 五个话头 · <code>L</code> 添茶 · <code>A</code> 指认 · <code>D</code> 推演 · <code>C</code> 摊开比对 · <code>Esc</code> 关闭弹窗</p>');
  }
  function modalSelftest() {
    var rep = Agent.selftest({ seeds: 60 });
    var d = Agent.defectDemo('DEFECT_F01');
    var rows = rep.cases.map(function (c) {
      return '<div class="test-row"><span class="' + (c.pass ? 'ok' : 'bad') + '">' + (c.pass ? 'PASS' : 'FAIL') + '</span>' +
        '<span style="flex:1">' + UI.esc(c.name) + '<br /><span class="d">' + UI.esc(JSON.stringify(c.detail).slice(0, 150)) + '</span></span></div>';
    }).join('');
    UI.openModal('工程自检 · 60 组种子',
      '<p>同一套核心逻辑在浏览器与 Node 中共享。以下检查在页面内实时运行，' +
      '也可用 <code>node tools/selftest.cjs --seeds 200</code> 复跑并把结果写进创作手记。</p>' +
      '<h4>不变量校验</h4>' + rows +
      '<p style="margin-top:10px">汇总：<strong style="color:' + (rep.summary.allPass ? 'var(--jade)' : 'var(--crimson)') + '">' +
      rep.summary.passed + ' / ' + rep.summary.total + ' 通过</strong></p>' +
      '<h4>预置缺陷复现 F-01</h4>' +
      '<p>缺陷：<code>' + UI.esc(d.title) + '</code></p>' +
      '<div class="kv"><span class="k">随机种子</span><span>' + UI.esc(d.seed) + '</span>' +
      '<span class="k">动作序列</span><span>' + UI.esc(JSON.stringify(d.actionSequence)) + '</span>' +
      '<span class="k">旧版 repeated</span><span>' + d.legacy.repeatedFeature + ' · CONFIDE 合法 = ' + d.legacy.confideLegal + '</span>' +
      '<span class="k">修复后 repeated</span><span>' + d.fixed.repeatedFeature + ' · CONFIDE 合法 = ' + d.fixed.confideLegal + '</span>' +
      '<span class="k">复现成功</span><span style="color:var(--jade)">' + d.reproduced + '</span></div>' +
      '<p>修复：' + UI.esc(d.fix) + '</p>' +
      '<p style="color:var(--dim);font-size:11px">完整报告（含初始状态与全量动作序列）见 tools/selftest-report.json。</p>');
  }
  function modalAbout() {
    UI.openModal('关于与开源',
      '<h4>作品</h4>' +
      '<p>《三更灯 · 无相客栈》—— AI+∞ 开发者创作大赛第三期「AI 造游戏」参赛作品。' +
      '一款以 <strong>AI NPC 自主决策</strong> 为核心机制的原创网页推理游戏。</p>' +
      '<h4>三个 AI，各司其职</h4>' +
      '<ul><li><b>AI NPC 决策引擎</b>：信任 / 好感 / 张力 / 疑心 / 定力五维量化状态，持久记忆，可解释效用打分 + softmax 采样，规则层校验动作合法性，实际行为改变游戏状态（交付物件、拒答、离店、遁走）。</li>' +
      '<li><b>AI 导演</b>：带约束求解的程序化案件生成，保证「唯一矛盾 + 行动点充足 + 理想玩家可解」，并按玩家表现调整难度。</li>' +
      '<li><b>影子掌柜（自动试玩 Agent）</b>：只通过结构化状态与动作接口驱动游戏，以信息增益选问话、以信念更新做指认，输出含种子、初始状态、完整动作序列的轨迹；附带跨种子不变量自检与预置缺陷复现。</li></ul>' +
      '<h4>工程</h4>' +
      '<p>纯静态前端，零构建、零依赖、零外部素材；立绘、夜景、音效全部由 SVG / Canvas / WebAudio 程序化生成。' +
      '核心逻辑层不依赖 DOM，可在 Node 中直接跑自动化测试。同一 seed 完全可复现。</p>' +
      '<div class="kv"><span class="k">开源许可</span><span>MIT（代码）· 原创内容</span>' +
      '<span class="k">结构化接口</span><span><code>window.SANDENG_API</code></span>' +
      '<span class="k">状态格式</span><span><code>sandeng.state.v1</code></span>' +
      (REPO_URL ? '<span class="k">源码仓库</span><span>' + UI.esc(REPO_URL) + '</span>' : '') + '</div>' +
      '<h4>素材与工具来源</h4>' +
      '<p>美术、音效、字体（系统字体栈）均为代码生成或系统内置，未使用任何第三方图片、音频、字体或模型权重；' +
      '开发过程由 AI 编程助手协作完成，详见创作手记「工具与素材来源」。</p>');
  }
  function modalCompare() {
    var game = App.game;
    var head = '<tr><th>物证 · 真值</th>' + game.guests.map(function (x) { return '<th>' + UI.esc(x.name) + '</th>'; }).join('') + '</tr>';
    var rows = game.cs.clues.map(function (c) {
      return '<tr><td><b style="color:var(--amber-lt)">' + UI.esc(c.title) + '</b><br />' + UI.esc(C.topic(c.topic).label) + ' = ' + UI.esc(c.expect) + '</td>' +
        game.guests.map(function (x) {
          var st = game.statements.filter(function (s) { return s.guestId === x.id && s.topic === c.topic; })[0];
          if (!st) return '<td style="color:var(--dim)">未开口</td>';
          var ok = st.value === c.expect;
          return '<td class="' + (ok ? 'ok' : 'no') + '">' + UI.esc(st.value) + (ok ? ' ✓' : ' ✗') + '</td>';
        }).join('') + '</tr>';
    }).join('');
    UI.openModal('摊开比对',
      '<p>把物证的真值与已收录的证词摆在一起。判断仍由你来做——含糊的措辞未必是假话，' +
      '说得最笃定的也未必是真。</p>' +
      '<table class="finale-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>' +
      '<p style="color:var(--dim);font-size:11px">「✓ / ✗」仅表示证词值与物证真值是否一致，不直接等于身份判定。</p>');
  }
  function modalLogicBoard() {
    if (!App.game) return;
    UI.openModal('推演台 · 逻辑筛人',
      SD.UI.logicBoardHtml(App.game.cs, App.game.statements, App.logicOp));
  }
  function modalAccuse() {
    var b = Game.belief(App.game);
    UI.openModal('点灯 · 指认无相',
      '<p>灯一亮，就收不回来了。选一位：</p>' +
      App.game.guests.map(function (x) {
        return '<button class="btn" style="display:block;width:100%;margin:8px 0;text-align:left" data-action="accuse" data-accuse-guest="' + x.id + '">' +
          '<b style="font-family:var(--serif);font-size:15px">' + UI.esc(x.name) + '</b>　<span style="color:var(--muted);font-size:11px">' + UI.esc(x.role) + '</span>' +
          '<span style="float:right;color:var(--violet);font-size:11px">置信 ' + (b[x.id] * 100).toFixed(0) + '%</span></button>';
      }).join('') +
      '<p style="color:var(--dim);font-size:11px;margin-top:12px">置信度只是「已有证词与物证的吻合程度」，不是答案。</p>');
  }
  function modalRedecide() {
    if (!App.game || !App.selected) return;
    var guest = Game.guest(App.game, App.selected);
    var act = { guestId: guest.id, topic: App.game.cs.lieTopic, tone: 'warm' };
    var rd = NPC.reDecide(App.game, guest, act);
    function list(arr) { return arr.map(function (a) { return a.label + ' ' + a.score; }).join('　→　'); }
    var maskDiff = NPC.ACTIONS.filter(function (a) { return rd.maskBefore[a] !== rd.maskAfter[a]; })
      .map(function (a) { return NPC.ACTION_META[a].label + '：' + (rd.maskBefore[a] ? '合法' : '锁定') + ' → ' + (rd.maskAfter[a] ? '合法' : '锁定'); }).join('<br />');
    UI.openModal('状态变化后的重新决策',
      '<p>同一句问话「' + UI.esc(C.topic(act.topic).label) + '」，对 <b>' + UI.esc(guest.name) + '</b> 施加扰动：<code>' + UI.esc(rd.perturbation) + '</code>。' +
      'NPC 会重新计算效用、重新过一遍规则层，而不是重复上一次的输出。</p>' +
      '<div class="kv"><span class="k">扰动前 Top3</span><span>' + UI.esc(list(rd.before)) + '</span>' +
      '<span class="k">扰动后 Top3</span><span>' + UI.esc(list(rd.after)) + '</span>' +
      '<span class="k">合法集变化</span><span>' + (maskDiff || '无') + '</span>' +
      '<span class="k">决策分布 L1 距离</span><span>' + rd.l1 + '</span>' +
      '<span class="k">判定</span><span style="color:var(--jade)">' + (rd.changed ? '已发生重新决策' : '未变化') + '</span></div>' +
      '<p style="color:var(--dim);font-size:11px">这是评奖硬指标「状态变化后的重新决策」的可视化证据；' +
      '规则层例：信任低于阈值时锁定「交心/交付」分支，张力高于阈值才开放「离店」。</p>');
  }
  function openAgentTrace() {
    var t = App.autoTrace;
    if (!t) return;
    var rows = t.actions.map(function (a, i) {
      var ac = a.action;
      var desc = ac.type === 'ASK' ? ('问 ' + ac.guestId + ' · ' + C.topic(ac.topic).label + ' · ' + C.tone(ac.tone).label) :
        ac.type === 'ACCUSE' ? ('指认 ' + ac.guestId) : '添茶';
      return '<div class="test-row"><span class="ok">#' + (i + 1) + '</span><span style="flex:1">' + UI.esc(desc) +
        '<br /><span class="d">NPC → ' + UI.esc(a.npcAction) + '　|　信念 ' + UI.esc(JSON.stringify(a.beliefAfter)) + '</span></span></div>';
    }).join('');
    UI.openModal('影子掌柜 · 自动试玩轨迹',
      '<p>Agent 只读取 <code>getState()</code> 的结构化快照，只通过 <code>listActions() / dispatch()</code> 操作游戏，与人走同一套规则。</p>' +
      '<div class="kv"><span class="k">随机种子</span><span>' + UI.esc(t.seed) + '</span>' +
      '<span class="k">夜次 / 步数</span><span>第 ' + t.night + ' 夜 / ' + t.actions.length + ' 步</span>' +
      '<span class="k">初始状态</span><span><code>sandeng.state.v1</code>，' + t.initial.guests.length + ' 位客人，' + t.initial.clues.length + ' 条物证</span>' +
      '<span class="k">结果</span><span style="color:' + (t.correct ? 'var(--jade)' : 'var(--crimson)') + '">' + (t.correct ? '指认正确' : '指认失手') + '</span></div>' +
      '<h4>完整动作序列</h4>' + rows +
      '<h4>终局快照</h4><pre>' + UI.esc(JSON.stringify(t.final, null, 1)).slice(0, 1800) + '</pre>');
  }
  function modalDefect() {
    var d = Agent.defectDemo('DEFECT_F01');
    UI.openModal('预置缺陷复现 · F-01',
      '<p>' + UI.esc(d.title) + '</p>' +
      '<pre>' + UI.esc(JSON.stringify({ seed: d.seed, initialState: d.initialState, actionSequence: d.actionSequence, legacy: d.legacy, fixed: d.fixed, reproduced: d.reproduced }, null, 1)).slice(0, 3000) + '</pre>');
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (el) {
        var a = el.getAttribute('data-action');
        if (a === 'select-guest') {
          var gid = el.getAttribute('data-guest');
          App.selected = gid;
          UI.audio.sfx('click');
          UI.paint(App); save(); return;
        }
        if (a === 'set-tone') { App.tone = el.getAttribute('data-tone'); UI.audio.sfx('click'); UI.paint(App); save(); return; }
        if (a === 'set-tier') {
          /* 档位选择只在封面生效；局内不出现切换控件 */
          if (App.screen !== 'intro') return;
          var TD = SD.Difficulty;
          var picked = TD ? TD.normalize(el.getAttribute('data-tier')) : 'basic';
          App.session.difficultyTier = picked;
          var opts = document.querySelectorAll('#tier-pick [data-tier]');
          for (var oi = 0; oi < opts.length; oi++) {
            var on = opts[oi].getAttribute('data-tier') === picked;
            opts[oi].setAttribute('aria-checked', on ? 'true' : 'false');
            opts[oi].classList.toggle('is-on', on);
          }
          UI.audio.sfx('click');
          save();
          return;
        }
        if (a === 'ask') { doAsk(el.getAttribute('data-topic')); return; }
        if (a === 'close-modal') { UI.closeModal(); return; }
        if (a === 'guide-replay') {
          /* 设计案 3.3：先关菜单，下一帧再从 G1 起播，禁止两层遮罩并存 */
          UI.closeModal();
          requestAnimationFrame(function () { if (SD.Guide) SD.Guide.start({ replay: true }); });
          return;
        }
        if (a === 'accuse') {
          doAccuse(el.getAttribute('data-accuse-guest') || el.getAttribute('data-guest'));
          return;
        }
        if (a === 'redecide') { modalRedecide(); return; }
        if (a === 'copy-decision') { copy(JSON.stringify(App.lastDecision, null, 2)); return; }
        if (a === 'clue-toggle') {
          /* 展开状态存在 UI 内部（每次 paint 会重写 innerHTML），这里只同步当前节点 */
          var on = UI.toggleClue(el.getAttribute('data-clue-id'));
          el.classList.toggle('open', on);
          el.setAttribute('aria-expanded', on ? 'true' : 'false');
          UI.audio.sfx('click');
          return;
        }
        if (a === 'logic-op') {
          App.logicOp = el.getAttribute('data-op') || 'AND';
          UI.audio.sfx('click'); UI.paint(App);
          if (document.querySelector('.modal-mask')) modalLogicBoard();  /* 弹窗开着就同步刷新 */
          return;
        }
      }
      var md = e.target.closest('[data-modal]');
      if (md) {
        var m = md.getAttribute('data-modal');
        if (m === 'howto') modalHowto();
        if (m === 'selftest') modalSelftest();
        if (m === 'about') modalAbout();
        return;
      }
      var id = e.target && e.target.id;
      if (!id) {
        var btn = e.target.closest('button'); id = btn ? btn.id : '';
      }
      switch (id) {
        case 'btn-start': UI.audio.startAmbient(); newRun(params().seed || randSeed(), 1, null, { skipLamp: true }); break;
        case 'btn-continue': continueRun(); break;
        case 'btn-autopilot': UI.audio.startAmbient(); startAutopilot(); break;
        case 'btn-home': UI.showScreen('screen-intro'); App.screen = 'intro'; break;
        case 'btn-sound': App.soundOn = UI.audio.toggle(); q('btn-sound').classList.toggle('on', !App.soundOn); q('btn-sound').textContent = App.soundOn ? '♪' : '♪̸'; break;
        case 'btn-help': modalHelpMenu(); break;
        case 'btn-ai-toggle': App.aiShown = !App.aiShown; applyAIVis(); break;
        case 'btn-listen': doListen(); break;
        case 'btn-accuse': setAct('accuse'); break;
        case 'btn-compare': modalCompare(); break;
        case 'btn-logic': modalLogicBoard(); break;
        /* ---- 五幕导航 ---- */
        case 'btn-act-start': UI.audio.sfx('click'); setAct('ask'); break;
        case 'btn-act-deduce': UI.audio.sfx('click'); setAct('deduce'); break;
        case 'btn-act-back-ask': setAct('ask'); break;
        case 'btn-act-to-accuse': setAct('accuse'); break;
        case 'btn-act-back-deduce': setAct('deduce'); break;
        case 'btn-next-night': nextNight(); break;
        case 'btn-retry-night': startNight(App.game.night, false); break;
        case 'btn-copy-share': copy(shareText()); break;
        case 'btn-new-run': newRun(randSeed(), 1); break;
        case 'btn-finale-agent': modalDefect(); break;
        case 'btn-finale-copy': copy(shareText()); break;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { UI.closeModal(); return; }
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (document.querySelector('.modal-mask')) return;
      if (App.screen !== 'game' || App.autopilot) return;
      var k = e.key.toLowerCase();
      if ('123'.indexOf(k) >= 0 && k.length === 1) {
        var gi = parseInt(k, 10) - 1;
        if (App.game.guests[gi]) { App.selected = App.game.guests[gi].id; UI.paint(App); }
        return;
      }
      var idx = 'qwert'.indexOf(k);
      if (idx >= 0 && k.length === 1) { doAsk(C.TOPICS[idx].id); return; }
      if (k === 'l') { doListen(); return; }
      if (k === 'a') { setAct('accuse'); return; }
      if (k === 'c') { modalCompare(); }
      if (k === 'd') { setAct('deduce'); }
    });

    /* 引导步进 → 切换五幕窗口：G1 停在「点灯」，G2 起进「问询」。
       引导层只广播步号，由应用侧决定切哪一幕（引导不改游戏状态、不清灯、不落证词）。 */
    document.addEventListener('guide:step', function (e) {
      var id = e.detail && e.detail.stepId;
      if (App.screen !== 'game' || !App.game) return;
      if (id === 'G1') App.act = 'lamp';
      else if (id) App.act = 'ask';
      UI.paint(App);
    });
  }

  function applyAIVis() {
    var cr = q('col-right');
    cr.classList.toggle('hidden', !App.aiShown);
    cr.classList.toggle('force-show', App.aiShown);
    var b = q('btn-ai-toggle'); if (b) b.classList.toggle('on', App.aiShown);
  }

  /* ---------------- 对外结构化 API（评测 / 二次开发） ---------------- */
  function installAPI() {
    g.SANDENG_API = {
      version: '1.0.0',
      getState: function () { return App.game ? Game.snapshot(App.game) : null; },
      listActions: function () { return App.game ? Game.listActions(App.game) : []; },
      dispatch: function (action) { var r = App.game ? Game.dispatch(App.game, action) : { ok: false, error: 'no game' }; afterDispatch(r); return r; },
      newRun: function (seed, night, tierId) { newRun(seed || randSeed(), night || 1, tierId, { skipLamp: true }); return this.getState(); },
      /* 裁决 K：13 项运行期参数的只读观测通道；返回深拷贝而非 cs.difficulty 引用，不缓存、不写全局 */
      getDifficulty: function () {
        var D = SD.Difficulty;
        var tier = D ? D.normalize(App.session && App.session.difficultyTier) : 'basic';
        var night = App.game ? App.game.night : (App.session.night || 1);
        var base = (App.game && App.game.cs) ? App.game.cs.difficulty : null;
        var full = D ? D.apply(tier, { night: night }) : null;
        var params = {};
        if (D) {
          D.PARAM_KEYS.forEach(function (k) {
            params[k] = (base && base[k] !== undefined && base[k] !== null) ? base[k] : full[k];
          });
        } else if (base) {
          Object.keys(base).forEach(function (k) { params[k] = base[k]; });
        }
        return {
          tier: tier,
          configId: (base && base.configId) || (D ? D.SCHEMA_VERSION : 'sandeng.difficulty.v1'),
          params: params
        };
      },
      create: Game.create, dispatchPure: Game.dispatch, belief: Game.belief,
      /* 五幕外壳的只读/只切界面通道：不改灯数、不改证词，仅供验收脚本与调试 */
      act: function () { return App.act; },
      setAct: function (a) { setAct(a); return App.act; },
      Director: SD.Director, NPC: NPC, Agent: Agent, Game: Game, Core: C,
      selftest: function (n) { return Agent.selftest({ seeds: n || 200 }); },
      defectDemo: Agent.defectDemo,
      trace: function (seed, night) { return Agent.run(seed || 'API', night || 1); }
    };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    UI.initCanvas(q('bg-canvas'));
    bind();
    installAPI();
    App.aiShown = window.innerWidth > 1180;
    applyAIVis();
    var p = params();
    var defaultSeed = p.seed || randSeed();
    q('intro-seed').textContent = 'seed · ' + defaultSeed;
    refreshContinue();

    /* 难度入口：?difficulty=<id> 精确匹配；非法值拒绝回落 basic 且只提示一次，缺失不提示。
       ?guide=1 一律忽略 URL 难度、固定 basic + 第 1 夜（引导 6/6 盏基线不可动）。 */
    var D = SD.Difficulty;
    var guideForced = p.guide === '1' && p.autopilot !== '1';
    var hasTierParam = !guideForced && Object.prototype.hasOwnProperty.call(p, 'difficulty');
    var rawTier = hasTierParam ? p.difficulty : null;
    var bootTier = D ? D.normalize(rawTier) : 'basic';
    App.session.difficultyTier = bootTier;
    if (hasTierParam && D && !D.validate(rawTier)) UI.toast('难度未识别，已按初级开局');

    /* 封面四档：文案由 label() 提供、枚举与 IDS 一致；同步 aria-checked 与选中态 */
    var tierBtns = document.querySelectorAll('#tier-pick [data-tier]');
    for (var ti = 0; ti < tierBtns.length; ti++) {
      var tid = tierBtns[ti].getAttribute('data-tier');
      if (D && D.validate(tid)) tierBtns[ti].textContent = D.label(tid);
      var on = tid === bootTier;
      tierBtns[ti].setAttribute('aria-checked', on ? 'true' : 'false');
      tierBtns[ti].classList.toggle('is-on', on);
    }

    if (p.autopilot === '1') { setTimeout(startAutopilot, 260); }
    else if (!guideForced && p.seed && p.night) { newRun(p.seed, parseInt(p.night, 10) || 1, bootTier, { skipLamp: true }); }
    /* 可复跑验收入口：?guide=1 强制进入第 1 夜并从 G1 起播，全程不改写标记 */
    if (guideForced) {
      setTimeout(function () {
        if (!App.game) newRun(defaultSeed, 1, 'basic');
        if (SD.Guide) SD.Guide.start({ replay: true });
      }, 300);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
