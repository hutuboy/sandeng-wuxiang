/* =====================================================================
 * 三更灯 · 无相客栈  |  director.js
 * AI 导演：带约束求解的程序化案件生成器
 *  - 每夜生成 3 位客人 / 1 位无相 / 1~2 条物证
 *  - 保证「矛盾唯一」「行动点足够」「理想玩家可解」，否则重掷
 *  - 全部由 seed 决定，可复现
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var C = SD.Core;

  var SURFACE = {
    origin: [
      '自{V}一路过来的，道上不好走。',
      '走的是{V}那条道，绕了些远路。',
      '从{V}方向进的城，天黑前就到了。'
    ],
    hour: [
      '到店时刚过{V}，门还没上栓。',
      '{V}的梆子敲过我才叩的门。',
      '约莫{V}光景，雨正落得密。'
    ],
    companion: [
      '一路上{V}，倒也清静。',
      '是{V}来的，没惊动旁人。',
      '{V}，一路没多说话。'
    ],
    baggage: [
      '手里拎着{V}，搁在脚边了。',
      '带的{V}，不值什么钱。',
      '就一只{V}，走哪儿都带着。'
    ],
    token: [
      '押的是{V}，柜上收着呢。',
      '柜上收了我的{V}，天亮来赎。',
      '拿{V}作的保，掌柜该记得。'
    ]
  };
  var HEDGE = [
    '若没记岔，', '约莫是——', '听人这么说，', '说不准，大约是', '算起来该是'
  ];
  var DETAIL = [
    '那会儿风大，灯笼一直晃。', '门槛上还积着水。', '伙计替我提过灯。', '街口有卖汤饼的没收摊。'
  ];

  /* v1.1.0 现状曲线：仅当 SD.Difficulty 未加载（Node 单测 / 渐进接线）时启用。
     六个新阈值是 v1.1.0 现有字面量，与 difficulty.js 的 basic 契约值逐项相等，
     保证「默认档逐字节恒等」；正常路径全部由 SD.Difficulty.apply() 派生。 */
  function legacyDifficulty(night) {
    var n = Math.max(1, Math.min(3, night | 0));
    return {
      night: n,
      lamps: n === 1 ? 6 : n === 2 ? 5 : 5,
      clueCount: n === 3 ? 2 : 1,
      evadeBoost: n === 1 ? -0.6 : n === 2 ? 0 : 0.55,
      redHerring: n >= 2,
      allowFlee: n === 3,
      temperature: n === 1 ? 0.75 : n === 2 ? 0.95 : 1.15,
      trustMaskBelow: 35, tensionLeaveAt: 70, fleeSuspicionAt: 60,
      suspicionGainScale: 1.00, chainMinForFullCredit: 2, endingBestTrust: 55
    };
  }

  function difficulty(night, tierId) {
    var D = SD.Difficulty;
    // 渐进守卫：脚本未引入时原样回落现状曲线，不引入任何行为变化
    if (!D || !D.apply) return legacyDifficulty(night);
    // apply() 是生成 cs.difficulty 的唯一入口；内部按 paramsFor(normalize(tierId), night) 查表
    return D.apply(D.normalize(tierId), { night: night });
  }

  function makeSurface(rng, topicId, value, style) {
    var pool = SURFACE[topicId];
    var s = pool[rng.int(pool.length)].replace('{V}', value);
    if (style === 'hedge') s = rng.pick(HEDGE) + s;
    if (style === 'detail') s = s + rng.pick(DETAIL);
    if (style === 'lie') s = rng.pick(HEDGE) + s;
    return s;
  }

  function otherValue(rng, topic, notThis) {
    var pool = topic.values.filter(function (v) { return v !== notThis; });
    return rng.pick(pool);
  }

  function buildCase(seed, night, diff, attempt) {
    var rng = new C.RNG(seed + '|night' + night + '|try' + attempt);
    var picks = rng.shuffle(C.GUESTS).slice(0, 3);
    var arcs = rng.shuffle(C.ARCHETYPES).slice(0, 3);
    var impostor = rng.int(3);

    var clueTpls = rng.shuffle(C.CLUE_TEMPLATES).slice(0, diff.clueCount);
    var clues = clueTpls.map(function (tpl) {
      var topic = C.topic(tpl.topic);
      var expect = rng.pick(topic.values);
      var c = tpl.make(expect);
      c.id = 'clue_' + tpl.topic;
      c.topic = tpl.topic;
      return c;
    });
    var mainTopic = clues[0].topic;
    var mainExpect = clues[0].expect;

    // 为每位客人生成 5 个话题的「真值/伪值」与措辞
    var guests = picks.map(function (p, i) {
      var gid = 'g' + i;
      var isImp = i === impostor;
      var alibi = {}, surface = {};
      C.TOPICS.forEach(function (t) {
        var val;
        var isClueTopic = clues.some(function (c) { return c.topic === t.id; });
        if (isClueTopic) {
          var clue = clues.filter(function (c) { return c.topic === t.id; })[0];
          // 无相在每条物证对应的话题上都撒谎；其余客人说真值
          val = isImp ? otherValue(rng, t, clue.expect) : clue.expect;
        } else {
          val = rng.pick(t.values);
        }
        alibi[t.id] = val;
        var style = isImp && isClueTopic ? 'lie' : 'plain';
        surface[t.id] = makeSurface(rng, t.id, val, style);
      });
      // 红鲱鱼：某位清白客人说话含糊，但「值」仍为真值 —— 考验读证词而非数不同
      if (diff.redHerring && !isImp) {
        surface[mainTopic] = makeSurface(rng, mainTopic, alibi[mainTopic], 'hedge');
      }
      return {
        id: gid, name: p.name, role: p.role, look: p.look,
        archetype: arcs[i].id, archetypeName: arcs[i].name,
        isImpostor: isImp,
        alibi: alibi, surface: surface,
        state: {
          trust: 50 + rng.int(16) - 8,
          affinity: 45 + rng.int(20) - 10,
          tension: 12 + rng.int(18),
          suspicion: 0,
          calm: 60 + rng.int(25)
        },
        memory: [], flags: { left: false, fled: false, gifted: false, confided: false },
        portraitSeed: C.hashStr(seed + p.name + night)
      };
    });

    // 给红鲱鱼只落在一位清白客人身上
    if (diff.redHerring) {
      var innocents = guests.filter(function (x) { return !x.isImpostor; });
      var rh = rng.pick(innocents);
      guests.forEach(function (x) {
        if (!x.isImpostor && x.id !== rh.id) {
          x.surface[mainTopic] = makeSurface(new C.RNG(seed + x.id + mainTopic), mainTopic, x.alibi[mainTopic], 'detail');
        }
      });
    }

    return {
      seed: String(seed), night: night, attempt: attempt,
      difficulty: diff,
      guests: guests, clues: clues,
      impostorId: guests[impostor].id,
      lieTopic: mainTopic, lieValue: guests[impostor].alibi[mainTopic],
      lamps: diff.lamps,
      solvable: false, solverTrace: []
    };
  }

  /* 约束求解：验证案件「可解且唯一」 */
  function solve(cs) {
    var trace = [];
    cs.clues.forEach(function (clue) {
      var deviants = cs.guests.filter(function (x) { return x.alibi[clue.topic] !== clue.expect; });
      trace.push({
        clue: clue.title, topic: clue.topic, expect: clue.expect,
        deviants: deviants.map(function (x) { return x.name; }),
        unique: deviants.length === 1 && deviants[0].id === cs.impostorId
      });
    });
    var cost = cs.guests.length; // 理想玩家至少问遍三人
    trace.push({ actionBudget: cs.lamps, minActionsNeeded: cost, enough: cs.lamps >= cost });
    var ok = trace.every(function (t) { return t.unique !== false && t.enough !== false; });
    return { ok: ok, trace: trace };
  }

  function generate(seed, night, tier) {
    var diff = difficulty(night, tier);
    var last = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      var cs = buildCase(seed, night, diff, attempt);
      var r = solve(cs);
      cs.solvable = r.ok;
      cs.solverTrace = r.trace;
      last = cs;
      if (r.ok) return cs;
    }
    // 理论上不会走到这里；兜底保留最后一次并标记
    last.solverTrace.push({ note: '60 次重掷均不满足约束，已返回最后候选（不应发生）' });
    return last;
  }

  /* 理想玩家：只靠证词与物证推理，返回指认结果 */
  function idealInference(cs) {
    var score = {};
    cs.guests.forEach(function (x) { score[x.id] = 0; });
    cs.clues.forEach(function (clue) {
      cs.guests.forEach(function (x) {
        if (x.alibi[clue.topic] !== clue.expect) score[x.id] += 1;
      });
    });
    var best = cs.guests[0].id, bm = -1;
    cs.guests.forEach(function (x) { if (score[x.id] > bm) { bm = score[x.id]; best = x.id; } });
    return { accuse: best, scores: score, correct: best === cs.impostorId };
  }

  SD.Director = { generate: generate, solve: solve, idealInference: idealInference, difficulty: difficulty };
  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
