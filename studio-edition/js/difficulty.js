/* =====================================================================
 * 三更灯 · 无相客栈  |  difficulty.js   ·   终版 v1
 *
 * 版本沿革：skeleton-v0（骨架，数值全 null） → difficulty.v1（本版，PARAM_STATE=READY）
 *
 * 唯一裁决基准：docs/难度分级-制作人裁决单-v1.md（制作人，终裁，实施与验收一律以本单为准）
 * 唯一数值来源：docs/难度分级-设计案-v1.md §3.2 十三项契约值 / §1.1 D₀(n) / §5.2 叠加公式
 * 已作废未采纳：docs/难度分级-技术接线-v1.md §9.0「架构自行终裁」—— 制作人裁决单 §0.1
 *   明确将其降级为差异溯源记录（成员不得自行宣布终裁、不得互相下发调整清单），
 *   故本版不采用 §9.0 的 DEFAULT_ID='easy' / params 数组化 / difficulty.config.v0。
 *
 * 裁决单内部两处未同步文字的施工解读（已上报制作人追认，解读以「单一事实载体」为准）：
 *   ① §3 初版「CONFIG[id].nights[] 每元素为运行期终值」与 §3 v1.1 修订
 *      「禁止把 §5.3 的 12 组派生终值硬编码进运行时配置」：本版保留 nights[3]，
 *      但每元素由 derive() 按 §5.2 公式计算生成并冻结，是只读派生视图、非独立录入；
 *      唯一录入处只有 CONTRACT_VALUES（12 项跨夜恒定契约值）与 BASE_NIGHTS（D₀(n)）。
 *   ② §4 裁决 D「PARAM_KEYS 换成裁决 C 字段名」：PARAM_KEYS 定为裁决 C 的 13 个
 *      运行期字段名（7 保留 + 6 新增）；配置层的 12 项契约参数键另立 CONTRACT_KEYS。
 *      第 13 项 endingBestChain 为派生量（= clueCount × 3），按设计案「不设独立数值」
 *      不进配置、不进 cs.difficulty，由 game.js 现算，列入 DERIVED_KEYS 仅作声明。
 *
 * 接线状态（v1.2.0 已完成，裁决单 §5 裁决 E）：index.html 在 core.js 之后、director.js 之前引入；
 *   director.js（legacyDifficulty 渐进守卫 / difficulty(night,tier) / generate 第三参）、
 *   npc.js（trustMaskBelow / tensionLeaveAt / fleeSuspicionAt / suspicionGainScale）、
 *   game.js（chainMinForFullCredit / endingBestTrust）、
 *   main.js（session.difficultyTier / ?difficulty= 解析 / SANDENG_API.getDifficulty()）、
 *   ui.js + style.css（封面四档 #tier-pick / 顶栏 #tb-tier）均已按 13 字段消费。
 *
 * 硬约束：
 *   - 零依赖（不 require / import）、不读 DOM、不碰平台存储、不发网络、不用定时器
 *   - 配置层只读：IDS / LABELS / CONTRACT_KEYS / PARAM_KEYS / DERIVED_KEYS /
 *     BASE_NIGHTS / CONFIG（含 nights[] 每元素）全部深冻结
 *   - 运行期快照按裁决 D：apply() 返回**普通对象**（不冻结，便于 JSON.stringify 进存档）
 *   - 无全局可变状态：无计数器、无缓存句柄、无模块级可变单例
 *   - SD 兜底：命名空间由 js/core.js 建立，未定义时不挂载、不抛错、不反向创建全局
 *   - CommonJS：require('./js/difficulty.js') 直接返回 Difficulty 对象（非 SD），保持不变
 * ===================================================================== */
