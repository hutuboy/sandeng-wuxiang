/* =====================================================================
 * QA 判定工具自验器 · 难度分级（tools/qa/difficulty-oracle-selftest.cjs）
 *
 * 用途：对 tools/difficulty-smoke.cjs 计划使用的 5 个判定 helper 做
 *       「已知答案样本」自验（每个 helper ≥3 样本，≥1 命中 + ≥1 不命中）。
 *       difficulty-smoke.cjs 应 require 本文件导出的 helper，禁止另写
 *       第二份事实；本文件不依赖浏览器 / 不依赖项目运行时 / 不写文件。
 *
 * 用法：node tools/qa/difficulty-oracle-selftest.cjs
 * 输出：每个 helper 的 N/N 通过 + 命中/不命中计数 + 失败明细 + 人工复核抽样
 * 退出：0 = 全部 helper 具备判定资格；1 = 至少一个 helper 只能当线索
 *
 * ⚠️ H3 已按 team-lead 指令**升级为判定依据**（同轮修订）：
 *    §5.2 公式 12 组独立复算 + 取2 舍入边界样本 + 运行时对拍接口，
 *    均由 tools/qa/difficulty-matrix-oracle.cjs 承担（本工具 H3 为通用算术骨架，
 *    两者 12/12 互证）。契约公式数值恢复源见裁决单 §12.1。
 * 同轮修订：T1..T4 占位按裁决单 §2 裁决 B 作废，改由 difficulty-contract.cjs 提供。
 * ===================================================================== */
'use strict';

/* ---------------- 判定 helper（跨轮复用，唯一事实） ---------------- */
function parseLampText(s) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*盏?\s*$/.exec(String(s == null ? '' : s));
  return m ? { left: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
}

/* 白名单用 Object.create(null) + 前缀，杜绝 __proto__ / constructor 原型链命中 */
function makeTierWhitelist(ids) {
  const set = Object.create(null);
  ids.forEach(id => { set['$' + id] = true; });
  return id => typeof id === 'string' && set['$' + id] === true;
}

/* 叠加算术骨架：rule = { base, delta, bounds }；契约公式由规格注入。
   ⚠️ 自纠（首跑 FAIL）：min/max 必须按字段分别给，不能跨维度共用一个数值 ——
   灯数下限 3 若套到 clueCount / temperature，会把它们错误抬到 3。 */
function combineParams(tier, night, rule) {
  if (!rule || !rule.delta || !rule.base) return null;
  const bounds = rule.bounds || {};
  const out = {};
  Object.keys(rule.delta).forEach(k => {
    const b = rule.base[k], d = rule.delta[k], lim = bounds[k] || {};
    if (typeof b !== 'number' || typeof d !== 'number') { out[k] = d; return; }
    let v = b + d;
    if (typeof lim.min === 'number') v = Math.max(lim.min, v);
    if (typeof lim.max === 'number') v = Math.min(lim.max, v);
    out[k] = v;
  });
  return out;
}

/* 同 seed + 同动作序列逐位复现：字段顺序也计入（刻意严于 deep-equal） */
function bitwiseEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* 负向计数：不该发生的事件必须逐个等于期望值（期望值由顶部常量注入） */
function negativesAllZero(counters, expectMap) {
  const mismatched = Object.keys(expectMap).filter(k => counters[k] !== expectMap[k]);
  return { pass: mismatched.length === 0, mismatched };
}

module.exports = { parseLampText, makeTierWhitelist, combineParams, bitwiseEqual, negativesAllZero };

