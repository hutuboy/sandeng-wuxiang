/* =====================================================================
 * 三更灯 · 无相客栈  |  logic.js  ·  逻辑推演层 v1（P1）
 * 纯逻辑，无 DOM，Node 可跑。
 * 把「谁的说法与物证不符」变成可组合的布尔谓词（原子命题），
 * 供「推演台」窗口与工程自检共同消费，避免两处各写一份判定。
 *
 * 设计边界（P1）：
 *   - 原子命题：某客在{话题}上的说法 ≠ 物证真值（true=不符 / false=相符 / null=未问）
 *     注：命题本身即「相符」的否定（¬），故每个 true 都已含一次「非」
 *   - 复合公式：{ op:'AND'|'OR'|'XOR'|'NAND', atoms:[topic...] }
 *   - 标准解：无相在「全部已投放物证」上都不符（AND），由 alibi 真值判定
 *   - 本层不改任何游戏状态，只读 cs + statements
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var C = SD.Core;

  /* 每张物证 → 一个原子谓词：「客在{话题}上的说法与物证不符」 */
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

  /* 对单个客人的偏差向量求值；有未问项则返回 null（未定）
   *   AND  A∧B∧C  每条物证都要对不上（标准解：无相）
   *   OR   A∨B∨C  只要一条对不上
   *   XOR  A⊕B⊕C  恰好只有一条对不上
   *   NAND ¬(A∧B∧C) 并非全部对不上 —— 至少有一条咬得住（「非」的显式用法）
   */
  function evalGuest(dev, formula) {
    var vals = (formula.atoms || []).map(function (t) { return dev ? dev[t] : null; });
    if (!vals.length || vals.some(function (v) { return v === null; })) return null;
    var op = formula.op || 'AND';
    if (op === 'OR') return vals.some(Boolean);
    if (op === 'XOR') return vals.filter(Boolean).length === 1;
    if (op === 'NAND') return !vals.every(Boolean);   // ¬(全部不符)
    return vals.every(Boolean); // AND（默认）
  }

  /* 算子元数据：符号 / 名称 / 一句话释义 / 展开式。界面与自检共用同一份，避免两处措辞。 */
  var OPS = [
    { id: 'AND', sym: '∧', name: '与', gloss: '每条物证都对不上（标准解）', form: 'A∧B' },
    { id: 'OR', sym: '∨', name: '或', gloss: '只要一条对不上', form: 'A∨B' },
    { id: 'NAND', sym: '¬', name: '非', gloss: '并非全部对不上（至少一条相符）', form: '¬(A∧B)' },
    { id: 'XOR', sym: '⊕', name: '异或', gloss: '恰好只有一条对不上', form: 'A⊕B' }
  ];

  /* 对三位客人群求值：返回偏差表、逐客结果、命中者 */
  function evaluate(cs, statements, formula) {
    var dev = deviations(cs, statements);
    var result = {};
    (cs.guests || []).forEach(function (q) { result[q.id] = evalGuest(dev[q.id], formula); });
    var winners = (cs.guests || []).filter(function (q) { return result[q.id] === true; })
      .map(function (q) { return q.id; });
    return { dev: dev, result: result, winners: winners };
  }

  /* 标准解：无相在所有已投放物证上都不符（AND）。用 alibi 真值判定，供生成期唯一性校验 */
  function solution(cs) {
    var devAll = {};
    (cs.guests || []).forEach(function (q) {
      devAll[q.id] = (cs.clues || []).every(function (c) { return q.alibi[c.topic] !== c.expect; });
    });
    var winners = (cs.guests || []).filter(function (q) { return devAll[q.id]; });
    return {
      op: 'AND',
      atoms: (cs.clues || []).map(function (c) { return c.topic; }),
      unique: winners.length === 1 && winners[0].id === cs.impostorId,
      winners: winners.map(function (q) { return q.id; }),
      devAll: devAll
    };
  }

  SD.Logic = {
    OPS: OPS,
    atoms: atoms,
    deviations: deviations,
    evalGuest: evalGuest,
    evaluate: evaluate,
    solution: solution
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