(function (g) {
  'use strict';

  /* ---------------- 1. 版本键与默认档（制作人裁决单 §2 / §4） ---------------- */
  var VERSION = 'difficulty.v1';
  var SCHEMA_VERSION = 'sandeng.difficulty.v1';   // cs.difficulty.configId 取此值
  var PARAM_SOURCE = 'docs/难度分级-设计案-v1.md';
  var PARAM_STATE = 'READY';
  var DEFAULT_TIER_ID = 'basic';                  // 初级；严禁用 IDS[0]（那是 novice）

  var IDS = ['novice', 'basic', 'intermediate', 'advanced'];
  var LABELS = {
    novice:       '新手级',
    basic:        '初级',
    intermediate: '中级',
    advanced:     '高级'
  };

  /* ---------------- 2. 字段集（制作人裁决单 §3 裁决 C） ---------------- */
  // 配置层：设计案 §3.2 十三项契约参数中「有独立数值」的 12 项（唯一数值录入来源）
  var CONTRACT_KEYS = [
    'Δ_lamps', 'Δ_clueCount', 'Δ_evadeBoost',
    'k_temperature', 'Δ_rhFrom', 'Δ_fleeFrom',
    'trustMaskBelow', 'tensionLeaveAt', 'fleeSuspicionAt', 'suspicionGainScale',
    'chainMinForFullCredit', 'endingBestTrust'
  ];
  // 运行期字段集：现有 7 键（不得改名）+ 新增 6 阈值（逐字采用设计案 §3.2）
  var PARAM_KEYS = [
    'night', 'lamps', 'clueCount', 'evadeBoost', 'redHerring', 'allowFlee', 'temperature',
    'trustMaskBelow', 'tensionLeaveAt', 'fleeSuspicionAt', 'suspicionGainScale',
    'chainMinForFullCredit', 'endingBestTrust'
  ];
  // 派生量：不进配置、不进 cs.difficulty，由 game.js 以 clueCount * 3 现算
  var DERIVED_KEYS = ['endingBestChain'];

  /* ---------------- 3. D₀(n) 现状三夜基线（设计案 §1.1，读码所得） ---------------- */
  // redHerring / allowFlee 不在此存值：由 n >= rhFrom / n >= fleeFrom 派生，避免第二份事实。
  // 注：clueCount 于 v1.3.0 由 1/1/2 上调为 2/2/3 —— 原值下每夜只有 1 条物证话题，
  // 3 位客人问遍即「无话可问」，一局 4 步结束（实测 120 seeds 平均 4.79 步）；
  // 上调后每夜有 2~3 条物证可交叉验证，问话自然变成 5~7 步。lamps 不动，保持「六盏灯」叙事。
  var BASE_NIGHTS = [
    { night: 1, lamps: 6, clueCount: 2, evadeBoost: -0.60, temperature: 0.75, rhFrom: 2, fleeFrom: 3 },
    { night: 2, lamps: 5, clueCount: 2, evadeBoost: 0,    temperature: 0.95, rhFrom: 2, fleeFrom: 3 },
    { night: 3, lamps: 5, clueCount: 3, evadeBoost: 0.55,  temperature: 1.15, rhFrom: 2, fleeFrom: 3 }
  ];

  /* ---------------- 4. 十三项契约值（唯一数值录入处，逐字取自设计案 §3.2） ----------------
   * 6 项叠加分量跨夜恒定、6 项绝对阈值跨夜恒定；第 13 项 endingBestChain 为派生量不入此表。
   * basic 的 6 项叠加分量全 0 / ×1.00、6 项阈值逐一等于现有字面量 ⇒ D(n,basic) ≡ D₀(n)。
   */
  var CONTRACT_VALUES = {
    novice: {
      'Δ_lamps': 2,  'Δ_clueCount': 0, 'Δ_evadeBoost': -0.20,
      'k_temperature': 0.90, 'Δ_rhFrom': 2,  'Δ_fleeFrom': 1,
      trustMaskBelow: 25, tensionLeaveAt: 80, fleeSuspicionAt: 80,
      suspicionGainScale: 0.70, chainMinForFullCredit: 1, endingBestTrust: 45
    },
    basic: {
      'Δ_lamps': 0,  'Δ_clueCount': 0, 'Δ_evadeBoost': 0,
      'k_temperature': 1.00, 'Δ_rhFrom': 0,  'Δ_fleeFrom': 0,
      trustMaskBelow: 35, tensionLeaveAt: 70, fleeSuspicionAt: 60,
      suspicionGainScale: 1.00, chainMinForFullCredit: 2, endingBestTrust: 55
    },
    intermediate: {
      'Δ_lamps': -1, 'Δ_clueCount': 1, 'Δ_evadeBoost': 0.15,
      'k_temperature': 1.10, 'Δ_rhFrom': -1, 'Δ_fleeFrom': -1,
      trustMaskBelow: 40, tensionLeaveAt: 65, fleeSuspicionAt: 55,
      suspicionGainScale: 1.20, chainMinForFullCredit: 3, endingBestTrust: 60
    },
    advanced: {
      'Δ_lamps': -2, 'Δ_clueCount': 1, 'Δ_evadeBoost': 0.30,
      'k_temperature': 1.20, 'Δ_rhFrom': -1, 'Δ_fleeFrom': -1,
      trustMaskBelow: 45, tensionLeaveAt: 60, fleeSuspicionAt: 48,
      suspicionGainScale: 1.40, chainMinForFullCredit: 3, endingBestTrust: 65
    }
  };

  /* ---------------- 5. 私有工具（不外泄） ---------------- */
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // §5.2「取 2 位」语义：全模块唯一实现，与 js/core.js 的 C.round(x,2) 同源。
  // 1.15×0.90 / 1.15×1.10 恰落在 .5 舍入边界，此处统一处理，禁止各处自行 toFixed。
  function round2(x) { return Math.round(x * 100) / 100; }

  function deepFreeze(o) {
    if (!o || typeof o !== 'object') return o;
    if (!Object.isFrozen(o)) Object.freeze(o);
    Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    return o;
  }

  // 设计案 §4.1：精确字符串相等，禁止 parseInt / includes / startsWith / 模糊匹配
  function validate(id) {
    return typeof id === 'string' &&
      Object.prototype.hasOwnProperty.call(LABELS, id);
  }

  // 唯一回落入口（制作人裁决单 §2）：非法 / 缺失一律 basic，永不返回 null
  function normalize(raw) {
    var candidate = null;
    if (typeof raw === 'string') {
      candidate = raw;
    } else if (raw && typeof raw === 'object') {
      candidate = raw.difficultyId;
      if (typeof candidate !== 'string') candidate = raw.difficulty;
    }
    return validate(candidate) ? candidate : DEFAULT_TIER_ID;
  }

  function toNight(night) {
    return clamp(Math.floor(Number(night)) || 1, 1, BASE_NIGHTS.length);
  }

  /* ---------------- 6. derive()：§5.2 叠加公式的纯函数实现 ----------------
   * 档位分量 T(tier) 跨夜恒定、夜数分量 D₀(n) 跨档恒定，二者正交，互不读取。
   * 运算顺序与 §5.2 逐式一致；整数项不取整；倍率结果先取两位再入夹取。
   */
  function derive(tier, night) {
    var id = normalize(tier);
    var n = toNight(night);
    var d = BASE_NIGHTS[n - 1];
    var t = CONTRACT_VALUES[id];

    var lamps = clamp(d.lamps + t['Δ_lamps'], 3, 9);
    var clueCount = clamp(d.clueCount + t['Δ_clueCount'], 1, 3);
    var evadeBoost = clamp(round2(d.evadeBoost + t['Δ_evadeBoost']), -1.00, 1.00);
    var temperature = clamp(round2(d.temperature * t['k_temperature']), 0.40, 1.60);
    var rhFrom = clamp(2 + t['Δ_rhFrom'], 1, 4);
    var fleeFrom = clamp(3 + t['Δ_fleeFrom'], 2, 4);

    return {
      night: n,
      lamps: lamps,
      clueCount: clueCount,
      evadeBoost: evadeBoost,
      redHerring: n >= rhFrom,
      allowFlee: n >= fleeFrom,
      temperature: temperature,
      trustMaskBelow: t.trustMaskBelow,
      tensionLeaveAt: t.tensionLeaveAt,
      fleeSuspicionAt: t.fleeSuspicionAt,
      suspicionGainScale: t.suspicionGainScale,
      chainMinForFullCredit: t.chainMinForFullCredit,
      endingBestTrust: t.endingBestTrust,
      tier: id,
      rhFrom: rhFrom,
      fleeFrom: fleeFrom
    };
  }

  /* ---------------- 7. CONFIG：契约值 + 冻结的派生只读视图 nights[3] ----------------
   * nights[] 不是第二份事实：它由 derive() 在模块初始化时计算并冻结，无独立编辑权。
   * 设计案 §5.3 的 12 组派生终值只作 QA 写死期望值，不在本文件硬编码。
   */
  var CONFIG = {};
  IDS.forEach(function (id) {
    var nights = [];
    BASE_NIGHTS.forEach(function (b, i) { nights.push(derive(id, i + 1)); });
    var tier = { id: id, label: LABELS[id], nights: nights };
    CONTRACT_KEYS.forEach(function (k) { tier[k] = CONTRACT_VALUES[id][k]; });
    CONFIG[id] = tier;
  });

  /* ---------------- 8. 对外 API（制作人裁决单 §4 裁决 D） ----------------
   * 全部纯函数：不改入参、不写全局、不抛异常。
   * 禁止复用 resolve 名称（同名不同义），归一统一走 normalize()。
   */

  // get(id) -> 档位配置；非法回落 basic，永不返回空
  function get(id) { return CONFIG[normalize(id)]; }

  // label(id) -> 中文名（裁决 E 封面控件 / 顶栏文案由此提供）
  function label(id) { return LABELS[normalize(id)]; }

  // paramsFor(tierId, night) -> NightParams（按 nights[] 查表，冻结返回）
  function paramsFor(tierId, night) {
    return CONFIG[normalize(tierId)].nights[toNight(night) - 1];
  }

  // apply(id, state) -> cs.difficulty 快照，生成该对象的唯一入口
  //   返回普通对象（不冻结，便于 JSON.stringify 进存档），带 configId；不改入参 state。
  //   endingBestChain 不进此对象：按裁决 C 由 game.js 以 clueCount * 3 现算。
  function apply(id, state) {
    var tierId = normalize(id);
    var n = state && typeof state === 'object' && state.night !== undefined
      ? toNight(state.night) : 1;
    var p = CONFIG[tierId].nights[n - 1];
    var snapshot = {};
    Object.keys(p).forEach(function (k) { snapshot[k] = p[k]; });
    snapshot.configId = SCHEMA_VERSION;
    return snapshot;
  }

  // validateConfig() -> 冻结的自检结果；终版 filled 与 structureOk 均须为 true
  function validateConfig() {
    var pending = [];
    var structureOk = true;
    IDS.forEach(function (id) {
      var tier = CONFIG[id];
      if (!tier || !tier.nights) { structureOk = false; pending.push(id); return; }
      CONTRACT_KEYS.forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(tier, k)) structureOk = false;
        else if (tier[k] === null || tier[k] === undefined) pending.push(id + '.' + k);
      });
      if (tier.nights.length !== BASE_NIGHTS.length) {
        structureOk = false;
        pending.push(id + '.nights.length');
      }
      tier.nights.forEach(function (p, i) {
        PARAM_KEYS.forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(p, k)) structureOk = false;
          else if (p[k] === null || p[k] === undefined) {
            pending.push(id + '.n' + (i + 1) + '.' + k);
          }
        });
      });
    });
    return Object.freeze({
      structureOk: structureOk,
      filled: structureOk && !pending.length,
      paramState: PARAM_STATE,
      pending: Object.freeze(pending.slice())
    });
  }

  /* ---------------- 9. 组装导出（唯一对外出口） ---------------- */
  var Difficulty = {
    VERSION: VERSION,
    SCHEMA_VERSION: SCHEMA_VERSION,
    PARAM_SOURCE: PARAM_SOURCE,
    PARAM_STATE: PARAM_STATE,
    DEFAULT_TIER_ID: DEFAULT_TIER_ID,
    IDS: IDS,
    LABELS: LABELS,
    CONTRACT_KEYS: CONTRACT_KEYS,
    PARAM_KEYS: PARAM_KEYS,
    DERIVED_KEYS: DERIVED_KEYS,
    BASE_NIGHTS: BASE_NIGHTS,
    CONFIG: CONFIG,
    normalize: normalize,
    validate: validate,
    get: get,
    label: label,
    derive: derive,
    paramsFor: paramsFor,
    apply: apply,
    validateConfig: validateConfig
  };

  deepFreeze(CONTRACT_VALUES);
  deepFreeze(Difficulty);   // 递归冻结配置层全部可达对象；apply 产物不在此列

  // 主路径：SD 由 js/core.js 建立，只挂 Difficulty 一个键。
  if (g.SD && typeof g.SD === 'object') {
    g.SD.Difficulty = Difficulty;
  }

  // 兜底：SD 未定义时不挂载、不抛错、绝不反向创建全局；
  // CommonJS 下单独 require 本文件仍直接返回 Difficulty（非 SD）。
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Difficulty;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
