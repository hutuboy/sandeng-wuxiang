/* =====================================================================
 * QA 独立复算器 · 四档 × 三夜 12 组派生终值
 * 用法：node tools/qa/difficulty-matrix-oracle.cjs
 * 产出：stdout（自验 N/N + 12 组逐组一致 + 边界可达 + 失败明细）；exit 0/1
 *
 * 判据①：所有期望值**写死在文件顶部常量**，逐字抄自
 *        docs/难度分级-设计案-v1.md §3.1 / §3.2 / §1.1 / §1.3 / §5.3。
 *        禁止 require 运行时模块、禁止读 DOM、禁止反读被测常量。
 *        derive() 是 §5.2 公式的**独立实现**，与 §5.3 派生表互证；
 *        两者不一致即判设计案内部自相矛盾（判据④）。
 * 判据④：12 组每组实际跑一遍，逐项核合法区间与可达下界，不抽样代替。
 * 跨轮复用：导出 derive / EXPECT_MATRIX / TIER_IDS 供 difficulty-smoke.cjs 使用。
 * ===================================================================== */
'use strict';

/* 同轮修订（制作人裁决单 v1 §12.1）：本文件顶部常量被指定为「数值恢复源」；
   字符串口径统一由 difficulty-contract.cjs 提供（§11 口径总表），避免两份事实。
   §12.1 已撤销设计案 13:07 的「6 字段 × 72 终值」重写版，不采信其 id / URL / 字段集。
   H3 升级：新增 §5.2 取2 舍入边界已知答案样本 + compareWithRuntime() 运行时对拍接口。 */
const CONTRACT = require('./difficulty-contract.cjs');

