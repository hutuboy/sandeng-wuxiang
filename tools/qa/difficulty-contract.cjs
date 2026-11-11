/* =====================================================================
 * 难度分级 · 唯一口径常量源（tools/qa/difficulty-contract.cjs）
 *
 * 唯一依据：docs/难度分级-制作人裁决单-v1.md §0–§12
 *   - §11 口径总表：四档 id / 默认 / URL 键 / 会话字段 / 归一与取参入口 / 13 字段
 *   - §12.1：设计案 13:07「6 字段 × 72 终值」重写版**作废**；数值恢复源 =
 *            tools/qa/difficulty-matrix-oracle.cjs 顶部常量
 *   - §12.2 裁决 K：只读观测通道 SANDENG_API.getDifficulty() / DOM / 存档
 *   - §10：复现主键 (seed, night, tier)；URL 键 ?difficulty=；?guide=1 固定 basic
 *
 * ⚠️ 单一事实：所有 QA 工具与 tools/difficulty-smoke.cjs 一律 require 本文件，
 *    禁止在任何脚本里另写一份档位 id / URL 键 / 会话字段名 / 默认档。
 *    本文件只放「字符串与结构契约」，数值期望值一律取自
 *    difficulty-matrix-oracle.cjs 顶部写死常量（判据①）。
 *
 * 用法：const CONTRACT = require('./difficulty-contract.cjs');
 * 独立跑：node tools/qa/difficulty-contract.cjs  （打印口径摘要，exit 0）
 * ===================================================================== */
'use strict';

