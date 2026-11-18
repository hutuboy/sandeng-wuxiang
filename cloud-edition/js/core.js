/* =====================================================================
 * 三更灯 · 无相客栈  |  core.js
 * 确定性随机、内容词库、通用工具
 * 纯逻辑，无 DOM 依赖，可在 Node 与浏览器同时运行。
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  /* ---------- 1. 可复现的伪随机数发生器 (mulberry32 + hash) ---------- */
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function RNG(seed) {
    var a = typeof seed === 'string' ? hashStr(seed) : (seed >>> 0);
    this.state = a || 1;
  }
  RNG.prototype.next = function () {
    var t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };
  RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  RNG.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  RNG.prototype.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = this.int(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  RNG.prototype.chance = function (p) { return this.next() < p; };

  /* ---------- 2. 数学工具 ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, n) { var k = Math.pow(10, n || 0); return Math.round(v * k) / k; }
  function softmaxSample(scores, temperature, rng) {
    var keys = Object.keys(scores), mx = -Infinity;
    keys.forEach(function (k) { if (scores[k] > mx) mx = scores[k]; });
    var T = Math.max(0.01, temperature || 1);
    var ws = keys.map(function (k) { return Math.exp((scores[k] - mx) / T); });
    var sum = ws.reduce(function (a, b) { return a + b; }, 0);
    var r = rng.next() * sum, acc = 0;
    for (var i = 0; i < keys.length; i++) {
      acc += ws[i];
      if (r <= acc) return keys[i];
    }
    return keys[keys.length - 1];
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(prefix, rng) { return (prefix || 'id') + '_' + Math.floor(rng.next() * 1e9).toString(36); }

  /* ---------- 3. 内容词库 ---------- */
  var GUESTS = [
    { name: '沈砚',   role: '赶考书生', look: '青衫瘦削，袖口磨得发白' },
    { name: '陆青禾', role: '游方郎中', look: '背一只旧药箱，指节有草汁' },
    { name: '白九',   role: '走镖镖师', look: '左眉一道旧疤，话少' },
    { name: '顾长风', role: '说书先生', look: '折扇不离手，笑意太满' },
    { name: '阿檀',   role: '绣娘',     look: '指尖染着茜色，低头不看人' },
    { name: '谢无咎', role: '账房先生', look: '算盘珠磨得发亮，衣上无尘' },
    { name: '苏晚',   role: '琴师',     look: '琴囊裹得极紧，怕潮' },
    { name: '柳三娘', role: '行商',     look: '算账极快，鞋底带着长路灰' },
    { name: '程鹤',   role: '采药人',   look: '裤脚沾泥，身上有松脂气' },
    { name: '温叙',   role: '画师',     look: '指甲缝里是石青' },
    { name: '云阿罗', role: '船工',     look: '手掌厚茧，颈上晒痕分明' },
    { name: '裴照',   role: '道童',     look: '布履湿了半边，话声很轻' }
  ];

  // 话题：玩家可发问的五个「话头」
  var TOPICS = [
    { id: 'origin',     label: '来路', hint: '打哪条道进的城', values: ['北坡', '南渡', '西陵', '东市', '城外'] },
    { id: 'hour',       label: '时辰', hint: '几更到的店门',   values: ['一更', '二更', '三更'] },
    { id: 'companion',  label: '同行', hint: '路上有没有伴',   values: ['独行', '结伴', '携仆'] },
    { id: 'baggage',    label: '行囊', hint: '手里拎着什么',   values: ['药箱', '书箱', '刀匣', '布囊', '空手'] },
    { id: 'token',      label: '信物', hint: '拿什么作的押',   values: ['铜牌', '木牒', '纸符', '玉扣', '无'] }
  ];

  // 物证模板：给出某话题的「真值」，用于判断证词是否矛盾
  var CLUE_TEMPLATES = [
    { topic: 'hour',      make: function (v) { return { title: '更夫簿', text: '更夫簿上记着：昨夜 ' + v + ' 一落钥，西市便封了街。此后无人能从那条道进店。', expect: v }; } },
    { topic: 'origin',    make: function (v) { return { title: '路引残页', text: '税吏撕剩的半张路引：近旬官道只放行自 ' + v + ' 而来的客商。', expect: v }; } },
    { topic: 'companion', make: function (v) { return { title: '店簿', text: '柜上旧簿记得清楚：昨夜投宿的三位，一律记作「' + v + '」。', expect: v }; } },
    { topic: 'baggage',   make: function (v) { return { title: '廊下湿痕', text: '廊下未干的印子只有一种形状——拎着 ' + v + ' 的人才会留下。', expect: v }; } },
    { topic: 'token',     make: function (v) { return { title: '柜上旧例', text: '本店赊宿只认一样东西作押：' + v + '。掌柜昨夜亲手收的，不会错。', expect: v }; } }
  ];

  // 语气：影响 NPC 状态与决策，是玩家可操作的策略维度
  var TONES = [
    { id: 'warm',  label: '温问', icon: '○', desc: '添好感，少张力' },
    { id: 'press', label: '逼问', icon: '◆', desc: '易得真话，涨张力' },
    { id: 'show',  label: '示物', icon: '▣', desc: '亮出物证，压伪饰' }
  ];

  // 人物原型：决定决策权重与措辞风格
  var ARCHETYPES = [
    { id: 'candor',  name: '坦直',   candor: 0.85, pride: 0.25, nerve: 0.35, bias: { ANSWER_TRUE: 1.6, CONFIDE: 1.0, EVADE: -1.2, ANSWER_LIE: -3 } },
    { id: 'wary',    name: '谨慎',   candor: 0.55, pride: 0.45, nerve: 0.55, bias: { EVADE: 1.4, COUNTER: 0.9, CONFIDE: -1.0, ANSWER_TRUE: 0.2 } },
    { id: 'proud',   name: '傲气',   candor: 0.60, pride: 0.90, nerve: 0.65, bias: { COUNTER: 1.8, REFUSE: 0.9, EVADE: 0.4, CONFIDE: -0.6 } },
    { id: 'sly',     name: '圆滑',   candor: 0.35, pride: 0.40, nerve: 0.80, bias: { EVADE: 1.1, ANSWER_LIE: 1.2, COUNTER: 0.8, ANSWER_TRUE: -0.2 } },
    { id: 'gentle',  name: '温吞',   candor: 0.70, pride: 0.20, nerve: 0.30, bias: { ANSWER_TRUE: 1.0, GIFT: 1.0, REFUSE: -1.2, LEAVE: -1.0 } }
  ];

  // 措辞风格包：语义槽按人格 + 状态实时组合，而非固定台词
  var PREFIX = {
    calm: ['', '（放下茶盏）', '（抬眼）', '（慢慢道）'],
    wary: ['（顿了顿）', '（把袖口拢紧）', '（先看了你一眼）'],
    proud: ['（折扇一收）', '（轻笑一声）', '（不甚在意地）'],
    cold: ['（没抬眼）', '（声音低下去）', '（往灯影外挪了半寸）']
  };
  var CONNECT = {
    true:  ['照实说，', '这倒不必瞒你，', '你要问这个，那便是', '我记得分明：'],
    lie:   ['若没记岔，该是', '约莫是', '旁人都说是', '这话我昨日也这样讲：'],
    evade: ['这……掌柜何必问得这样细。', '有些事不提也罢。', '夜深了，说这些做什么。', '你我萍水相逢，问得太深了。'],
    counter:['倒要反问掌柜一句：', '先别急着问我——', '掌柜查得这样紧，是丢了什么？', '你信我几分？'],
    gift:  ['既问到这儿，这个你拿着。', '我这儿有件东西，或许可作个凭证。', '不瞒你说，留着这个也没用。'],
    refuse:['这个我不能说。', '此事到此为止。', '再问，我便要恼了。'],
    leave: ['坐不住了，告辞。', '这店里的灯太亮，我换个地方歇。', '不必留了。']
  };

  var MEMORY_LINES = [
    '这题你方才问过一回了。',
    '又是这个问题——我的答复不会改。',
    '你记性倒好，我也记得自己说过什么。',
    '方才那句话还搁在这儿呢，掌柜。'
  ];

  var RUMOR_LINES = [
    '（邻座那人朝这边看了一眼）',
    '（隔壁的杯子轻轻磕在桌上）',
    '（灯影里有人换了下坐姿）'
  ];

  SD.Core = {
    hashStr: hashStr, RNG: RNG, clamp: clamp, round: round,
    softmaxSample: softmaxSample, deepClone: deepClone, uid: uid,
    GUESTS: GUESTS, TOPICS: TOPICS, CLUE_TEMPLATES: CLUE_TEMPLATES,
    TONES: TONES, ARCHETYPES: ARCHETYPES,
    PREFIX: PREFIX, CONNECT: CONNECT, MEMORY_LINES: MEMORY_LINES, RUMOR_LINES: RUMOR_LINES,
    topic: function (id) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i]; return null; },
    tone: function (id) { for (var i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i]; return null; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