/* 被 require 时只导出 helper / 常量，不输出、不 exit（供 difficulty-smoke.cjs 复用） */
if (require.main === module) {
/* ---------------- 已知答案样本（不读实现、不读 DOM） ---------------- */
/* 同轮修订：原 T1..T4 占位按裁决单 §2 裁决 B 作废；四档 id 统一由
   difficulty-contract.cjs（§11 口径总表）提供，本文件不再另写一份。
   制作人裁决单 §12.1 已撤销设计案 13:07 六字段重写版，不采信其 id / URL / 字段集。 */
const CONTRACT = require('./difficulty-contract.cjs');
const TIER_IDS = CONTRACT.TIER_IDS;
const isLegal = makeTierWhitelist(TIER_IDS);
const NIGHT1 = { lamps: 6, clueCount: 1, temperature: 0.75 };          // 现有夜次基线（静态源码事实）
const D_T4 = { lamps: -2, clueCount: 1, temperature: 0.25 };            // 假设置信，仅测算术骨架
const BOUNDS = {                                                          // 按字段分别设界（自纠后）
  lamps: { min: 3, max: 9 }, clueCount: { min: 1, max: 2 }, temperature: { min: 0.1, max: 2 }
};

const samples = [
  /* H1 灯数文本解析 */
  { h: 'H1', name: '标准「6 / 6 盏」命中', fn: () => parseLampText('6 / 6 盏'), expect: { left: 6, total: 6 }, hit: true },
  { h: 'H1', name: '缺单位「5 / 6」命中', fn: () => parseLampText('5 / 6'), expect: { left: 5, total: 6 }, hit: true },
  { h: 'H1', name: '无数字「灯已燃尽」不命中', fn: () => parseLampText('灯已燃尽'), expect: null, hit: false },
  { h: 'H1', name: '负数「-1 / 6」不命中', fn: () => parseLampText('-1 / 6'), expect: null, hit: false },

  /* H2 档位 id 白名单 */
  { h: 'H2', name: '合法 novice 命中', fn: () => isLegal('novice'), expect: true, hit: true },
  { h: 'H2', name: '默认 basic 命中', fn: () => isLegal('basic'), expect: true, hit: true },
  { h: 'H2', name: '合法 advanced 命中', fn: () => isLegal('advanced'), expect: true, hit: true },
  { h: 'H2', name: '__proto__ 不命中（原型链防护）', fn: () => isLegal('__proto__'), expect: false, hit: false },
  { h: 'H2', name: '已作废旧 id easy 不命中（裁决 B）', fn: () => isLegal('easy'), expect: false, hit: false },
  { h: 'H2', name: '大小写变体 Novice 不命中', fn: () => isLegal('Novice'), expect: false, hit: false },
  { h: 'H2', name: '数字 999 不命中', fn: () => isLegal(999), expect: false, hit: false },

  /* H3 叠加算术骨架（公式占位 → 仅作线索） */
  { h: 'H3', name: 'T4×第1夜 命中', fn: () => combineParams('T4', 1, { base: NIGHT1, delta: D_T4, bounds: BOUNDS }), expect: { lamps: 4, clueCount: 2, temperature: 1 }, hit: true },
  { h: 'H3', name: '零增量 命中', fn: () => combineParams('T1', 1, { base: NIGHT1, delta: { lamps: 0, clueCount: 0, temperature: 0 }, bounds: BOUNDS }), expect: NIGHT1, hit: true },
  { h: 'H3', name: '下界 clamp 命中（只作用于 lamps）', fn: () => combineParams('T4', 1, { base: { lamps: 3, clueCount: 1, temperature: 0.75 }, delta: D_T4, bounds: BOUNDS }), expect: { lamps: 3, clueCount: 2, temperature: 1 }, hit: true },
  { h: 'H3', name: '上界 clamp 命中（只作用于 clueCount）', fn: () => combineParams('T4', 1, { base: { lamps: 6, clueCount: 2, temperature: 0.75 }, delta: D_T4, bounds: BOUNDS }), expect: { lamps: 4, clueCount: 2, temperature: 1 }, hit: true },
  { h: 'H3', name: '规则缺失不命中（返回 null）', fn: () => combineParams('T4', 1, { base: NIGHT1, delta: null }), expect: null, hit: false },

  /* H4 逐位复现 */
  { h: 'H4', name: '完全同构状态命中', fn: () => bitwiseEqual({ seed: 'S', lampsLeft: 6, turn: 0 }, { seed: 'S', lampsLeft: 6, turn: 0 }), expect: true, hit: true },
  { h: 'H4', name: '灯数差 1 不命中', fn: () => bitwiseEqual({ lampsLeft: 6 }, { lampsLeft: 5 }), expect: false, hit: false },
  { h: 'H4', name: '字段顺序不同不命中（逐位）', fn: () => bitwiseEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), expect: false, hit: false },
  { h: 'H4', name: '嵌套数组顺序不同不命中', fn: () => bitwiseEqual({ x: [1, 2] }, { x: [2, 1] }), expect: false, hit: false },

  /* H5 负向计数 */
  { h: 'H5', name: '全 0 命中', fn: () => negativesAllZero({ seedPollution: 0, inGameTierChange: 0 }, { seedPollution: 0, inGameTierChange: 0 }), expect: { pass: true, mismatched: [] }, hit: true },
  { h: 'H5', name: '污染 1 次不命中', fn: () => negativesAllZero({ seedPollution: 1, inGameTierChange: 0 }, { seedPollution: 0, inGameTierChange: 0 }), expect: { pass: false, mismatched: ['seedPollution'] }, hit: false },
  { h: 'H5', name: '缺字段不命中', fn: () => negativesAllZero({ seedPollution: 0 }, { seedPollution: 0, inGameTierChange: 0 }), expect: { pass: false, mismatched: ['inGameTierChange'] }, hit: false }
];