/* ---------------- 写死契约常量（唯一来源：设计案 §3.1/§3.2/§1.1/§1.3/§5.3） ---------------- */
const TIER_IDS = CONTRACT.TIER_IDS;
const DEFAULT_TIER = CONTRACT.DEFAULT_TIER;
const D0 = {                                                         // §1.1 夜数曲线（读码所得基线）
  1: { lamps: 6, clueCount: 1, evadeBoost: -0.60, temperature: 0.75 },
  2: { lamps: 5, clueCount: 1, evadeBoost: 0.00, temperature: 0.95 },
  3: { lamps: 5, clueCount: 2, evadeBoost: 0.55, temperature: 1.15 }
};
const T = {                                                          // §3.2 13 项契约（12 项数值 + 1 派生）
  novice:       { dLamps: 2,  dClue: 0, dEvade: -0.20, kTemp: 0.90, dRhFrom: 2,  dFleeFrom: 1,
                  trustMaskBelow: 25, tensionLeaveAt: 80, fleeSuspicionAt: 80, suspicionGainScale: 0.70, chainMinForFullCredit: 1, endingBestTrust: 45 },
  basic:        { dLamps: 0,  dClue: 0, dEvade: 0,     kTemp: 1.00, dRhFrom: 0,  dFleeFrom: 0,
                  trustMaskBelow: 35, tensionLeaveAt: 70, fleeSuspicionAt: 60, suspicionGainScale: 1.00, chainMinForFullCredit: 2, endingBestTrust: 55 },
  intermediate: { dLamps: -1, dClue: 1, dEvade: 0.15,  kTemp: 1.10, dRhFrom: -1, dFleeFrom: -1,
                  trustMaskBelow: 40, tensionLeaveAt: 65, fleeSuspicionAt: 55, suspicionGainScale: 1.20, chainMinForFullCredit: 3, endingBestTrust: 60 },
  advanced:     { dLamps: -2, dClue: 1, dEvade: 0.30,  kTemp: 1.20, dRhFrom: -1, dFleeFrom: -1,
                  trustMaskBelow: 45, tensionLeaveAt: 60, fleeSuspicionAt: 48, suspicionGainScale: 1.40, chainMinForFullCredit: 3, endingBestTrust: 65 }
};
const RANGE = {                                                      // §1.3 合法区间
  lamps: [3, 9], clueCount: [1, 3], evadeBoost: [-1.00, 1.00], temperature: [0.40, 1.60],
  rhFrom: [1, 4], fleeFrom: [2, 4], trustMaskBelow: [25, 55], tensionLeaveAt: [25, 90],
  fleeSuspicionAt: [1, 90], suspicionGainScale: [0.50, 1.50], chainMinForFullCredit: [1, 6],
  endingBestTrust: [45, 70]
};
/* §5.3 12 组派生终值表（逐行抄录，作为期望值） */
const EXPECT_MATRIX = {
  'novice|1':        { lamps: 8, clueCount: 1, evadeBoost: -0.80, temperature: 0.68, rhFrom: 4, fleeFrom: 4, trustMaskBelow: 25, tensionLeaveAt: 80, fleeSuspicionAt: 80, suspicionGainScale: 0.70, chainMinForFullCredit: 1, endingBestTrust: 45 },
  'novice|2':        { lamps: 7, clueCount: 1, evadeBoost: -0.20, temperature: 0.86, rhFrom: 4, fleeFrom: 4, trustMaskBelow: 25, tensionLeaveAt: 80, fleeSuspicionAt: 80, suspicionGainScale: 0.70, chainMinForFullCredit: 1, endingBestTrust: 45 },
  'novice|3':        { lamps: 7, clueCount: 2, evadeBoost: 0.35,  temperature: 1.03, rhFrom: 4, fleeFrom: 4, trustMaskBelow: 25, tensionLeaveAt: 80, fleeSuspicionAt: 80, suspicionGainScale: 0.70, chainMinForFullCredit: 1, endingBestTrust: 45 },
  'basic|1':         { lamps: 6, clueCount: 1, evadeBoost: -0.60, temperature: 0.75, rhFrom: 2, fleeFrom: 3, trustMaskBelow: 35, tensionLeaveAt: 70, fleeSuspicionAt: 60, suspicionGainScale: 1.00, chainMinForFullCredit: 2, endingBestTrust: 55 },
  'basic|2':         { lamps: 5, clueCount: 1, evadeBoost: 0.00,  temperature: 0.95, rhFrom: 2, fleeFrom: 3, trustMaskBelow: 35, tensionLeaveAt: 70, fleeSuspicionAt: 60, suspicionGainScale: 1.00, chainMinForFullCredit: 2, endingBestTrust: 55 },
  'basic|3':         { lamps: 5, clueCount: 2, evadeBoost: 0.55,  temperature: 1.15, rhFrom: 2, fleeFrom: 3, trustMaskBelow: 35, tensionLeaveAt: 70, fleeSuspicionAt: 60, suspicionGainScale: 1.00, chainMinForFullCredit: 2, endingBestTrust: 55 },
  'intermediate|1':  { lamps: 5, clueCount: 2, evadeBoost: -0.45, temperature: 0.83, rhFrom: 1, fleeFrom: 2, trustMaskBelow: 40, tensionLeaveAt: 65, fleeSuspicionAt: 55, suspicionGainScale: 1.20, chainMinForFullCredit: 3, endingBestTrust: 60 },
  'intermediate|2':  { lamps: 4, clueCount: 2, evadeBoost: 0.15,  temperature: 1.05, rhFrom: 1, fleeFrom: 2, trustMaskBelow: 40, tensionLeaveAt: 65, fleeSuspicionAt: 55, suspicionGainScale: 1.20, chainMinForFullCredit: 3, endingBestTrust: 60 },
  'intermediate|3':  { lamps: 4, clueCount: 3, evadeBoost: 0.70,  temperature: 1.26, rhFrom: 1, fleeFrom: 2, trustMaskBelow: 40, tensionLeaveAt: 65, fleeSuspicionAt: 55, suspicionGainScale: 1.20, chainMinForFullCredit: 3, endingBestTrust: 60 },
  'advanced|1':      { lamps: 4, clueCount: 2, evadeBoost: -0.30, temperature: 0.90, rhFrom: 1, fleeFrom: 2, trustMaskBelow: 45, tensionLeaveAt: 60, fleeSuspicionAt: 48, suspicionGainScale: 1.40, chainMinForFullCredit: 3, endingBestTrust: 65 },
  'advanced|2':      { lamps: 3, clueCount: 2, evadeBoost: 0.30,  temperature: 1.14, rhFrom: 1, fleeFrom: 2, trustMaskBelow: 45, tensionLeaveAt: 60, fleeSuspicionAt: 48, suspicionGainScale: 1.40, chainMinForFullCredit: 3, endingBestTrust: 65 },
  'advanced|3':      { lamps: 3, clueCount: 3, evadeBoost: 0.85,  temperature: 1.38, rhFrom: 1, fleeFrom: 2, trustMaskBelow: 45, tensionLeaveAt: 60, fleeSuspicionAt: 48, suspicionGainScale: 1.40, chainMinForFullCredit: 3, endingBestTrust: 65 }
};

/* ---------------- §5.2 公式的独立实现（不引用任何运行时代码） ----------------
   ⚠️ clamp 按字段分别设界：灯数下限 3 不得套到 clueCount / temperature
   （本轮自验器首跑真实复现过该误伤，见 difficulty-oracle-selftest.cjs 注释）。 */
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function round2(x) { return Math.round(x * 100) / 100; }   // §5.2「取2」，与 C.round(x,2) 一致

