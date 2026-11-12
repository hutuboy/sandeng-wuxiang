/* =====================================================================
 * 三更灯 · 无相客栈  |  npc.js
 * AI NPC 决策引擎
 *   1) 量化角色状态：信任 / 好感 / 张力 / 疑心 / 定力
 *   2) 持久记忆：每一轮交互写入 memory，影响后续决策与措辞
 *   3) 可解释的效用决策：特征向量 × 权重 → softmax 采样
 *   4) 规则层校验：非法动作在采样前被掩码，行为合法性可回溯
 *   5) 组合式语言生成：语义槽按人格 / 状态 / 记忆实时拼装
 *   6) 实际行动改变游戏状态（不只是「聊天」）
 * 全部本地推理，无网络依赖；同一 seed + 动作序列完全可复现。
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var C = SD.Core;

  var ACTIONS = ['ANSWER_TRUE', 'ANSWER_LIE', 'EVADE', 'COUNTER', 'GIFT', 'CONFIDE', 'REFUSE', 'LEAVE', 'FLEE'];

  var ACTION_META = {
    ANSWER_TRUE: { label: '据实作答', kind: 'reveal' },
    ANSWER_LIE:  { label: '虚与委蛇', kind: 'reveal' },
    EVADE:       { label: '避而不答', kind: 'withhold' },
    COUNTER:     { label: '反诘一句', kind: 'withhold' },
    GIFT:        { label: '交付物件', kind: 'act' },
    CONFIDE:     { label: '交心透底', kind: 'act' },
    REFUSE:      { label: '断然拒答', kind: 'withhold' },
    LEAVE:       { label: '起身离店', kind: 'act' },
    FLEE:        { label: '趁夜遁走', kind: 'act' }
  };

  /* 可解释权重矩阵：每行是一个动作对各特征的线性系数。
     正值 = 该特征升高时更倾向此动作。可由创作者调整，见 README。 */
  var W = {
    ANSWER_TRUE: { bias: 1.30, candor: 1.90, trustN: 1.25, tenN: -1.35, susN: -0.25, nerve: -0.40, repeated: -0.55, topicClue: 0.15, toneWarm: 0.35, tonePress: 0.95, toneShow: 0.85 },
    ANSWER_LIE:  { bias: -0.30, candor: -2.10, nerve: 1.45, susN: 0.70, tenN: 0.30, topicClue: 0.95, toneShow: -1.70, tonePress: -0.25 },
    EVADE:       { bias: -0.15, candor: -0.90, nerve: 0.75, tenN: 0.95, susN: 0.55, repeated: 1.35, topicClue: 0.45, tonePress: 0.65, evadeBoost: 1.00 },
    COUNTER:     { bias: 0.10, pride: 1.55, tenN: 0.65, trustN: -0.55, repeated: 0.35, tonePress: 0.70 },
    GIFT:        { bias: -0.65, trustN: 1.85, affN: 1.10, calm: 0.45, tenN: -0.70, susN: -0.55, toneWarm: 0.60 },
    CONFIDE:     { bias: -0.95, trustN: 2.20, affN: 1.35, candor: 0.65, tenN: -0.95, topicClue: 0.35, toneWarm: 0.90 },
    REFUSE:      { bias: -0.55, tenN: 1.45, trustN: -1.10, pride: 0.55, repeated: 0.60, tonePress: 0.50 },
    LEAVE:       { bias: -2.20, tenN: 3.30, affN: -0.55, calm: -0.85, susN: 0.35 },
    FLEE:        { bias: -2.60, susN: 3.60, tenN: 0.75, nerve: 0.55 }
  };

  function persona(guest) {
    for (var i = 0; i < C.ARCHETYPES.length; i++) if (C.ARCHETYPES[i].id === guest.archetype) return C.ARCHETYPES[i];
    return C.ARCHETYPES[0];
  }

  /* ---- 规则层：动作合法性校验（评奖硬指标） ---- */
  function legalMask(game, q, f) {
    var mask = {}, notes = [];
    var d = game.cs.difficulty;
    ACTIONS.forEach(function (a) { mask[a] = true; });

    if (q.flags.left) {
      ACTIONS.forEach(function (a) { mask[a] = false; });
      notes.push('客人已离店，本轮不再产生交互');
      return { mask: mask, notes: notes };
    }
    if (!q.isImpostor) { mask.ANSWER_LIE = false; notes.push('清白客人不会编造证词'); }
    if (q.state.trust < d.trustMaskBelow) {
      mask.CONFIDE = false; mask.GIFT = false;
      notes.push('信任 ' + C.round(q.state.trust, 0) + ' < ' + d.trustMaskBelow + ' → 拒绝交付关键道具 / 锁定交心分支');
    }
    if (q.state.tension < d.tensionLeaveAt) { mask.LEAVE = false; notes.push('张力 ' + C.round(q.state.tension, 0) + ' < ' + d.tensionLeaveAt + ' → 未达离店阈值'); }
    if (!(q.isImpostor && d.allowFlee && q.state.suspicion >= d.fleeSuspicionAt)) {
      mask.FLEE = false;
      notes.push('遁走需满足：无相身份 + 高疑心 + 第三夜');
    }
    if (f.repeated) {
      // 记忆约束：同一话题重复提问时不能再「交心透底」一次
      mask.CONFIDE = false;
      notes.push('同一话题重复提问 → 触发记忆一致性约束');
    }
    // 「添茶·缓一口气」的战术回报：茶刚添过，客人不好意思当场回避（仅维持有限次数）
    if (game.calmTurns > 0 && f.repeated !== true) {
      mask.EVADE = false;
      notes.push('刚添过茶（剩余 ' + game.calmTurns + ' 次）→ 本轮不闪避');
    }
    return { mask: mask, notes: notes };
  }

  function features(game, q, act) {
    var d = game.cs.difficulty;
    var askedBefore = q.memory.filter(function (m) { return m.topic === act.topic && m.type === 'ASK'; }).length;
    var isClue = game.cs.clues.some(function (c) { return c.topic === act.topic; });
    var p = persona(q);
    return {
      bias: 1,
      candor: p.candor, pride: p.pride, nerve: p.nerve,
      trustN: q.state.trust / 100,
      affN: q.state.affinity / 100,
      tenN: q.state.tension / 100,
      susN: q.state.suspicion / 100,
      calm: q.state.calm / 100,
      repeated: askedBefore > 0 ? 1 : 0,
      topicClue: isClue ? 1 : 0,
      toneWarm: act.tone === 'warm' ? 1 : 0,
      tonePress: act.tone === 'press' ? 1 : 0,
      /* 对簿 = 把物证摊到桌上当众一问：决策权重同「示物」，但状态增量更轻（见 apply） */
      toneShow: (act.tone === 'show' || act.tone === 'confront') ? 1 : 0,
      evadeBoost: d.evadeBoost,
      hasMemory: q.memory.length > 0 ? 1 : 0
    };
  }

  function utilities(game, q, act) {
    var f = features(game, q, act);
    var p = persona(q);
    var out = {};
    ACTIONS.forEach(function (a) {
      var w = W[a], u = 0;
      Object.keys(w).forEach(function (k) { u += (w[k] || 0) * (f[k] !== undefined ? f[k] : 0); });
      u += (p.bias[a] || 0);
      out[a] = u;
    });
    return { utilities: out, features: f };
  }

  function rngFor(game, salt) {
    return new C.RNG(game.cs.seed + '|n' + game.cs.night + '|t' + game.turn + '|' + salt);
  }

  /* ---- 组合式语言生成 ---- */
  function composeText(game, q, act, choice, rng, sp) {
    var t = C.topic(act.topic);
    var p = persona(q);
    var mood = q.state.tension > 60 ? 'cold' : q.state.trust < 35 ? 'wary' : p.id === 'proud' ? 'proud' : 'calm';
    var pre = rng.pick(C.PREFIX[mood] || C.PREFIX.calm);
    var repeated = q.memory.some(function (m) { return m.topic === act.topic && m.type === 'ASK'; });
    var memoryLine = repeated ? rng.pick(C.MEMORY_LINES) : '';
    var body = '';

    switch (choice) {
      case 'ANSWER_TRUE':
      case 'ANSWER_LIE':
        var spk = sp || { value: q.alibi[act.topic], surface: q.surface[act.topic] || makeFallback(t, q.alibi[act.topic]) };
        var val = spk.value;
        var surf = spk.surface;
        var conn = choice === 'ANSWER_LIE' ? rng.pick(C.CONNECT.lie) : rng.pick(C.CONNECT.true);
        body = conn + surf;
        break;
      case 'EVADE':       body = rng.pick(C.CONNECT.evade); break;
      case 'COUNTER':     body = rng.pick(C.CONNECT.counter); break;
      case 'REFUSE':      body = rng.pick(C.CONNECT.refuse); break;
      case 'GIFT':        body = rng.pick(C.CONNECT.gift); break;
      case 'CONFIDE':     body = '既如此，索性说透：' + (q.surface[game.cs.lieTopic] || ''); break;
      case 'LEAVE':       body = rng.pick(C.CONNECT.leave); break;
      case 'FLEE':        body = '（灯芯一爆，座位空了）'; break;
    }
    var rumor = (choice === 'COUNTER' || choice === 'LEAVE') ? rng.pick(C.RUMOR_LINES) : '';
    return [pre, memoryLine, body, rumor].filter(Boolean).join('');
  }
  function makeFallback(topic, val) { return '要问' + topic.label + '，那便是' + val + '。'; }

  /* ---- 改口（drift，P4）----
   * 第三夜的无相被问到同一处第二次时，会换一个说法；清白客人的证词恒等。
   * 这是唯一一条**不靠数值**的破绽：玩家要靠「追问 + 记着先前那句」抓住它。
   * 触发条件写死成「已有一条该话题的旧证词，且旧证词仍是原口径」，
   * 于是每局最多改口一次，不会变成无限换词的噪声。 */
  function spokenValue(game, q, topic) {
    var id = C.topic(topic);
    var base = q.alibi[topic];
    var surf = q.surface[topic] || makeFallback(id, base);
    var d = game.cs && game.cs.drift;
    if (!d || d.guestId !== q.id || d.topic !== topic) return { value: base, surface: surf, drifted: false };
    var prev = (game.statements || []).filter(function (s) { return s.guestId === q.id && s.topic === topic; });
    if (!prev.length || prev[0].value !== base) return { value: base, surface: surf, drifted: false };
    var rng = rngFor(game, 'drift|' + topic);
    var pool = id.values.filter(function (v) { return v !== base; });
    var alt = rng.pick(pool);
    return { value: alt, surface: '（他停了一停）' + makeFallback(id, alt), drifted: true };
  }

  /* ---- 主入口：给定一个玩家动作，产出可审计的 NPC 决策 ---- */
  function decide(game, act, opts) {
    opts = opts || {};
    var q = game.guests.filter(function (x) { return x.id === act.guestId; })[0];
    if (!q) return null;
    var calc = utilities(game, q, act);
    var rule = legalMask(game, q, calc.features);
    var scores = {};
    ACTIONS.forEach(function (a) { if (rule.mask[a]) scores[a] = calc.utilities[a]; });
    if (!Object.keys(scores).length) scores = { REFUSE: 1 };
    var rng = rngFor(game, q.id + act.topic + act.tone);
    var chosen = opts.force || C.softmaxSample(scores, game.cs.difficulty.temperature, rng);
    var sp = spokenValue(game, q, act.topic);

    var decision = {
      guestId: q.id, guestName: q.name, actionLabel: ACTION_META[chosen].label,
      chosen: chosen, kind: ACTION_META[chosen].kind,
      utilities: calc.utilities, features: calc.features,
      legal: rule.mask, ruleNotes: rule.notes,
      temperature: game.cs.difficulty.temperature,
      text: composeText(game, q, act, chosen, rng, sp),
      spoken: sp,
      stateBefore: C.deepClone(q.state),
      stateAfter: null, stateDelta: null,
      effects: [], memoryEntry: null, revealed: null
    };
    return decision;
  }

  /* ---- 执行决策：把「行为」真正落到游戏状态上 ---- */
  function apply(game, act, decision) {
    var q = game.guests.filter(function (x) { return x.id === act.guestId; })[0];
    var s = q.state, d = game.cs.difficulty;
    var tone = act.tone;
    // 疑心三处增量统一缩放；basic 档 1.00 逐位恒等（6*1.00 === 6，不引入浮点差异）
    var sg = d.suspicionGainScale;

    // 语气先改变状态
    if (tone === 'warm') { s.affinity += 6; s.tension -= 3; s.trust += 2; }
    // 逼问也会累积疑心：追问太急，无相会察觉自己已被盯上（原实现只有「示物」加疑心 → 遁走路径过窄）
    if (tone === 'press') { s.tension += 9; s.trust -= 3; s.suspicion += 14 * sg; }
    if (tone === 'show') { s.tension += 5; s.suspicion += 16 * sg; s.trust -= 1; }
    /* 对簿：三人同时被摆到台面上，压力分摊、故比逐个「示物」轻；
       但疑心照涨 —— 当众被问过的人，知道自己被盯上了。 */
    if (tone === 'confront') { s.tension += 3; s.suspicion += 6 * sg; s.trust -= 1; }

    switch (decision.chosen) {
      case 'ANSWER_TRUE':
        s.trust += 3; s.tension += 2;
        var spT = decision.spoken || { value: q.alibi[act.topic], surface: q.surface[act.topic] };
        decision.revealed = { guestId: q.id, guestName: q.name, topic: act.topic, value: spT.value, surface: spT.surface };
        decision.effects.push('证词入簿：' + C.topic(act.topic).label + ' = ' + spT.value);
        break;
      case 'ANSWER_LIE':
        s.tension += 5; s.suspicion += 8 * sg;
        var spL = decision.spoken || { value: q.alibi[act.topic], surface: q.surface[act.topic] };
        decision.revealed = { guestId: q.id, guestName: q.name, topic: act.topic, value: spL.value, surface: spL.surface };
        decision.effects.push('证词入簿（伪）：' + C.topic(act.topic).label + ' = ' + spL.value);
        break;
      case 'EVADE':
        s.tension += 4; s.trust -= 2; s.suspicion += 10 * sg;
        decision.effects.push('未获得证词；张力上升，他也开始提防');
        break;
      case 'COUNTER':
        s.tension += 5; s.suspicion += 10 * sg;
        decision.effects.push('未获得证词；邻座警觉');
        game.guests.forEach(function (o) { if (o.id !== q.id) o.state.suspicion += 2 * sg; });
        break;
      case 'GIFT':
        q.flags.gifted = true; s.affinity += 8;
        var t2 = C.topic(game.cs.lieTopic);
        decision.revealed = { guestId: q.id, guestName: q.name, topic: t2.id, value: q.alibi[t2.id], surface: q.surface[t2.id], byGift: true };
        decision.effects.push('交付物件 → 额外公开一条「' + t2.label + '」证词');
        break;
      case 'CONFIDE':
        q.flags.confided = true; s.trust += 8;
        var t3 = C.topic(game.cs.lieTopic);
        decision.revealed = { guestId: q.id, guestName: q.name, topic: t3.id, value: q.alibi[t3.id], surface: q.surface[t3.id], byConfide: true };
        decision.effects.push('交心透底 → 主动摊开关键话题证词');
        break;
      case 'REFUSE':
        s.tension += 8; s.trust -= 6; s.suspicion += 10 * sg;
        decision.effects.push('证词被拒；关系恶化');
        break;
      case 'LEAVE':
        q.flags.left = true; s.tension = 100;
        decision.effects.push('客人离店 → 该证词路径永久关闭');
        break;
      case 'FLEE':
        q.flags.fled = true; q.flags.left = true;
        decision.effects.push('无相遁走 → 本夜提前结束');
        break;
    }
    s.trust = C.clamp(s.trust, 0, 100);
    s.affinity = C.clamp(s.affinity, 0, 100);
    s.tension = C.clamp(s.tension, 0, 100);
    s.suspicion = C.clamp(s.suspicion, 0, 100);
    s.calm = C.clamp(100 - s.tension * 0.65, 0, 100);

    // 持久记忆：写入本轮交互，供后续决策使用
    var entry = {
      turn: game.turn, type: 'ASK', topic: act.topic, tone: tone,
      npcAction: decision.chosen, text: decision.text,
      value: decision.revealed ? decision.revealed.value : null,
      trust: C.round(s.trust, 1), tension: C.round(s.tension, 1)
    };
    q.memory.push(entry);
    decision.memoryEntry = entry;
    decision.stateAfter = C.deepClone(s);
    var delta = {};
    Object.keys(s).forEach(function (k) { delta[k] = C.round(s[k] - decision.stateBefore[k], 1); });
    decision.stateDelta = delta;
    return decision;
  }

  /* 展示「状态变化后的重新决策」：对比状态扰动前后的决策分布与合法动作集 */
  function probs(u, mask, T) {
    var keys = Object.keys(u).filter(function (k) { return mask[k]; });
    var mx = -Infinity; keys.forEach(function (k) { if (u[k] > mx) mx = u[k]; });
    var w = {}; keys.forEach(function (k) { w[k] = Math.exp((u[k] - mx) / T); });
    var s = keys.reduce(function (a, k) { return a + w[k]; }, 0);
    keys.forEach(function (k) { w[k] = w[k] / s; });
    return w;
  }
  function reDecide(game, q, act) {
    var base = utilities(game, q, act).utilities;
    var clone = C.deepClone(q);
    clone.state.trust = C.clamp(clone.state.trust - 30, 0, 100);
    clone.state.tension = C.clamp(clone.state.tension + 30, 0, 100);
    var fakeGame = { cs: game.cs, turn: game.turn, guests: [clone] };
    var after = utilities(fakeGame, clone, act).utilities;
    var fBefore = features(game, q, act), fAfter = features(fakeGame, clone, act);
    var maskBefore = legalMask(game, q, fBefore).mask;
    var maskAfter = legalMask(fakeGame, clone, fAfter).mask;
    var T = game.cs.difficulty.temperature;
    var pBefore = probs(base, maskBefore, T), pAfter = probs(after, maskAfter, T);
    var l1 = 0;
    Object.keys(pBefore).forEach(function (k) { l1 += Math.abs(pBefore[k] - (pAfter[k] || 0)); });
    Object.keys(pAfter).forEach(function (k) { if (!(k in pBefore)) l1 += pAfter[k]; });
    function top(u, mask) {
      return Object.keys(u).filter(function (k) { return mask[k]; })
        .sort(function (a, b) { return u[b] - u[a]; }).slice(0, 3)
        .map(function (k) { return { action: k, label: ACTION_META[k].label, score: C.round(u[k], 2) }; });
    }
    var maskChanged = ACTIONS.some(function (a) { return maskBefore[a] !== maskAfter[a]; });
    return {
      before: top(base, maskBefore), after: top(after, maskAfter),
      maskBefore: maskBefore, maskAfter: maskAfter, maskChanged: maskChanged,
      probBefore: pBefore, probAfter: pAfter, l1: C.round(l1, 4),
      perturbation: '信任 −30 / 张力 +30',
      changed: l1 > 0.05 || maskChanged,
      note: '同一句问话，状态改变后 NPC 的合法动作集与行为概率分布都会重新计算'
    };
  }

  SD.NPC = {
    ACTIONS: ACTIONS, ACTION_META: ACTION_META, W: W,
    persona: persona, features: features, utilities: utilities,
    legalMask: legalMask, decide: decide, apply: apply, reDecide: reDecide
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
