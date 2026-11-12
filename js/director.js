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
      clueCount: n === 3 ? 3 : 2,
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

  /* ---------------- P2：按档位构造「残卷式」与结构性诱饵 ----------------
   * devPatterns(tier, topics, group) 返回 [无相, 诱饵甲, 诱饵乙] 三份「不符」集合。
   * 记 A = topics[0]、B = topics[1]（式子只吃前 group 条，其余是干扰件）。
   *
   *   novice  ∧：无相处处不符；一位清白客只「记岔」一条
   *              → ∨ 会连他一起命中，∧ 才筛得掉他。
   *   basic   ∨：无相只错一处，其余人一处也不错
   *              → ∧ 无人命中，∨ 唯一。式子逼你承认「不必每条都错」。
   *   intermediate ¬：无相只错一处，两位清白客都错两处
   *              → ∧ 命中那两位（都不是他），∨ 命中三人，只有 ¬(A∧B) 落回他。
   *   advanced ⊕：无相恰错一处；一位错两处（⊕ 假）、一位一处也不错（⊕ 假）
   *              → 只有 ⊕「恰一」这一条能把他从「全错」与「全对」之间挑出来。
   *
   * 于是四档的差别是**式子结构**，不是同一道题换皮。
   */
  function devPatterns(tier, topics, group) {
    var g = topics.slice(0, Math.max(1, Math.min(group || 2, topics.length)));
    var a = g[0], b = g[1] || g[0];
    function all() { return g.slice(); }
    if (tier === 'novice') return [all(), [a], []];
    if (tier === 'intermediate') return [[a], all(), all()];
    if (tier === 'advanced') return [[b], all(), []];
    return [[a], [], []]; // basic（默认）
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
    var topics = clues.map(function (c) { return c.topic; });
    var tier = diff.tier || 'basic';

    // 残卷式 F：仅当 logic.js 已加载时构造（渐进守卫：未加载则整局按旧计数法走）
    var plan = SD.Logic ? SD.Logic.planFor(tier) : null;
    var expr = plan ? SD.Logic.buildFormula({ clues: clues, logic: { plan: plan } }, plan.op) : null;

    // 结构诱饵：按档位给出三位的「不符」集合，顺序为 [无相, 诱饵甲, 诱饵乙]
    var patterns = plan ? devPatterns(tier, topics, plan.group) : null;
    var decoyOrder = 1;

    // 为每位客人生成 5 个话题的「真值/伪值」与措辞
    var guests = picks.map(function (p, i) {
      var gid = 'g' + i;
      var isImp = i === impostor;
      var devSet = patterns ? (isImp ? patterns[0] : patterns[decoyOrder++]) : null;
      var alibi = {}, surface = {};
      C.TOPICS.forEach(function (t) {
        var val;
        var clue = null;
        clues.forEach(function (c) { if (c.topic === t.id) clue = c; });
        if (clue) {
          // 该话题在 devSet 里就「不符」（说成另一个值），否则一律说真值；
          // 逻辑层未加载时退回旧口径：无相在每条物证上都撒谎
          var deviate = devSet ? devSet.indexOf(t.id) >= 0 : isImp;
          val = deviate ? otherValue(rng, t, clue.expect) : clue.expect;
        } else {
          val = rng.pick(t.values);
        }
        alibi[t.id] = val;
        var deviates = !!clue && val !== clue.expect;
        // 说岔的一律用「拿不准」的口气起头；说真的用平铺直叙
        surface[t.id] = makeSurface(rng, t.id, val, deviates ? 'lie' : 'plain');
      });
      return {
        id: gid, name: p.name, role: p.role, look: p.look,
        archetype: arcs[i].id, archetypeName: arcs[i].name,
        isImpostor: isImp,
        alibi: alibi, surface: surface,
        devSet: devSet || [],
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

    // 措辞诱饵（不改变取值）：某位「一处也不错」的清白客人把话说得含糊，
    // 逼玩家读证词而不是数「几个叉」。与上面的结构性诱饵是两件事。
    if (diff.redHerring) {
      var clean = guests.filter(function (x) { return !x.isImpostor && !x.devSet.length; });
      var rh = clean.length ? rng.pick(clean) : null;
      if (rh) {
        rh.surface[mainTopic] = makeSurface(rng, mainTopic, rh.alibi[mainTopic], 'hedge');
        rh.hedged = mainTopic;
      }
    }

    // 无相「说岔」的最后一处 —— 交心/送礼时吐真言用这条
    var impDev = topics.filter(function (t) { return patterns ? patterns[0].indexOf(t) >= 0 : true; });
    var lieTopic = impDev.length ? impDev[impDev.length - 1] : mainTopic;

    return {
      seed: String(seed), night: night, attempt: attempt,
      difficulty: diff,
      guests: guests, clues: clues,
      impostorId: guests[impostor].id,
      lieTopic: lieTopic, lieValue: guests[impostor].alibi[lieTopic],
      logic: plan ? {
        tier: tier, op: plan.op, depth: plan.depth, plan: plan, expr: expr,
        text: SD.Logic.formulaText(expr, { clues: clues }),
        decoys: guests.filter(function (x) { return !x.isImpostor && x.devSet.length; })
          .map(function (x) { return { name: x.name, devSet: x.devSet }; })
      } : null,
      lamps: diff.lamps,
      solvable: false, solverTrace: []
    };
  }

  /* 约束求解：验证案件「可解且唯一」——以当夜残卷式 F 为准
   * F 由 logic.js 按档位构造（∧ / ∨ / ¬ / ⊕）；未加载逻辑层时退回「∧ 全部不符」。 */
  function solve(cs) {
    var trace = [];
    cs.clues.forEach(function (clue) {
      var deviants = cs.guests.filter(function (x) { return x.alibi[clue.topic] !== clue.expect; });
      trace.push({
        clue: clue.title, topic: clue.topic, expect: clue.expect,
        deviants: deviants.map(function (x) { return x.name; })
      });
    });
    var cost = cs.guests.length; // 理想玩家至少问遍三人
    trace.push({ actionBudget: cs.lamps, minActionsNeeded: cost, enough: cs.lamps >= cost });

    var nameOf = function (id) {
      var q = null; cs.guests.forEach(function (x) { if (x.id === id) q = x; });
      return q ? q.name : id;
    };

    if (SD.Logic && cs.logic && cs.logic.expr) {
      var uniq = SD.Logic.uniqueFor(cs, cs.logic.expr);
      trace.push({
        logic: cs.logic.op, expr: cs.logic.text,
        winners: uniq.winners.map(nameOf), unique: uniq.unique
      });
      return { ok: uniq.unique && cs.lamps >= cost, trace: trace };
    }

    // 兜底（逻辑层未加载）：∧ 全部不符
    var winners = cs.guests.filter(function (x) {
      return cs.clues.every(function (c) { return x.alibi[c.topic] !== c.expect; });
    });
    var andUnique = winners.length === 1 && winners[0].id === cs.impostorId;
    trace.push({ logic: 'AND', winners: winners.map(function (x) { return x.name; }), unique: andUnique });
    return { ok: andUnique && cs.lamps >= cost, trace: trace };
  }

  function generate(seed, night, tier) {
    var diff = difficulty(night, tier);
    var last = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      var cs = buildCase(seed, night, diff, attempt);
      var r = solve(cs);
      cs.solvable = r.ok;
      cs.solverTrace = r.trace;
      // 逻辑推演层（P2）：用 alibi 真值复核「满足残卷式者唯一」，并记下命中者
      if (SD.Logic && cs.logic && cs.logic.expr) {
        var sol = SD.Logic.solution(cs);
        cs.logic.winners = sol.winners;
        cs.logic.unique = sol.unique;
        cs.logicSolvable = sol.unique;
      }
      last = cs;
      if (r.ok) return cs;
    }
    // 理论上不会走到这里；兜底保留最后一次并标记
    last.solverTrace.push({ note: '60 次重掷均不满足约束，已返回最后候选（不应发生）' });
    return last;
  }

  /* 理想玩家：只靠证词与物证推理，返回指认结果
   * P2：按残卷式 F 筛人（而不是「谁的不符最多」）—— 高级档里
   * 「三处全不符」的白人清白客制造量最多，数叉会指错他。 */
  function idealInference(cs) {
    var score = {};
    cs.guests.forEach(function (x) { score[x.id] = 0; });
    cs.clues.forEach(function (clue) {
      cs.guests.forEach(function (x) {
        if (x.alibi[clue.topic] !== clue.expect) score[x.id] += 1;
      });
    });
    if (SD.Logic && cs.logic && cs.logic.expr) {
      var dev = SD.Logic.devFromAlibi(cs);
      var hits = cs.guests.filter(function (x) {
        return SD.Logic.evalExpr(dev[x.id], cs.logic.expr) === true;
      }).map(function (x) { return x.id; });
      if (hits.length === 1) {
        return { accuse: hits[0], scores: score, correct: hits[0] === cs.impostorId, by: 'logic', expr: cs.logic.text };
      }
    }
    var best = cs.guests[0].id, bm = -1;
    cs.guests.forEach(function (x) { if (score[x.id] > bm) { bm = score[x.id]; best = x.id; } });
    return { accuse: best, scores: score, correct: best === cs.impostorId, by: 'count' };
  }

  SD.Director = { generate: generate, solve: solve, idealInference: idealInference, difficulty: difficulty };
  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