function derive(tierId, night) {
  if (TIER_IDS.indexOf(tierId) < 0 || !D0[night]) return null;
  const t = T[tierId], d = D0[night];
  const r = {};
  r.lamps = clamp(d.lamps + t.dLamps, RANGE.lamps[0], RANGE.lamps[1]);
  r.clueCount = clamp(d.clueCount + t.dClue, RANGE.clueCount[0], RANGE.clueCount[1]);
  r.evadeBoost = clamp(round2(d.evadeBoost + t.dEvade), RANGE.evadeBoost[0], RANGE.evadeBoost[1]);
  r.temperature = clamp(round2(d.temperature * t.kTemp), RANGE.temperature[0], RANGE.temperature[1]);
  r.rhFrom = clamp(2 + t.dRhFrom, RANGE.rhFrom[0], RANGE.rhFrom[1]);
  r.fleeFrom = clamp(3 + t.dFleeFrom, RANGE.fleeFrom[0], RANGE.fleeFrom[1]);
  r.trustMaskBelow = t.trustMaskBelow;
  r.tensionLeaveAt = t.tensionLeaveAt;
  r.fleeSuspicionAt = t.fleeSuspicionAt;
  r.suspicionGainScale = t.suspicionGainScale;
  r.chainMinForFullCredit = t.chainMinForFullCredit;
  r.endingBestTrust = t.endingBestTrust;
  r.endingBestChain = 3 * r.clueCount;                     // §5.2 L259 派生，不设独立数值
  return r;
}

/* H3 升级（team-lead 指令）：契约公式独立复算 → 与运行时 paramsFor(tier,night)
   输出逐项对拍。运行时未接线（fn 缺失）→ covered:false，如实标注，不猜测。
   注意：期望值始终来自本文件顶部写死常量，绝不从运行时输出反推（判据①）。 */
function compareWithRuntime(runtimeParamsFor) {
  if (typeof runtimeParamsFor !== 'function') {
    return { covered: false, reason: 'IMPL_NOT_WIRED', total: 12, passed: 0, mismatched: [] };
  }
  const mismatched = [];
  for (const tier of TIER_IDS) {
    for (let n = 1; n <= 3; n++) {
      const key = tier + '|' + n, expect = EXPECT_MATRIX[key];
      let theirs;
      try { theirs = runtimeParamsFor(tier, n); }
      catch (e) { mismatched.push(key + ':THROW ' + e.message); continue; }
      if (!theirs) { mismatched.push(key + ':NULL'); continue; }
      const proj = {};
      Object.keys(expect).forEach(k => { proj[k] = theirs[k]; });
      if (JSON.stringify(proj) !== JSON.stringify(expect)) {
        mismatched.push(key + ':MISMATCH ' + JSON.stringify(proj));
      }
    }
  }
  return { covered: true, total: 12, passed: 12 - mismatched.length, mismatched };
}

module.exports = { derive, compareWithRuntime, round2, CONTRACT,
  TIER_IDS, DEFAULT_TIER, T, D0, RANGE, EXPECT_MATRIX };

