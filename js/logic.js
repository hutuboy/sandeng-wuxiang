/* =====================================================================
 * 三更灯 · 无相客栈  |  logic.js  ·  逻辑推演层 v2（P2/P3）
 * 纯逻辑，无 DOM，Node 可跑。
 * 把「谁的说法与物证不符」变成可组合的布尔谓词（原子命题），
 * 供「推演台」窗口与工程自检共同消费，避免两处各写一份判定。
 *
 * 设计边界（v2 相对 v1 的变化）：
 *   - 原子命题不变：某客在{话题}上的说法 ≠ 物证真值（true=不符 / false=相符 / null=未问）
 *     注：命题本身即「相符」的否定（¬），故每个 true 都已含一次「非」
 *   - 公式从「一个算子作用在全部原子」升级为**可嵌套的表达式树**：
 *       Expr = { op:'AND'|'OR'|'XOR'|'NAND', args:[ 话题字符串 | Expr ] }
 *     于是「前两条恰有一条不符，且第三条不符」这种带 ⊕ 的题可写成 AND( XOR(a,b), c )
 *   - 标准解不再是「∧ 全部不符」这一条死规则，而是**当夜残卷给出的那条式子 F**：
 *     F 由出题器按档位选（novice=∧ / basic=∨ / intermediate=¬ / advanced=⊕），
 *     且保证「满足 F 的客人恰好一位」，那一位就是无相。
 *     于是四档的差别是**逻辑深度**，而不是只调灯数与物证数。
 *   - 本层不改任何游戏状态，只读 cs + statements
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var C = SD.Core;

  /* ---------------- 1. 四档的「命格残卷」（题目结构） ----------------
   * v2 重设计（P4）：残卷不再把式子写给玩家，只写「此人是哪一种说谎的人」；
   * 判定算子藏在 FLAWS 里，是出题与验收的内部结构，不再显示成符号按钮。
   *
   * group：算子作用在前几条物证上
   * rest ：其余物证是否按「且」叠进式子。
   *        默认 false —— 式子只落在前两处，柜上多出来的那件是**干扰件**。
   *        理由（实测）：高级档只给 3~4 盏灯，若式子要吃三处 × 三人 = 9 格，
   *        玩家永远问不全，胜负退化成掷骰子（见 docs §9.8 的信息缺口表）。
   *        式子只吃 6 格时，「问谁、问哪一处」才重新变成取舍。
   * op   ：该档的判定结构（玩家看不见算子，只看见「破绽性质」）
   * depth：逻辑深度，1=一条对比 / 2=两处都要 / 3=反向排除 / 4=恰一
   */
  var PLANS = {
    novice: {
      group: 2, rest: false, op: 'OR', depth: 1,
      lead: '此人话里必有一处与柜上物证相悖。',
      ask: '找那条对不上的'
    },
    basic: {
      group: 2, rest: false, op: 'AND', depth: 2,
      lead: '此人处处与物证相悖——两处都对不上，才轮到他。',
      ask: '两处都得对不上'
    },
    intermediate: {
      group: 2, rest: false, op: 'NAND', depth: 3,
      lead: '此人并非处处对不上——他至少有一处说得圆。',
      ask: '至少一处说得圆'
    },
    advanced: {
      group: 2, rest: false, op: 'XOR', depth: 4,
      lead: '此人只错一处；除那一处，其余滴水不漏。',
      ask: '恰好一处'
    }
  };

  /* 破绽类型：玩家看到的是「哪一种说谎的人」，引擎看到的是 op。
   * drift 不占档位，是第三夜叠加的行为破绽（追问就改口）。 */
  var FLAWS = {
    substitute: {
      kind: 'substitute', tier: 'novice', label: '换值', op: 'OR', depth: 1,
      lead: PLANS.novice.lead, ask: PLANS.novice.ask, tell: '一句对不上便露底'
    },
    cumulative: {
      kind: 'cumulative', tier: 'basic', label: '累积', op: 'AND', depth: 2,
      lead: PLANS.basic.lead, ask: PLANS.basic.ask, tell: '只错一条的人不是他'
    },
    negative: {
      kind: 'negative', tier: 'intermediate', label: '否定', op: 'NAND', depth: 3,
      lead: PLANS.intermediate.lead, ask: PLANS.intermediate.ask, tell: '全错的人不是他'
    },
    quantify: {
      kind: 'quantify', tier: 'advanced', label: '恰一', op: 'XOR', depth: 4,
      lead: PLANS.advanced.lead, ask: PLANS.advanced.ask, tell: '全错、全对都不是他'
    },
    drift: {
      kind: 'drift', tier: 'night3', label: '改口', op: null, depth: 5,
      lead: '灯过三更，他的说辞会变；先前那句，且记着。',
      ask: '追问同一处，比两次说法', tell: '两次说法不同'
    }
  };
  var FLAW_ORDER = ['substitute', 'cumulative', 'negative', 'quantify', 'drift'];
  function flawOf(tier) {
    var hit = null;
    FLAW_ORDER.forEach(function (k) { if (FLAWS[k].tier === tier) hit = FLAWS[k]; });
    return hit || FLAWS.cumulative;
  }
  function flawMeta(kind) { return FLAWS[kind] || null; }


  var OPS = [
    { id: 'AND', sym: '∧', name: '与', gloss: '每条都对不上', form: 'A∧B' },
    { id: 'OR', sym: '∨', name: '或', gloss: '只要一条对不上', form: 'A∨B' },
    { id: 'NAND', sym: '¬', name: '非', gloss: '并非全部对不上（至少一条相符）', form: '¬(A∧B)' },
    { id: 'XOR', sym: '⊕', name: '异或', gloss: '恰好只有一条对不上', form: 'A⊕B' }
  ];
  function opMeta(id) {
    var hit = null;
    OPS.forEach(function (o) { if (o.id === id) hit = o; });
    return hit;
  }
  function planFor(tierId) { return PLANS[tierId] || PLANS.basic; }

  /* ---------------- 2. 原子与偏差 ---------------- */
  function atoms(cs) {
    return (cs.clues || []).map(function (c) {
      return {
        id: 'A_' + c.topic,
        topic: c.topic,
        label: C.topic(c.topic).label,
        expect: c.expect,
        clue: c.title
      };
    });
  }

  /* 从「已收集证词」算每位客人在每个物证话题上的偏差：true / false / null(未问) */
  function deviations(cs, statements) {
    var idx = {};
    (statements || []).forEach(function (s) { idx[s.guestId + '|' + s.topic] = s; });
    var out = {};
    (cs.guests || []).forEach(function (q) {
      out[q.id] = {};
      (cs.clues || []).forEach(function (c) {
        var s = idx[q.id + '|' + c.topic];
        out[q.id][c.topic] = s ? (s.value !== c.expect) : null;
      });
    });
    return out;
  }

  /* 出题期的偏差（按 alibi 真值算，不经证词） */
  function devFromAlibi(cs) {
    var out = {};
    (cs.guests || []).forEach(function (q) {
      out[q.id] = {};
      (cs.clues || []).forEach(function (c) {
        out[q.id][c.topic] = q.alibi[c.topic] !== c.expect;
      });
    });
    return out;
  }

  /* ---------------- 3. 表达式求值 ---------------- */
  /* evalExpr(dev, expr)：dev 是「话题 → true/false/null」的偏差表。
     任一子项为 null（该客这个话题还没问过）则整体返回 null（未定），
     与 v1 口径一致 —— 不许拿没问到的东西下判断。 */
  function evalExpr(dev, expr) {
    if (expr === null || expr === undefined) return null;
    if (typeof expr === 'string') {
      if (!dev) return null;
      var v = dev[expr];
      return v === undefined ? null : v;
    }
    var args = expr.args || [];
    if (!args.length) return null;
    var vals = args.map(function (a) { return evalExpr(dev, a); });
    if (vals.some(function (v) { return v === null; })) return null;
    var op = expr.op || 'AND';
    if (op === 'OR') return vals.some(Boolean);
    if (op === 'XOR') return vals.filter(Boolean).length === 1;
    if (op === 'NAND') return !vals.every(Boolean);
    return vals.every(Boolean); // AND（默认）
  }

  /* 兼容 v1 的 { op, atoms:[topic...] } 形态 */
  function toExpr(formula) {
    if (!formula) return null;
    if (typeof formula === 'string') return formula;
    if (formula.args) return formula;
    return { op: formula.op || 'AND', args: formula.atoms || [] };
  }
  function evalGuest(dev, formula) { return evalExpr(dev, toExpr(formula)); }

  /* ---------------- 4. 当夜残卷：把「计划」拼成实际表达式 ---------------- */
  /* buildFormula(cs, op)：op 是玩家在推演台选的算子，作用于「前 group 条物证」。
   * plan.rest 为真时，其余物证按「且」叠上去；否则不进式子（当作干扰件）。 */
  function buildFormula(cs, op) {
    var topics = (cs.clues || []).map(function (c) { return c.topic; });
    var plan = (cs.logic && cs.logic.plan) || { group: topics.length };
    var g = topics.slice(0, Math.max(1, Math.min(plan.group || 2, topics.length)));
    var rest = plan.rest ? topics.slice(g.length) : [];
    var useOp = op || plan.op || 'AND';
    // 前 group 条用所选算子；其余物证按 ∧ 叠加。
    // 若所选就是 ∧，就没必要套两层括号 —— 直接摊平成 n 元 ∧。
    if (!rest.length) return { op: useOp, args: g };
    if (useOp === 'AND') return { op: 'AND', args: g.concat(rest) };
    return { op: 'AND', args: [{ op: useOp, args: g }].concat(rest) };
  }

  /* 符号化：∨(来路 , 行囊) ∧ 时辰 */
  function formulaText(expr, cs) {
    if (!expr) return '';
    if (typeof expr === 'string') {
      var label = expr;
      (cs.clues || []).forEach(function (c) { if (c.topic === expr) label = C.topic(expr).label; });
      return label;
    }
    var meta = opMeta(expr.op || 'AND');
    var inner = (expr.args || []).map(function (a) { return formulaText(a, cs); }).join(' , ');
    return (meta ? meta.sym : '∧') + '(' + inner + ')';
  }

  /* ---------------- 5. 对三位客人群求值 ---------------- */
  function evaluateExpr(cs, statements, expr, devOverride) {
    var dev = devOverride || deviations(cs, statements);
    var result = {};
    (cs.guests || []).forEach(function (q) { result[q.id] = evalExpr(dev[q.id], expr); });
    var winners = (cs.guests || []).filter(function (q) { return result[q.id] === true; })
      .map(function (q) { return q.id; });
    return { dev: dev, result: result, winners: winners, expr: expr };
  }

  /* v1 兼容入口：第三个参数可以是算子 id、{op,atoms} 或表达式 */
  function evaluate(cs, statements, formula) {
    var expr = typeof formula === 'string' ? buildFormula(cs, formula) : toExpr(formula);
    return evaluateExpr(cs, statements, expr);
  }

  /* ---------------- 6. 标准解：满足残卷式 F 的唯一客人 ---------------- */
  /* cs.logic.expr 是出题期定下的 F（带算子与嵌套结构）。
     用 alibi 真值（而不是玩家已收集的证词）判定，供生成期唯一性校验。 */
  function solution(cs) {
    var devAll = devFromAlibi(cs);
    var expr = (cs.logic && cs.logic.expr) ||
      { op: 'AND', args: (cs.clues || []).map(function (c) { return c.topic; }) };
    var winners = (cs.guests || []).filter(function (q) { return evalExpr(devAll[q.id], expr) === true; });
    var ids = winners.map(function (q) { return q.id; });
    return {
      op: (cs.logic && cs.logic.op) || 'AND',
      expr: expr,
      plan: cs.logic && cs.logic.plan,
      unique: ids.length === 1 && ids[0] === cs.impostorId,
      winners: ids,
      devAll: devAll
    };
  }

  /* 生成期约束：给定表达式，检查「满足者恰好一位且就是无相」 */
  function uniqueFor(cs, expr) {
    var devAll = devFromAlibi(cs);
    var ids = (cs.guests || []).filter(function (q) { return evalExpr(devAll[q.id], expr) === true; })
      .map(function (q) { return q.id; });
    return { unique: ids.length === 1 && ids[0] === cs.impostorId, winners: ids };
  }

  /* ---------------- 7. 部分信息下的后验 ----------------
   * 灯不够把九格问全，是这游戏的常态（高级档只给三盏）。
   * 于是「某个还没问到的格子」按五五开枚举成若干种世界，
   * 数每位客人在多少种世界里满足残卷式 F —— 这才是他此刻的嫌疑度。
   * 枚举上限 2^16 个世界，超出直接放弃（交由调用方退回条数法）。
   */
  function posterior(cs, statements, expr) {
    var dev = deviations(cs, statements);
    var unknown = [];
    (cs.guests || []).forEach(function (q) {
      dev[q.id] = dev[q.id] || {};
      (cs.clues || []).forEach(function (c) {
        if (dev[q.id][c.topic] === null) unknown.push([q.id, c.topic]);
      });
    });
    var score = {}, total = 0;
    (cs.guests || []).forEach(function (q) { score[q.id] = 0; });
    if (!unknown.length) {
      (cs.guests || []).forEach(function (q) { if (evalExpr(dev[q.id], expr) === true) score[q.id] = 1; });
      return { score: score, share: score, worlds: 1, unknown: 0 };
    }
    if (unknown.length > 16) return null;
    var n = 1 << unknown.length;
    for (var m = 0; m < n; m++) {
      for (var i = 0; i < unknown.length; i++) dev[unknown[i][0]][unknown[i][1]] = !!((m >> i) & 1);
      total++;
      (cs.guests || []).forEach(function (q) {
        if (evalExpr(dev[q.id], expr) === true) score[q.id] += 1;
      });
    }
    var share = {};
    (cs.guests || []).forEach(function (q) { share[q.id] = total ? score[q.id] / total : 0; });
    return { score: score, share: share, worlds: total, unknown: unknown.length };
  }

  /* ---------------- 8. 改口（drift）与统一判定 ----------------
   * drift：无相在第 3 夜会「改口」——同一话题问到第二次，说法与第一次不同。
   * 清白客人的证词在记忆里恒等（selftest T3 就是这条不变量），于是
   * 「两次说法不同」这件事本身就是一条**行为破绽**，不依赖任何数值。
   * 它让 NPC 的信任 / 张力 / 记忆第一次真正承重：压力越大越容易改口。
   */
  function driftOf(cs, statements) {
    var seen = {};
    (statements || []).forEach(function (s) {
      if (!s || !s.guestId || !s.topic) return;
      var k = s.guestId + '|' + s.topic;
      (seen[k] = seen[k] || []).push(s.value);
    });
    var out = [];
    Object.keys(seen).forEach(function (k) {
      var uniq = seen[k].filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (uniq.length > 1) {
        var gid = k.split('|')[0];
        if (out.indexOf(gid) < 0) out.push(gid);
      }
    });
    return out;
  }

  /* judge：不依赖「玩家选了哪个算子」，只按当夜的破绽类型给结论。
   * 判定的两条来源：① 式子（破绽值）② 改口（行为破绽）。
   * 两者都指向同一位时，结论才唯一。 */
  function judge(cs, statements) {
    var expr = cs.logic && cs.logic.expr;
    var ev = expr ? evaluateExpr(cs, statements, expr) : { winners: [], result: {}, dev: {} };
    var drift = driftOf(cs, statements);
    var byDrift = (cs.drift && drift.length === 1 && drift[0] === cs.drift.guestId) ? drift[0] : null;
    var winners = ev.winners.slice();
    if (byDrift && winners.indexOf(byDrift) < 0) winners.push(byDrift);
    return {
      kind: (cs.flaw && cs.flaw.kind) || null,
      expr: expr,
      ev: ev,
      drift: drift,
      byDrift: byDrift,
      winners: winners,
      unique: winners.length === 1 && winners[0] === cs.impostorId
    };
  }

  SD.Logic = {
    OPS: OPS,
    PLANS: PLANS,
    FLAWS: FLAWS,
    FLAW_ORDER: FLAW_ORDER,
    flawOf: flawOf,
    flawMeta: flawMeta,
    planFor: planFor,
    opMeta: opMeta,
    atoms: atoms,
    deviations: deviations,
    devFromAlibi: devFromAlibi,
    toExpr: toExpr,
    evalExpr: evalExpr,
    evalGuest: evalGuest,
    buildFormula: buildFormula,
    formulaText: formulaText,
    evaluateExpr: evaluateExpr,
    evaluate: evaluate,
    solution: solution,
    uniqueFor: uniqueFor,
    posterior: posterior,
    driftOf: driftOf,
    judge: judge
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