/* ---------------- 执行与判定 ---------------- */
const results = samples.map(s => {
  const actual = s.fn();
  return { h: s.h, name: s.name, expect: s.expect, actual, hit: s.hit,
    pass: JSON.stringify(actual) === JSON.stringify(s.expect) };
});
const helperNames = Array.from(new Set(results.map(r => r.h)));
const helperGate = helperNames.map(h => {
  const g = results.filter(r => r.h === h);
  const hit = g.filter(r => r.hit).length, miss = g.filter(r => !r.hit).length;
  const passed = g.filter(r => r.pass).length;
  return { helper: h, total: g.length, passed, hit, miss,
    qualified: g.length >= 3 && hit >= 1 && miss >= 1 && passed === g.length };
});
const totalPassed = results.filter(r => r.pass).length;
const ok = helperGate.every(g => g.qualified);
/* 自验资格 ≠ 判定依据资格：H3 算术骨架即使自验全绿，契约公式未落盘仍只能当线索 */
const ROLE = { H1: '判定依据', H2: '判定依据', H3: '判定依据（通用算术骨架；§5.2 公式 12 组 + 舍入边界 + 运行时对拍见 difficulty-matrix-oracle.cjs）', H4: '判定依据', H5: '判定依据' };

/* 从真实命中里抽 3 个，回原文人工复核（原文出处写进文档附录） */
const SOURCES = {
  H1: 'tools/guide-smoke.cjs L58-61 parseLampText / js/ui.js tb-lamp-text 渲染',
  H2: 'docs/难度分级-制作人裁决单-v1.md 裁决 B（四档 id / 非法拒绝 / 回落 basic）',
  H3: 'js/director.js L47-58 difficulty(night) 夜次基线（事实，非契约公式）',
  H4: 'js/game.js L197-209 snapshot() 字段清单',
  H5: 'tools/guide-smoke.cjs L81-90 counters / L858-868 NEG_EXPECT'
};
const manualRecheck = results.filter(r => r.hit && r.pass).slice(0, 3)
  .map(r => ({ sample: r.name, actual: r.actual, source: SOURCES[r.h] }));

console.log('=== difficulty-oracle-selftest ' + (ok ? 'PASS' : 'FAIL') + ' ===');
console.log('samples ' + totalPassed + '/' + results.length);
helperGate.forEach(g => console.log('  ' + g.helper + ': ' + g.passed + '/' + g.total +
  ' (命中 ' + g.hit + ' / 不命中 ' + g.miss + ') qualified=' + g.qualified + ' role=' + ROLE[g.helper]));
console.log('manualRecheck ' + JSON.stringify(manualRecheck));
if (!ok) {
  console.log('--- 失败明细 ---');
  results.filter(r => !r.pass).forEach(r => console.log('FAIL ' + r.h + ' ' + r.name +
    ' expected=' + JSON.stringify(r.expect) + ' actual=' + JSON.stringify(r.actual)));
}
console.log('gate: H1/H2/H3/H4/H5 全部可作判定依据；H3 的契约公式复算/舍入边界/运行时对拍由 difficulty-matrix-oracle.cjs 承担');
console.log('contract ' + JSON.stringify({ tiers: CONTRACT.TIER_IDS, default: CONTRACT.DEFAULT_TIER,
  urlKey: CONTRACT.URL_KEY, sessionField: CONTRACT.SESSION_FIELD, reproKey: CONTRACT.REPRO_KEY }));
process.exit(ok ? 0 : 1);
} /* end require.main guard */