/* 被 require 时只导出 helper / 常量，不输出、不 exit（供 difficulty-smoke.cjs 复用） */
if (require.main === module) {
/* ---------------- 判定工具先自验：≥3 已知答案样本，含命中与不命中 ---------------- */
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* ⚠️ 自纠（首跑 FAIL 3/6）：§5.3 派生表只有 12 列，endingBestChain 是 §5.2 派生列，
   不在表内。比较必须按表键集投影，否则字段数不等会把命中样本误判为 FAIL。
   派生列由下方 boundary 段单独校验（chainDerived）。 */
function project(actual, expect) {
  const o = {};
  Object.keys(expect).forEach(k => { o[k] = actual[k]; });
  return o;
}
const samples = [
  { name: 'novice×第1夜 命中（上界极值 lamps=8）', fn: () => project(derive('novice', 1), EXPECT_MATRIX['novice|1']),
    expect: EXPECT_MATRIX['novice|1'], hit: true },
  { name: 'basic×第2夜 命中（默认档 ≡ D₀ 恒等性）', fn: () => project(derive('basic', 2), EXPECT_MATRIX['basic|2']),
    expect: EXPECT_MATRIX['basic|2'], hit: true },
  { name: 'advanced×第3夜 命中（下界极值 lamps=3）', fn: () => project(derive('advanced', 3), EXPECT_MATRIX['advanced|3']),
    expect: EXPECT_MATRIX['advanced|3'], hit: true },
  { name: '同夜不同档必须不等（阴性对照）', fn: () => eq(derive('basic', 3), EXPECT_MATRIX['advanced|3']),
    expect: false, hit: false },
  { name: '非法 id「easy」必须被拒绝（原型链之外的实测）', fn: () => derive('easy', 1),
    expect: null, hit: false },
  { name: '非法夜次 0 必须被拒绝', fn: () => derive('basic', 0),
    expect: null, hit: false },
  /* H3 升级：§5.2「取2」舍入边界已知答案样本（team-lead 指令，含阴性对照） */
  { name: '舍入边界 1.15×0.90 → 1.03（命中）', fn: () => round2(1.15 * 0.90), expect: 1.03, hit: true },
  { name: '舍入边界 1.15×1.10 → 1.26（命中）', fn: () => round2(1.15 * 1.10), expect: 1.26, hit: true },
  { name: '舍入边界 0.95×0.90 → 0.86（命中）', fn: () => round2(0.95 * 0.90), expect: 0.86, hit: true },
  { name: '舍入边界阴性对照：1.15×0.90 不是 1.04', fn: () => round2(1.15 * 0.90) === 1.04,
    expect: false, hit: false }
];
const results = samples.map(s => {
  const actual = s.fn();
  return { name: s.name, actual, expect: s.expect, hit: s.hit,
    pass: JSON.stringify(actual) === JSON.stringify(s.expect) };
});
const passed = results.filter(r => r.pass).length;
const hits = results.filter(r => r.hit).length, misses = results.filter(r => !r.hit).length;
const harnessOk = results.length >= 3 && hits >= 1 && misses >= 1 && passed === results.length;

/* ---------------- 判据④：12 组每组实际跑一遍 + 边界可达 ---------------- */
const matrix = [];
for (const tier of TIER_IDS) {
  for (let night = 1; night <= 3; night++) {
    const key = tier + '|' + night;
    const actual = derive(tier, night), expect = EXPECT_MATRIX[key];
    const matched = eq(Object.keys(expect).reduce((o, k) => { o[k] = actual[k]; return o; }, {}), expect);
    const outOfRange = Object.keys(RANGE).filter(k => actual[k] < RANGE[k][0] || actual[k] > RANGE[k][1]);
    const solvable = actual.lamps >= 3;                                  // 手算：3 位客人至少问遍三人
    const chainDerived = actual.endingBestChain === 3 * actual.clueCount; // §5.2 派生一致
    matrix.push({ key, matched, outOfRange, solvable, chainDerived, lamps: actual.lamps,
      clueCount: actual.clueCount, temperature: actual.temperature });
  }
}
const matrixOk = matrix.length === 12 && matrix.every(m =>
  m.matched && m.outOfRange.length === 0 && m.solvable && m.chainDerived);

/* ---------------- 输出 ---------------- */
console.log('=== difficulty-matrix-oracle ' + (harnessOk && matrixOk ? 'PASS' : 'FAIL') + ' ===');
console.log('harnessSelftest ' + passed + '/' + results.length +
  ' (命中 ' + hits + ' / 不命中 ' + misses + ') qualified=' + harnessOk);
results.filter(r => !r.pass).forEach(r => console.log('  FAIL ' + r.name +
  ' expected=' + JSON.stringify(r.expect) + ' actual=' + JSON.stringify(r.actual)));
console.log('matrix ' + matrix.filter(m => m.matched).length + '/12 与 §5.3 派生表逐项一致');
console.log('boundary ' + matrix.filter(m => m.outOfRange.length === 0 && m.solvable && m.chainDerived).length +
  '/12 合法区间 + lamps>=3 + endingBestChain=3*clueCount 全成立');
console.log('extremes ' + JSON.stringify({
  upper: matrix.find(m => m.key === 'novice|1'),
  lower: matrix.find(m => m.key === 'advanced|3'),
  basicIdentity: matrix.filter(m => m.key.indexOf('basic|') === 0).map(m => m.matched)
}));
console.log('manualRecheck ' + JSON.stringify(results.filter(r => r.hit && r.pass).slice(0, 3)
  .map(r => ({ sample: r.name, source: 'docs/难度分级-设计案-v1.md §5.3 派生终值表' }))));
console.log('note: 期望值来自 §3.2 契约 / §5.3 表（写死常量）；derive() 为 §5.2 公式独立实现；二者互证。');
console.log('contract ' + JSON.stringify({ tiers: CONTRACT.TIER_IDS, default: CONTRACT.DEFAULT_TIER,
  urlKey: CONTRACT.URL_KEY, sessionField: CONTRACT.SESSION_FIELD, reproKey: CONTRACT.REPRO_KEY }));
console.log('runtimeCompare ' + JSON.stringify(compareWithRuntime(null)) +
  '  // 运行时未接线，本轮如实标未覆盖，待实现完成后由 difficulty-smoke.cjs 注入 paramsFor 对拍');
process.exit(harnessOk && matrixOk ? 0 : 1);
} /* end require.main guard */