const CONTRACT = Object.freeze({
  /* ---- 规格来源（用于报告 specSource，不作为判定数值） ---- */
  SPEC_SOURCE: 'docs/难度分级-制作人裁决单-v1.md §0–§12',
  NUMERIC_SOURCE: 'tools/qa/difficulty-matrix-oracle.cjs 顶部常量（§12.1 指定恢复源）',
  DESIGN_SPEC_PENDING: 'docs/难度分级-设计案-v1.md 待恢复 v1.1（13:07 六字段重写版已作废）',
  OBSOLETE_VERSIONS: [
    'docs/难度分级-设计案-v1.md 13:07 六字段重写版（§12.1 撤销）',
    'docs/难度分级-技术接线-v1.md §9.0 架构自行终裁（§0.1 撤销）'
  ],

  /* ---- §11 口径总表 ---- */
  TIER_IDS: Object.freeze(['novice', 'basic', 'intermediate', 'advanced']),
  TIER_LABELS: Object.freeze({ novice: '新手级', basic: '初级', intermediate: '中级', advanced: '高级' }),
  DEFAULT_TIER: 'basic',                    // 严禁用 TIER_IDS[0]（那是 novice）
  LEGACY_FALLBACK_TIER: 'basic',
  URL_KEY: 'difficulty',                   // ?difficulty=<id>，不是 ?tier=
  SESSION_FIELD: 'difficultyTier',         // App.session.difficultyTier（字符串 id）
  NORMALIZE_ENTRY: 'SD.Difficulty.normalize(raw) → id',
  PARAMS_ENTRY: 'SD.Difficulty.paramsFor(tierId, night) → NightParams',
  CONFIG_SHAPE: 'CONFIG[id].nights[]（3 元素），由 derive() 从 13 项契约生成',
  CS_DIFFICULTY_FIELDS: 13,               // 原 7 + 新 6；rhFrom/fleeFrom/endingBestChain 不写入
  VERSION: 'difficulty.v1',
  SCHEMA_VERSION: 'sandeng.difficulty.v1',
  PARAM_STATE_EXPECTED: 'READY',

  /* ---- §12.2 裁决 K：三通道（只取实际值，绝不生成期望值） ---- */
  SAVE_KEY: 'sandeng.save.v2',
  SNAPSHOT_SCHEMA: 'sandeng.state.v1',
  SNAPSHOT_UNCHANGED: true,
  API_VERSION_UNCHANGED: '1.0.0',
  STATE_CHANNEL: 'SANDENG_API.getDifficulty()',       // 返回 {tier, configId, params} 深拷贝
  STATE_CHANNEL_SHAPE: Object.freeze(['tier', 'configId', 'params']),
  DOM_CHANNELS: Object.freeze([
    '[data-tier][aria-checked]',                     // 封面四档控件
    '#tb-tier[data-difficulty-tier]'                 // 顶栏
  ]),
  SAVE_CHANNEL: 'sandeng.save.v2.session.difficultyTier',

  /* ---- §10 复现与引导 ---- */
  REPRO_KEY: Object.freeze(['seed', 'night', 'tier']),
  FORBID_REPRO_ASSERTION: '同 seed 跨档案件相同（错误期望，禁止写成通过断言）',
  REQUIRED_POSITIVE_ASSERTION: '同 seed、同 night、不同 tier → 案件（客人/物证/无相 id）确实不同',
  GUIDE1_FIXED_TIER: 'basic',
  GUIDE1_FIXED_NIGHT: 1,
  GUIDE1_LAMPS_TEXT: '6 / 6 盏',
  GUIDE1_IGNORES_URL_TIER: true,
  SHARE_TEXT_HAS_TIER_LABEL: true,

  /* ---- 13 项契约键名（§3.2；值见 difficulty-matrix-oracle.cjs） ---- */
  PARAMS_13: Object.freeze([
    'Δ_lamps', 'Δ_clueCount', 'Δ_evadeBoost', 'k_temperature', 'Δ_rhFrom', 'Δ_fleeFrom',
    'trustMaskBelow', 'tensionLeaveAt', 'fleeSuspicionAt', 'suspicionGainScale',
    'chainMinForFullCredit', 'endingBestTrust', 'endingBestChain(派生)'
  ]),

  /* ---- §4.1 非法 id 8 类（精确字符串相等，一律拒绝并回落 basic） ---- */
  ILLEGAL_ID_SAMPLES: Object.freeze([
    { name: '大小写不符', value: 'BASIC' },
    { name: '首尾空格', value: ' basic ' },
    { name: '空串', value: '' },
    { name: '数字', value: '2' },
    { name: '中文档名', value: '初级' },
    { name: 'null/undefined', value: 'null' },
    { name: 'URL 编码残留', value: 'basic%20' },
    { name: '原型链键', value: '__proto__' }
  ]),
  ILLEGAL_TOAST_EXPECT: 1,
  MISSING_TOAST_EXPECT: 0,

  /* ---- 舍入边界（§5.2 取2，已知答案样本） ---- */
  ROUNDING_CASES: Object.freeze([
    { base: 1.15, k: 0.90, expect: 1.03 },
    { base: 1.15, k: 1.10, expect: 1.26 },
    { base: 0.95, k: 0.90, expect: 0.86 },
    { base: 0.75, k: 0.90, expect: 0.68 }
  ]),

  /* ---- 运行时接线探测项（不写死状态，由 difficulty-smoke.cjs 实测） ---- */
  RUNTIME_PROBE: Object.freeze([
    'index.html 是否引入 js/difficulty.js',
    'js/main.js 是否读写 App.session.difficultyTier / ?difficulty=',
    'SANDENG_API.getDifficulty() 是否可用且返回深拷贝',
    'js/difficulty.js PARAM_STATE === READY'
  ])
});

module.exports = CONTRACT;

if (require.main === module) {
  console.log('=== difficulty-contract (§11 口径总表 + §12 补裁) ===');
  console.log('tiers       ' + JSON.stringify(CONTRACT.TIER_IDS));
  console.log('default     ' + CONTRACT.DEFAULT_TIER + '  (非 TIER_IDS[0])');
  console.log('urlKey      ?' + CONTRACT.URL_KEY + '=<id>');
  console.log('session     App.session.' + CONTRACT.SESSION_FIELD);
  console.log('stateChan   ' + CONTRACT.STATE_CHANNEL);
  console.log('reproKey    ' + JSON.stringify(CONTRACT.REPRO_KEY));
  console.log('guide1      ' + CONTRACT.GUIDE1_FIXED_TIER + ' + 夜' + CONTRACT.GUIDE1_FIXED_NIGHT +
    ' + ' + CONTRACT.GUIDE1_LAMPS_TEXT + '，忽略 ?' + CONTRACT.URL_KEY);
  console.log('obsolete    ' + JSON.stringify(CONTRACT.OBSOLETE_VERSIONS));
  console.log('note        数值期望值不在本文件；见 difficulty-matrix-oracle.cjs 顶部常量');
}
