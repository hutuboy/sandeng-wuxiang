/* =====================================================================
 * 三更灯 · 无相客栈  |  ui.js
 * 呈现层：程序化立绘 / Canvas 夜景 / WebAudio 音效 / DOM 渲染 / 弹窗
 * 不修改游戏状态，只读取 SD.Game 的结构化快照与决策对象。
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var C = SD.Core, NPC = SD.NPC, Game = SD.Game;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function markWords(s, values) {
    var out = esc(s);
    (values || []).filter(Boolean).forEach(function (v) {
      var e = esc(v);
      if (!e) return;
      out = out.split(e).join('<mark>' + e + '</mark>');
    });
    return out;
  }

  /* ---------------- 程序化角色立绘（100% 代码生成） ---------------- */
  function portrait(seed) {
    var r = new C.RNG(seed | 0);
    var id = 'p' + (seed >>> 0).toString(36);
    var robes = ['#3d5a72', '#754250', '#3f6a5c', '#7a5a2e', '#554a78', '#2d6670', '#6b3f38'];
    var robe = robes[r.int(robes.length)];
    var robe2 = robes[r.int(robes.length)];
    var hair = r.int(5), acc = r.int(5);
    var faceType = r.int(3);
    var skin = ['#efd0aa', '#e6bb8d', '#f5dcbb', '#d8ac83'][r.int(4)];
    var hue = 18 + r.int(34);
    var hairCol = ['#17151a', '#2a201c', '#3a2a20', '#1c1b22'][r.int(4)];
    var rx = [21, 23, 20][faceType], ry = [28, 26, 30][faceType];
    // 五种剪影差异明显的发型：束发 / 长发 / 斗笠 / 巾帽 / 光头带箍
    var hairShape = [
      '<path d="M36 60 Q33 26 60 23 Q87 26 84 60 Q78 44 60 43 Q42 44 36 60Z" fill="' + hairCol + '"/><ellipse cx="60" cy="20" rx="9" ry="7" fill="' + hairCol + '"/><path d="M36 56 Q29 82 33 98 L40 94 Q36 74 40 56Z" fill="' + hairCol + '"/>',
      '<path d="M34 66 Q30 24 60 22 Q90 24 86 66 L86 108 Q80 96 78 66 Q72 44 60 44 Q48 44 42 66 Q40 96 34 108Z" fill="' + hairCol + '"/><path d="M36 52 Q40 30 60 30 Q80 30 84 52 Q76 42 60 42 Q44 42 36 52Z" fill="' + hairCol + '"/>',
      '<path d="M8 48 Q60 -2 112 48 Q60 60 8 48Z" fill="#7a6038"/><path d="M8 48 Q60 60 112 48" fill="none" stroke="#4c3a20" stroke-width="2"/><path d="M60 8 L60 48" stroke="rgba(255,225,170,.25)" stroke-width="1"/><path d="M32 48 q28 8 56 0" fill="none" stroke="rgba(60,42,20,.5)" stroke-width="1"/>',
      '<path d="M32 52 Q32 20 60 20 Q88 20 88 52 Z" fill="#3b3450"/><path d="M28 50 Q60 44 92 50 L92 57 Q60 51 28 57Z" fill="#2a2438"/><path d="M34 58 Q30 84 34 96 L40 92 Q37 74 40 58Z" fill="' + hairCol + '"/>',
      '<path d="M38 54 Q40 30 60 30 Q80 30 82 54 Q76 44 60 44 Q44 44 38 54Z" fill="' + hairCol + '" opacity=".45"/><path d="M36 50 Q60 42 84 50 L84 55 Q60 47 36 55Z" fill="#8a5a3a"/><circle cx="60" cy="49" r="2.5" fill="#e8c27a"/>'
    ][hair];
    // 五种随身物件：折扇 / 药箱 / 书卷 / 刀柄 / 披领
    var accShape = [
      '<g><path d="M76 112 L100 98 L96 116 Z" fill="#e2c18c"/><path d="M76 112 L88 105 M76 112 L92 110 M76 112 L96 116" stroke="#8a6a3c" stroke-width="1" fill="none"/></g>',
      '<g><rect x="72" y="100" width="26" height="19" rx="2" fill="#8a6a42"/><rect x="72" y="100" width="26" height="5" rx="1" fill="#6b4f30"/><path d="M85 105 L85 116 M76 110 h18" stroke="#d9b57e" stroke-width="1.2"/></g>',
      '<g><rect x="26" y="100" width="9" height="22" rx="2" fill="#ddd0ae" transform="rotate(-12 30 111)"/><path d="M27 105 h7 M27 109 h7 M27 113 h7" stroke="#8a7a58" stroke-width=".8"/></g>',
      '<g><path d="M88 118 L100 74" stroke="#6b6258" stroke-width="4" stroke-linecap="round"/><path d="M84 116 L96 110" stroke="#c9a878" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="72" r="3" fill="#d9b57e"/></g>',
      '<g><path d="M34 96 Q60 84 86 96 L86 104 Q60 92 34 104Z" fill="#c9a878" opacity=".78"/><path d="M34 100 Q60 88 86 100" fill="none" stroke="#7a5a34" stroke-width="1"/></g>'
    ][acc];
    var beard = r.chance(0.28) ? '<path d="M50 79 q10 18 20 0 q-10 9 -20 0Z" fill="#2a2422" opacity=".6"/>' : '';
    return '<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="客人剪影">' +
      '<defs>' +
        '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' + hue + ',22%,16%)"/><stop offset="1" stop-color="hsl(' + hue + ',30%,9%)"/></linearGradient>' +
        '<radialGradient id="' + id + 'b"><stop offset="0" stop-color="rgba(255,196,120,.42)"/><stop offset="1" stop-color="rgba(255,196,120,0)"/></radialGradient>' +
        '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + robe + '"/><stop offset="1" stop-color="' + robe2 + '"/></linearGradient>' +
      '</defs>' +
      '<path d="M8 140 V42 Q8 8 60 8 Q112 8 112 42 V140Z" fill="url(#' + id + 'a)"/>' +
      '<circle cx="60" cy="60" r="58" fill="url(#' + id + 'b)"/>' +
      '<path d="M8 140 V42 Q8 8 60 8 Q112 8 112 42 V140" fill="none" stroke="rgba(232,164,92,.28)" stroke-width="1.5"/>' +
      '<path d="M14 140 Q22 98 60 94 Q98 98 106 140Z" fill="url(#' + id + 'c)"/>' +
      '<path d="M48 94 L60 112 L72 94" fill="none" stroke="rgba(240,220,190,.55)" stroke-width="2"/>' +
      '<ellipse cx="60" cy="63" rx="' + rx + '" ry="' + ry + '" fill="' + skin + '"/>' +
      '<path d="M38 60 Q36 40 60 38 Q84 40 82 60 Q82 34 60 32 Q38 34 38 60Z" fill="rgba(255,235,200,.08)"/>' +
      '<path d="M' + (60 - rx) + ' 62 q-3 12 2 20" stroke="rgba(120,80,55,.16)" stroke-width="2" fill="none"/>' +
      hairShape + beard +
      '<path d="M49 63 q4 2.5 8 0" stroke="#2d2420" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M63 63 q4 2.5 8 0" stroke="#2d2420" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M56 77 q4 2 8 0" stroke="#a8735c" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
      accShape +
      '<path d="M8 128 Q60 120 112 128 V140 H8Z" fill="rgba(0,0,0,.28)"/>' +
      '</svg>';
  }

  /* ---------------- Canvas 夜景 ---------------- */
  function initCanvas(canvas) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = 1, t = 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var embers = [];
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      embers = [];
      for (var i = 0; i < 78; i++) embers.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.5 + Math.random() * 1.6, s: 0.12 + Math.random() * 0.42,
        a: 0.12 + Math.random() * 0.5, p: Math.random() * 6.28
      });
    }
    function mountain(y, amp, color, phase) {
      ctx.beginPath(); ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += 12) {
        var v = Math.sin(x * 0.0032 + phase) * amp + Math.sin(x * 0.0081 + phase * 2) * amp * 0.35;
        ctx.lineTo(x, y + v);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    function lantern(x, y, scale, phase) {
      var sw = Math.sin(t * 0.0006 + phase) * 4;
      ctx.save(); ctx.translate(x + sw, y); ctx.scale(scale, scale);
      var gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 90);
      gr.addColorStop(0, 'rgba(255,190,110,.30)'); gr.addColorStop(.45, 'rgba(232,150,70,.10)'); gr.addColorStop(1, 'rgba(232,150,70,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 90, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(232,164,92,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -y); ctx.lineTo(0, -16); ctx.stroke();
      var lg = ctx.createLinearGradient(-10, -14, 10, 20);
      lg.addColorStop(0, '#f0c184'); lg.addColorStop(.5, '#d89043'); lg.addColorStop(1, '#8c4c20');
      ctx.fillStyle = lg; ctx.beginPath();
      ctx.moveTo(-9, -12); ctx.bezierCurveTo(-14, -2, -14, 14, -8, 20);
      ctx.lineTo(8, 20); ctx.bezierCurveTo(14, 14, 14, -2, 9, -12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,20,.6)'; ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(8, -12); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,164,92,.6)'; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, 28); ctx.stroke();
      ctx.restore();
    }
    function draw() {
      t += reduce ? 0 : 16;
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a0910'); sky.addColorStop(.55, '#141020'); sky.addColorStop(1, '#1a1218');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // 月晕
      var mg = ctx.createRadialGradient(W * .78, H * .16, 4, W * .78, H * .16, Math.min(W, H) * .42);
      mg.addColorStop(0, 'rgba(220,205,180,.10)'); mg.addColorStop(1, 'rgba(220,205,180,0)');
      ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(238,228,205,.13)'; ctx.beginPath(); ctx.arc(W * .78, H * .16, 26, 0, 6.2832); ctx.fill();
      // 远山
      mountain(H * .66, 26, 'rgba(30,26,40,.65)', 1.2);
      mountain(H * .76, 34, 'rgba(22,19,30,.85)', 3.4);
      mountain(H * .88, 22, 'rgba(12,10,18,.96)', 5.1);
      // 雾
      for (var i = 0; i < 3; i++) {
        var fy = H * (.58 + i * .12) + Math.sin(t * .0003 + i) * 8;
        var fg = ctx.createLinearGradient(0, fy - 30, 0, fy + 30);
        fg.addColorStop(0, 'rgba(180,160,140,0)'); fg.addColorStop(.5, 'rgba(180,160,140,.045)'); fg.addColorStop(1, 'rgba(180,160,140,0)');
        ctx.fillStyle = fg; ctx.fillRect(0, fy - 30, W, 60);
      }
      // 灯笼
      lantern(W * .12, H * .22, 1.15, 0);
      lantern(W * .88, H * .30, .85, 1.7);
      if (W > 900) lantern(W * .50, H * .13, .6, 3.1);
      // 浮尘
      embers.forEach(function (p) {
        if (!reduce) { p.y -= p.s; p.x += Math.sin(t * .0008 + p.p) * .22; if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; } }
        ctx.fillStyle = 'rgba(255,196,120,' + (p.a * (.6 + .4 * Math.sin(t * .002 + p.p))) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize(); requestAnimationFrame(draw);
  }

  /* ---------------- WebAudio 程序化音效 ---------------- */
  var audio = {
    on: true, ctx: null, master: null, ambient: null,
    ensure: function () {
      if (this.ctx) return this.ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.30; this.master.connect(this.ctx.destination);
      return this.ctx;
    },
    startAmbient: function () {
      var c = this.ensure(); if (!c || this.ambient) return;
      var gain = c.createGain(); gain.gain.value = 0.035;
      var filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 320;
      gain.connect(filt); filt.connect(this.master);
      [55, 82.4, 110.3].forEach(function (f, i) {
        var o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f;
        var og = c.createGain(); og.gain.value = i === 2 ? .18 : .4;
        o.connect(og); og.connect(gain); o.start();
      });
      var lfo = c.createOscillator(); lfo.frequency.value = .07;
      var lg = c.createGain(); lg.gain.value = .018;
      lfo.connect(lg); lg.connect(gain.gain); lfo.start();
      this.ambient = gain;
    },
    toggle: function () {
      this.on = !this.on;
      if (this.on) { this.ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); this.startAmbient(); this.sfx('click'); }
      else if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
      return this.on;
    },
    sfx: function (kind) {
      if (!this.on) return;
      var c = this.ensure(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      var now = c.currentTime;
      var map = { click: [520, .045, 'triangle', .12], lantern: [330, .16, 'sine', .16], reveal: [740, .30, 'sine', .16], bad: [160, .28, 'sawtooth', .10], win: [880, .55, 'sine', .18], type: [900, .02, 'square', .025] };
      var m = map[kind] || map.click;
      var o = c.createOscillator(), gn = c.createGain();
      o.type = m[2]; o.frequency.setValueAtTime(m[0], now);
      if (kind === 'reveal' || kind === 'win') o.frequency.exponentialRampToValueAtTime(m[0] * 1.5, now + m[1]);
      if (kind === 'bad') o.frequency.exponentialRampToValueAtTime(90, now + m[1]);
      gn.gain.setValueAtTime(0.0001, now);
      gn.gain.exponentialRampToValueAtTime(m[3], now + .012);
      gn.gain.exponentialRampToValueAtTime(.0001, now + m[1]);
      o.connect(gn); gn.connect(this.master); o.start(now); o.stop(now + m[1] + .02);
    }
  };

  /* ---------------- 灯 / 弹窗 / Toast ---------------- */
  function showScreen(id) {
    ['screen-intro', 'screen-game', 'screen-result', 'screen-finale'].forEach(function (s) {
      var el = document.getElementById(s); if (el) el.classList.toggle('active', s === id);
    });
  }
  function openModal(title, body, footer) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-mask"><div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" data-action="close-modal" aria-label="关闭">✕</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      (footer ? '<div class="modal-body" style="border-top:1px solid rgba(200,170,120,.16);padding-top:12px">' + footer + '</div>' : '') +
      '</div></div>';
    var mask = root.querySelector('.modal-mask');
    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
  }
  function closeModal() { var r = document.getElementById('modal-root'); if (r) r.innerHTML = ''; }
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ---------------- 视图片段 ---------------- */
  var TOPIC_GLYPH = { origin: '道', hour: '更', companion: '伴', baggage: '囊', token: '押' };
  var KEY_HINT = ['Q', 'W', 'E', 'R', 'T'];

  function lampsHtml(game) {
    var out = '';
    for (var i = 0; i < game.lamps; i++) out += '<i class="lamp ' + (i < game.lampsLeft ? 'on' : '') + '"></i>';
    return out;
  }
  /* 客人卡：三人自上而下排开，各自「立绘在左、五维在右」，点谁问谁（不再有换人条） */
  function guestStackHtml(game, selected) {
    return game.guests.map(function (q, i) {
      var s = q.state;
      function bar(label, v, cls) {
        return '<div class="sbar"><span>' + label + '</span><div class="track"><div class="fill ' + cls + '" style="width:' + C.round(v, 0) + '%"></div></div><b>' + C.round(v, 0) + '</b></div>';
      }
      /* 这一位已被问到哪些话头 —— 让你一眼看出还缺哪一格 */
      var asked = {};
      game.statements.forEach(function (st) { if (st.guestId === q.id) asked[st.topic] = st; });
      var chips = C.TOPICS.map(function (t) {
        var got = asked[t.id];
        return '<span class="askchip' + (got ? ' on' : '') + '">' + t.label + (got ? '<em>' + esc(got.value) + '</em>' : '') + '</span>';
      }).join('');
      var cnt = game.statements.filter(function (st) { return st.guestId === q.id; }).length;
      return '<article class="guest-card gcard' + (selected === q.id ? ' on' : '') + (q.flags.left ? ' left' : '') + '"' +
        ' data-guest="' + q.id + '" data-action="select-guest">' +
        '<div class="gc-p">' + portrait(q.portraitSeed) + '</div>' +
        '<div class="gc-body">' +
          '<div class="gc-top"><i class="gc-num">' + (i + 1) + '</i><b class="gc-name">' + esc(q.name) + '</b>' +
            '<span class="gc-role">' + esc(q.role) + ' · ' + esc(q.archetypeName) + '</span>' +
            '<span class="gc-badge">' + (q.flags.left ? '已离店' : (cnt ? '问过 ' + cnt + ' 句' : '未开口')) + '</span></div>' +
          '<div class="gc-bars">' + bar('信任', s.trust, 'trust') + bar('好感', s.affinity, 'trust') + bar('张力', s.tension, 'tension') + bar('疑心', s.suspicion, 'suspicion') + bar('定力', s.calm, 'suspicion') + '</div>' +
          '<div class="gc-chips">' + chips + '</div>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  /* ---------------- 五幕：步骤条 / 点灯 / 推演 / 指认 ---------------- */
  var ACTS = [
    { id: 'lamp', num: '壹', name: '点灯', tip: '客人到齐，先清点柜上物证' },
    { id: 'ask', num: '贰', name: '问询', tip: '点谁问谁，问一句灭一盏灯' },
    { id: 'deduce', num: '叁', name: '推演', tip: '把物证与证词摊开，按残卷的破绽筛人' },
    { id: 'accuse', num: '肆', name: '指认', tip: '点灯，说出那个名字' },
    { id: 'verdict', num: '伍', name: '结案', tip: '天亮，真相摊开' }
  ];
  function actBarHtml(act) {
    var at = 0;
    ACTS.forEach(function (a, i) { if (a.id === act) at = i; });
    var steps = ACTS.map(function (a, i) {
      var cls = i < at ? 'done' : (i === at ? 'on' : 'todo');
      return '<li class="act-step ' + cls + '" data-act-id="' + a.id + '"' + (i === at ? ' aria-current="step"' : '') + '>' +
        '<i>' + a.num + '</i><b>' + a.name + '</b></li>';
    }).join('');
    var cur = ACTS[at] || ACTS[0];
    return { steps: steps, tip: '第 ' + (at + 1) + ' / 5 步 · ' + cur.tip };
  }
  function lampHtml(game, session) {
    var D = SD.Difficulty;
    var tier = D ? D.label(D.normalize(session && session.difficultyTier)) : '初级';
    var roster = game.guests.map(function (q) {
      return '<div class="lamp-guest"><div class="lg-p">' + portrait(q.portraitSeed) + '</div>' +
        '<b>' + esc(q.name) + '</b><span>' + esc(q.role) + '</span></div>';
    }).join('');
    var brief = game.cs.clues.map(function (c) {
      return '<li><b>' + esc(c.title) + '</b>　' + esc(C.topic(c.topic).label) + ' 应为「' + esc(c.expect) + '」</li>';
    }).join('');
    return {
      title: '第 ' + ['一', '二', '三'][game.night - 1] + ' 夜 · 三客投宿',
      lead: '灯只有 ' + game.lamps + ' 盏。问一句灭一盏，天亮前把「无相」认出来。',
      roster: roster,
      brief: '<li class="lb-head">柜上 ' + game.cs.clues.length + ' 件物证（真值已给出，等证词来对）· 难度 ' + esc(tier) + '</li>' + brief
    };
  }
  /* 指认幕：三位并列，点即点灯 */
  function accuseStageHtml(game) {
    var b = Game.belief(game);
    return game.guests.map(function (q) {
      return '<button class="accuse-card' + (q.flags.left ? ' left' : '') + '" data-action="accuse" data-accuse-guest="' + q.id + '"' + (q.flags.left ? ' disabled' : '') + '>' +
        '<div class="ac-p">' + portrait(q.portraitSeed) + '</div>' +
        '<b>' + esc(q.name) + '</b><span>' + esc(q.role) + '</span>' +
        '<em>嫌疑度 ' + (b[q.id] * 100).toFixed(0) + '%</em>' +
        '</button>';
    }).join('') +
      '<p class="accuse-note">「嫌疑度」= 已收集证词里，这一位与物证对不上的比重，不是答案。灯一亮就收不回来。</p>';
  }
  function dialogueHtml(game) {
    var lines = game.log.slice(-14);
    return lines.map(function (l) {
      if (l.type === 'system') return '<div class="dline sys">· ' + esc(l.text) + '</div>';
      if (l.type === 'clue') return '<div class="dline clue">◈ ' + esc(l.text) + '</div>';
      if (l.type === 'ask') return '<div class="dline ask"><span class="who">掌柜</span>' + esc(l.text.replace(/^【你】/, '')) + '</div>';
      var m = /^【(.+?)·(.+?)】(.+)$/.exec(l.text);
      if (m) return '<div class="dline npc"><span class="act">' + esc(m[2]) + '</span><span class="who">' + esc(m[1]) + '</span>' + esc(m[3]) + '</div>';
      return '<div class="dline npc">' + esc(l.text) + '</div>';
    }).join('');
  }
  /* 精简版物证：一行「名称 + 真值」，正文只留一行，点开看全文（全文也在 title 里）。
     展开状态必须存在模块里：每次 paint 都会重写 #clue-list 的 innerHTML，
     状态若只挂在 DOM 的 class 上，问一句话就被重绘抹掉。 */
  var openClues = {};
  function cluesHtml(game) {
    var canConfront = game.lampsLeft > 0 && game.phase === 'playing';
    return game.cs.clues.map(function (c) {
      var open = !!openClues[c.id];
      return '<div class="clue' + (open ? ' open' : '') + '" data-action="clue-toggle" data-clue-id="' + esc(c.id) + '"' +
        ' aria-expanded="' + (open ? 'true' : 'false') + '" title="' + esc(c.text) + '">' +
        '<div class="clue-top"><b>◈ ' + esc(c.title) + '</b>' +
        '<span class="clue-val">' + esc(C.topic(c.topic).label) + ' 应为「' + esc(c.expect) + '」</span>' +
        /* 对簿：把这一件物证摊到桌上，三人同时开口（1 灯换至多 3 格） */
        '<button class="clue-confront" data-action="confront" data-topic="' + esc(c.topic) + '"' +
        (canConfront ? '' : ' disabled') +
        ' title="就这一件物证当众对簿：三个人同时开口，耗 1 盏灯">对簿<em>1 灯</em></button>' +
        '</div>' +
        '<p class="clue-txt">' + esc(c.text) + '</p></div>';
    }).join('');
  }
  function toggleClue(id) {
    if (!id) return false;
    openClues[id] = !openClues[id];
    return openClues[id];
  }
  function statementsHtml(game) {
    if (!game.statements.length) return '<div class="empty-note">还没有人开口。<br />选一位客人，点一张话头，灯就少一盏。</div>';
    var vals = {};
    C.TOPICS.forEach(function (t) { t.values.forEach(function (v) { vals[v] = 1; }); });
    return game.statements.map(function (s) {
      return '<div class="stmt"><span class="who">' + esc(s.guestName) + '</span><span class="topic">' + esc(C.topic(s.topic).label) + '</span>' +
        (s.byGift ? '<span class="extra">［交付］</span>' : s.byConfide ? '<span class="extra">［交心］</span>' : '') +
        (s.byConfront ? '<span class="extra">［对簿］</span>' : '') +
        markWords(s.surface || s.value, Object.keys(vals)) + '</div>';
    }).join('');
  }
  function toneHtml(current) {
    return C.TONES.map(function (t) {
      return '<button class="tone' + (current === t.id ? ' on' : '') + '" data-tone="' + t.id + '" data-action="set-tone">' +
        t.icon + ' ' + t.label + '<small>' + t.desc + '</small></button>';
    }).join('');
  }
  function topicHtml() {
    return C.TOPICS.map(function (t, i) {
      return '<button class="topic-card" data-topic="' + t.id + '" data-action="ask"><span class="num">' + KEY_HINT[i] + '</span>' +
        '<span class="glyph">' + TOPIC_GLYPH[t.id] + '</span><span class="name">' + t.label + '</span><span class="hint">' + t.hint + '</span></button>';
    }).join('');
  }
  /* 问询幕下方那行小字：只说「这一夜找什么破绽」与物件数/灯数，不报算子（P5） */
  function solverHtml(game) {
    var ok = game.cs.solvable && game.cs.logicSolvable !== false;
    var flaw = flawOfCase(game.cs);
    var rule = flaw ? flaw.label : '破绽';
    return (ok ? '✓ ' : '! ') + '这一夜找的破绽：' + rule + ' · ' + game.cs.clues.length + ' 件物证 · ' + game.lamps + ' 盏灯';
  }

  /* ---------------- 推演台（第三幕）----------------
   * P5：只给「这一夜该找什么样的破绽」，不给式子、不给算子按钮。
   *   旧版把式子（如 ⊕(信物,时辰)）直接印在残卷上，玩家做的就是照式子填表 —— 那是执行，不是推理。
   *   现在残卷只说性质（「此人只错一处；除那一处，其余滴水不漏」），玩家要自己把它翻成对表的筛选。
   */
  function flawOfCase(cs) {
    var L = SD.Logic;
    if (cs && cs.flaw) return cs.flaw;
    return (L && L.flawOf && cs && cs.difficulty) ? L.flawOf(cs.difficulty.tier) : null;
  }

  /* 当夜残卷卡：只有一句话 + 破绽类型，没有式子 */
  function scrollCardHtml(cs) {
    var flaw = flawOfCase(cs);
    if (!flaw) return '';
    return '<div class="lg-scroll">' +
      '<span class="lg-tag">当夜残卷</span>' +
      '<span class="lg-kind">' + esc(flaw.label) + '</span>' +
      '<b class="lg-expr">' + esc(flaw.lead) + '</b>' +
      '</div>';
  }

  /* 事实表：物证 × 三人，✓ 相符 / ✗ 不符 / ? 未问，末行数「不符处数」 */
  function logicTableHtml(cs, dev) {
    var guests = cs.guests;
    var unasked = 0;
    var head = '<tr><th class="lg-th">物证 · 真值</th>' +
      guests.map(function (q) { return '<th>' + esc(q.name) + '</th>'; }).join('') + '</tr>';
    var rows = cs.clues.map(function (c) {
      return '<tr><td><b style="color:var(--amber-lt)">' + esc(c.title) + '</b><br /><span class="lg-dim">' +
        esc(C.topic(c.topic).label) + ' 应为「' + esc(c.expect) + '」</span></td>' +
        guests.map(function (q) {
          var d = (dev[q.id] || {})[c.topic];
          if (d === undefined || d === null) {
            unasked++;
            return '<td><span class="lg-dim">? 未问</span></td>';
          }
          return '<td>' + (d ? '<span style="color:var(--crimson)">✗ 不符</span>'
            : '<span style="color:var(--jade)">✓ 相符</span>') + '</td>';
        }).join('') + '</tr>';
    }).join('');
    /* 「只错一处」「处处相悖」这类性质都要先数出来才用得上，所以把数摆在表尾 */
    var countRow = '<tr class="lg-count"><td><span class="lg-dim">不符处数</span></td>' +
      guests.map(function (q) {
        var n = 0, asked = 0, unknown = 0;
        cs.clues.forEach(function (c) {
          var d = (dev[q.id] || {})[c.topic];
          if (d === undefined || d === null) unknown++;
          else { asked++; if (d) n++; }
        });
        var known = unknown < cs.clues.length;
        var cell = known
          ? '<b>' + n + '</b><span class="lg-dim"> / ' + asked + '</span>'
          : '<span class="lg-dim">—</span>';
        return '<td>' + cell + (unknown ? '<br /><span class="lg-dim">' + unknown + ' 格未问</span>' : '') + '</td>';
      }).join('') + '</tr>';
    return {
      html: '<table class="finale-table logic-table"><thead>' + head + '</thead><tbody>' + rows + countRow + '</tbody></table>',
      unasked: unasked
    };
  }

  function logicCoreHtml(cs, statements, op, opt) {
    opt = opt || {};
    var L = SD.Logic;
    if (!L) return '<p style="color:var(--dim)">逻辑层未加载。</p>';
    var flaw = flawOfCase(cs);
    var expr = cs.logic && cs.logic.expr;
    var j = (L.judge && expr) ? L.judge(cs, statements) : null;
    var ev = j ? j.ev : (expr ? L.evaluateExpr(cs, statements, expr) : { dev: {}, result: {}, winners: [] });
    var dev = ev.dev || {}, res = ev.result || {};

    var table = logicTableHtml(cs, dev);
    var winners = j ? j.winners.slice() : (ev.winners || []).slice();
    var names = winners.map(function (id) {
      var q = null;
      cs.guests.forEach(function (x) { if (x.id === id) q = x; });
      return q ? q.name : id;
    });
    var undet = cs.guests.filter(function (q) { return res[q.id] === null || res[q.id] === undefined; }).length;

    /* 结论：只说「这条性质筛出谁 / 为什么还判不了」，不复述式子 */
    var verdict;
    if (winners.length === 1) {
      verdict = '<b style="color:var(--jade)">收口了：' + esc(names[0]) + '</b>' +
        ' —— 表里只有他合这条性质，可以去点灯指认。';
    } else if (winners.length > 1) {
      verdict = '<b style="color:var(--amber-lt)">' + winners.length + ' 人同时合这条性质</b>（' + esc(names.join('、')) + '）' +
        ' —— 范围还没缩到一人：要么还有话没问全，要么有人只是「记岔」了一处。';
    } else if (undet > 0) {
      verdict = '<b>还判不了</b> —— ' + (undet === cs.guests.length ? '三位客人都' : undet + ' 位客人') +
        '有格子空着（共 ' + table.unasked + ' 格）。空格既不算相符也不算不符，性质就落不下来。';
    } else {
      verdict = '<b style="color:var(--crimson)">没有人合这条性质</b> —— 表里的格子都对上了，' +
        '要么这一夜的性质你读错了方向，要么有人还不止说错一处。';
    }

    var hint = table.unasked > 0
      ? '<p class="lg-foot2">空格太多时，可以用柜上物证的「<b>对簿</b>」：一盏灯，三个人同时就那一件开口。</p>'
      : '';

    return '<div class="logic-board">' +
      (opt.hideIntro ? '' : '<p>把每位客人在各物证上的「<span style="color:var(--jade)">相符</span> / <span style="color:var(--crimson)">不符</span>」摆成一张表。' +
        '残卷只告诉你这一夜找的是<b>什么样的破绽</b>，怎么从表里把它挑出来，是你的事。</p>') +
      scrollCardHtml(cs) +
      table.html +
      '<p class="logic-verdict">' + verdict + '</p>' +
      hint +
      '<p class="lg-dim lg-foot">「?」= 那句话还没问到。问话消耗灯，取舍在你。</p>' +
      '</div>';
  }

  /* AI 掌柜 · 审计（点开才显示）：把判定过程摊开，但仍不给式子 —— 给的是「凭什么这么说」 */
  function auditHtml(game) {
    var L = SD.Logic;
    if (!game || !L) return '<p style="color:var(--dim)">暂无可以审计的一夜。</p>';
    var cs = game.cs, statements = game.statements || [];
    var flaw = flawOfCase(cs);
    var expr = cs.logic && cs.logic.expr;
    var j = (L.judge && expr) ? L.judge(cs, statements) : null;
    var post = (L.posterior && expr) ? L.posterior(cs, statements, expr) : null;
    var need = cs.clues.length * cs.guests.length;
    var got = statements.filter(function (s, i, arr) {
      return arr.findIndex(function (x) { return x.guestId === s.guestId && x.topic === s.topic; }) === i;
    }).length;

    function bar(name, pct, hot) {
      return '<div class="au-row' + (hot ? ' hot' : '') + '"><span class="au-nm">' + esc(name) + '</span>' +
        '<div class="au-bar"><i style="width:' + Math.max(2, Math.round(pct * 100)) + '%"></i></div>' +
        '<span class="au-pct">' + Math.round(pct * 100) + '%</span></div>';
    }

    var shareHtml = post ? cs.guests.map(function (q) {
      var p = post.share[q.id] || 0;
      return bar(q.name, p, p === Math.max.apply(null, cs.guests.map(function (x) { return post.share[x.id] || 0; })));
    }).join('') : '<p class="lg-dim">尚无证词，后验还没法算。</p>';

    var kv = function (k, v) { return '<div class="kv"><span class="k">' + k + '</span><span>' + v + '</span></div>'; };
    var drift = j && j.drift && j.drift.length ? j.drift : [];

    return '<p>这一栏是「掌柜怎么想的」——点开才看见，不看也能玩。</p>' +
      kv('这一夜找的破绽', '<b>' + esc(flaw ? flaw.label : '未知') + '</b>　' + esc(flaw ? flaw.lead : '')) +
      kv('判据', '把「谁在哪件物证上说的对不上」摆成表，再用这条性质去筛。' +
        '若同一个人对同一件事前后说法不同，那条也算破绽。') +
      kv('已问到', got + ' / ' + need + ' 格　·　灯 ' + game.lampsLeft + ' / ' + game.lamps + ' 盏') +
      kv('当前结论', j ? (j.unique ? '<b style="color:var(--jade)">收口：唯一</b>'
        : (j.winners.length ? '命中 ' + j.winners.length + ' 人（未唯一）' : '还判不了')) : '—') +
      (drift.length ? kv('改口', drift.map(function (id) {
        var q = null; cs.guests.forEach(function (x) { if (x.id === id) q = x; }); return q ? q.name : id;
      }).join('、') + ' 的说辞变过') : '') +
      '<div class="au-block"><h4>后验：谁更像无相 <span>未问格按五五开枚举</span></h4>' + shareHtml + '</div>' +
      '<p class="lg-dim lg-foot">「后验」不是答案，是「按已有证词，各人合这条性质的比例」；' +
      '空格没问之前，它天然趋向平均。</p>';
  }


  function aiHtml(ctx) {
    var d = ctx.lastDecision;
    if (!d) {
      return '<div class="ai-empty">这一栏是 NPC 的「脑子」。<br />每问一句话，这里会实时展开：<br />特征向量 → 效用打分 → 规则掩码 → 实际动作 → 状态回写。<br /><br />所有推理在本地完成，<br />同一 seed 可完整复现。</div>';
    }
    var q = null;
    ctx.game.guests.forEach(function (x) { if (x.id === d.guestId) q = x; });
    var s = d.stateAfter || (q ? q.state : {});
    function chip(label, v, hot) {
      return '<span class="chip' + (hot ? ' hot' : '') + '">' + label + ' ' + C.round(v, 1) + '</span>';
    }
    var acts = Object.keys(d.utilities).sort(function (a, b) { return d.utilities[b] - d.utilities[a]; });
    var mx = Math.max.apply(null, acts.map(function (k) { return Math.abs(d.utilities[k]); })) || 1;
    var utils = acts.map(function (k) {
      var legal = d.legal[k], pct = Math.max(2, Math.round(Math.abs(d.utilities[k]) / mx * 100));
      return '<div class="util' + (k === d.chosen ? ' chosen' : '') + (!legal ? ' illegal' : '') + '">' +
        '<span class="nm">' + (NPC.ACTION_META[k] ? NPC.ACTION_META[k].label : k) + '</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span class="val">' + C.round(d.utilities[k], 1) + '</span></div>';
    }).join('');
    var notes = d.ruleNotes.length ? d.ruleNotes.map(function (n) { return '<div class="rule-note">✓ ' + esc(n) + '</div>'; }).join('') : '<div class="rule-note">✓ 全部动作合法</div>';
    var delta = Object.keys(d.stateDelta || {}).map(function (k) {
      var v = d.stateDelta[k], cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
      var zh = { trust: '信任', affinity: '好感', tension: '张力', suspicion: '疑心', calm: '定力' }[k] || k;
      return zh + ' <span class="' + cls + '">' + (v > 0 ? '+' : '') + v + '</span>';
    }).join('　');
    var mem = q && q.memory.length ? q.memory.slice(-3).reverse().map(function (m) {
      return '<div class="memo">#' + m.turn + ' ' + esc(m.topic ? C.topic(m.topic).label : '添茶') + ' → ' + esc(NPC.ACTION_META[m.npcAction] ? NPC.ACTION_META[m.npcAction].label : m.npcAction) + '</div>';
    }).join('') : '<div class="memo">记忆为空</div>';
    return '<div class="ai-block"><h4>本轮决策 <span>' + esc(d.guestName) + ' · T' + (q ? q.memory.length : 0) + '</span></h4>' +
      '<span class="chosen-badge">' + esc(d.actionLabel) + '</span>' +
      '<p style="font-size:11px;color:var(--label);margin-top:8px;line-height:1.8">「' + esc(d.text) + '」</p></div>' +
      '<div class="ai-block"><h4>量化角色状态 <span>state vector</span></h4><div class="chiprow">' +
        chip('信任', s.trust) + chip('好感', s.affinity) + chip('张力', s.tension, s.tension > 60) + chip('疑心', s.suspicion) + chip('定力', s.calm) +
      '</div></div>' +
      '<div class="ai-block"><h4>特征 → 效用打分 <span>softmax T=' + d.temperature + '</span></h4>' + utils + '</div>' +
      '<div class="ai-block"><h4>规则层校验 <span>legal mask</span></h4>' + notes + '</div>' +
      '<div class="ai-block"><h4>状态回写 <span>state delta</span></h4><div class="delta">' + delta + '</div></div>' +
      '<div class="ai-block"><h4>持久记忆 <span>last 3</span></h4>' + mem + '</div>' +
      /* 对簿一次落三条决策：面板只画其中一个的完整推理，其余两人的结论在这里补一行，免得不留痕 */
      (function () {
        var all = ctx.lastDecisions;
        if (!all || all.length < 2) return '';
        return '<div class="ai-block"><h4>本轮三人同答 <span>对簿</span></h4>' +
          all.map(function (x) {
            return '<div class="au-row"><span class="au-nm">' + esc(x.guestName) + '</span>' +
              '<span style="flex:1;font-size:11px;color:var(--label)">' + esc(x.actionLabel) + '</span>' +
              '<span class="au-pct">' + (x.revealed ? '已开口' : '未开口') + '</span></div>';
          }).join('') + '</div>';
      })() +
      '<div class="ai-btns"><button class="mini-btn" data-action="redecide" style="margin:0;flex:1">重新决策对比</button>' +
      '<button class="mini-btn" data-action="copy-decision" style="margin:0;flex:1">复制决策 JSON</button></div>';
  }

  /* 两个入口：第三幕用 logicStageHtml，弹窗用 auditHtml（P5 起不再共用「带式子的板子」） */
  function logicStageHtml(game) { return logicCoreHtml(game.cs, game.statements, null, {}); }
  function logicBoardHtml(cs, statements, op) { return logicCoreHtml(cs, statements, op); }

  /* ---------------- 整屏绘制 ---------------- */
  var _cache = {};
  function paint(ctx) {
    var game = ctx.game;
    if (!game) return;
    var set = function (id, html) {
      if (_cache[id] === html) return;
      _cache[id] = html;
      var el = document.getElementById(id); if (el) el.innerHTML = html;
    };
    set('tb-night', '第 ' + ['一', '二', '三'][game.night - 1] + ' 夜');
    set('tb-lamps', lampsHtml(game));
    set('tb-lamp-text', game.lampsLeft + ' / ' + game.lamps + ' 盏');
    set('tb-score', String(ctx.session.totalScore || 0));
    var D = SD.Difficulty;
    var tierId = D ? D.normalize(ctx.session && ctx.session.difficultyTier) : 'basic';
    set('tb-tier', D ? D.label(tierId) : '初级');
    var tierEl = document.getElementById('tb-tier');
    if (tierEl) tierEl.setAttribute('data-difficulty-tier', tierId);
    set('tb-phase', game.lampsLeft <= 1 ? '灯将尽，该决断了' : '掌柜，客人都到齐了');

    /* 五幕外壳：把当前幕写到两个容器上，CSS 据此只显示一扇窗 */
    var act = ctx.act || 'lamp';
    var stage = document.getElementById('act-stage');
    var wins = document.getElementById('act-windows');
    if (stage) stage.setAttribute('data-act', act);
    if (wins) wins.setAttribute('data-act', act);
    var bar = actBarHtml(act);
    set('act-steps', bar.steps);
    set('act-tip', bar.tip);

    /* 第一幕 */
    var lp = lampHtml(game, ctx.session);
    set('lamp-title', lp.title);
    set('lamp-lead', lp.lead);
    set('lamp-roster', lp.roster);
    set('lamp-brief', lp.brief);

    /* 第二幕 */
    set('guest-row', guestStackHtml(game, ctx.selected));
    set('dialogue', dialogueHtml(game));
    set('topic-row', topicHtml());
    set('tone-group', toneHtml(ctx.tone));

    /* 第三 / 四幕 */
    set('logic-stage', logicStageHtml(game));
    set('accuse-stage', accuseStageHtml(game));

    /* 常驻栏 */
    set('clue-list', cluesHtml(game));
    set('statement-list', statementsHtml(game));
    set('ai-panel', aiHtml(ctx));
    set('solver-note', solverHtml(game));
    set('turn-tag', '第 ' + game.turn + ' 回');
    set('clue-count', game.cs.clues.length + ' 件');
    set('stmt-count', game.statements.length + ' 条');
    var sel = ctx.selected ? Game.guest(game, ctx.selected) : null;
    /* 三人同时在场，只能靠这一句说明「下一句是问给谁的」 */
    set('guest-hint', sel
      ? '正在问 <b>' + esc(sel.name) + '</b> · 点一张话头便开口'
      : '先点一位客人，再点一张话头');
    var dlg = document.getElementById('dialogue'); if (dlg) dlg.scrollTop = dlg.scrollHeight;
  }

  function resultHtml(game, night) {
    var r = game.result;
    var desc = {
      '灯下留名': '证词、物证、人心，三样都摆得齐整。天亮时，你在簿上写下他的名字，笔锋很稳。',
      '破晓': '灯油见了底，你还是把人认了出来。只是有人始终没肯多说一句。',
      '一灯独明': '有人中途拂袖而去，空了一张椅子。好在剩下的那盏灯，照对了人。',
      '空盏': '座位空了，灯油还剩半盏。你没能留住他。',
      '灯灭': '灯下站着的，是个活人。真正的无相，已经在你背后走出了门。'
    }[r.ending] || '';
    var reveal = r.reveal.map(function (rv) {
      return '<div class="reveal-row"><div class="k">' + esc(rv.clue) + '</div><div class="v">' +
        rv.topic + ' 真值：<em>' + esc(rv.expect) + '</em><br />' +
        rv.words.map(function (w) {
          var ok = w.value === rv.expect;
          return esc(w.name) + ' 说「<span class="' + (ok ? '' : '') + '">' + (ok ? '<em>' + esc(w.value) + '</em>' : '<i>' + esc(w.value) + '</i>') + '</span>」';
        }).join('　·　') + '</div></div>';
    }).join('');
    var belief = Object.keys(r.belief).map(function (k) {
      var q = Game.guest(game, k);
      return '<div class="belief-row"><span class="nm">' + esc(q ? q.name : k) + '</span><div class="bar"><i style="width:' + (r.belief[k] * 100).toFixed(1) + '%"></i></div><span class="pct">' + (r.belief[k] * 100).toFixed(1) + '%</span></div>';
    }).join('');
    return {
      ornament: r.correct ? '◈' : '✕',
      eyebrow: '第 ' + ['一', '二', '三'][night - 1] + ' 夜 · 结 局',
      title: r.ending, desc: desc, score: r.score,
      reveal: '<div style="font-size:11px;color:var(--muted);letter-spacing:.14em;margin-bottom:6px">真 相 摊 开</div>' +
        '<div class="reveal-row"><div class="k">无相</div><div class="v"><i>' + esc(r.impostor) + '</i>　·　你指认了 ' + esc(r.accused || '（无人）') + '</div></div>' + reveal,
      belief: '<div style="font-size:11px;color:var(--muted);letter-spacing:.14em;margin:6px 0">掌 柜 的 判 断（证词推理置信度）</div>' + belief,
      review: r.review || null,
      chain: r.chain,
      foot: '证据链 ' + r.chain + ' 条 · 余灯 ' + r.lampsLeft + ' 盏 · 平均信任 ' + r.avgTrust + '　|　seed ' + esc(game.seed)
    };
  }
  /* ---- 复盘卡：漏掉的物证 / 自相矛盾 / 离最高结局差多少 ---- */
  function reviewHtml(r) {
    var rv = r.review;
    if (!rv) return '';
    var rows = [];

    if (rv.missed.length) {
      rows.push('<div class="rv-h">你 漏 掉 的 物 证</div>' + rv.missed.map(function (m) {
        return '<div class="rv-row"><span class="rv-k">' + esc(m.clue) + '</span>' +
          '<span class="rv-v">「' + esc(m.topic) + '」没问到：' + esc(m.guests.join('、')) + '</span></div>';
      }).join(''));
    } else {
      rows.push('<div class="rv-h">你 漏 掉 的 物 证</div><div class="rv-row"><span class="rv-v">没有遗漏 —— 每条物证都问到了。</span></div>');
    }

    if (rv.contradictions.length) {
      rows.push('<div class="rv-h">自 相 矛 盾</div>' + rv.contradictions.map(function (c) {
        return '<div class="rv-row"><span class="rv-k">' + esc(c.guest) + '</span>' +
          '<span class="rv-v"><i>' + esc(c.topic) + '</i> 说「' + esc(c.said) + '」，' +
          '与事实「' + esc(c.expect) + '」不符</span></div>';
      }).join(''));
    } else {
      rows.push('<div class="rv-h">自 相 矛 盾</div><div class="rv-row"><span class="rv-v">没有捕捉到矛盾 —— 三人证词都咬得住。</span></div>');
    }

    var gap;
    if (!rv.reachable) {
      gap = '本档「' + esc(rv.bestEnding) + '」需 ' + rv.need + ' 条证据，但本档只有 ' + rv.lampsAll +
        ' 盏灯（最多问 ' + rv.lampsAll + ' 句）→ 数学上不可达，属高档加压设计';
    } else if (r.chain >= rv.need) {
      gap = '证据链 ' + r.chain + ' 条 ≥ 门槛 ' + rv.need + ' 条 —— 最高结局条件已达成';
    } else {
      gap = '「' + esc(rv.bestEnding) + '」需 ' + rv.need + ' 条证据，你拿到 ' + r.chain + ' 条，差 ' + (rv.need - r.chain) + ' 条';
    }
    rows.push('<div class="rv-foot">' + gap + '　·　用灯 ' + rv.lampsUsed + '/' + rv.lampsAll +
      (rv.wastedAsks ? '　·　' + rv.wastedAsks + ' 次问在了非物证话题上' : '') + '</div>');

    return '<div class="rv-wrap">' + rows.join('') + '</div>';
  }

  function paintResult(ctx) {
    var game = ctx.game, r = resultHtml(game, game.night);
    document.getElementById('result-ornament').textContent = r.ornament;
    document.getElementById('result-eyebrow').textContent = r.eyebrow;
    document.getElementById('result-title').textContent = r.title;
    document.getElementById('result-desc').textContent = r.desc;
    document.getElementById('result-score').textContent = (r.score > 0 ? '+' : '') + r.score;
    document.getElementById('result-reveal').innerHTML = r.reveal;
    document.getElementById('result-belief').innerHTML = r.belief;
    var rv = document.getElementById('result-review');
    if (rv) rv.innerHTML = reviewHtml(r);
    document.getElementById('result-foot').textContent = r.foot;
    var next = document.getElementById('btn-next-night');
    next.textContent = game.night >= 3 ? '看完这三夜' : '接着守下一夜';
  }

  SD.UI = {
    esc: esc, markWords: markWords, portrait: portrait, initCanvas: initCanvas, audio: audio,
    showScreen: showScreen, openModal: openModal, closeModal: closeModal, toast: toast,
    paint: paint, paintResult: paintResult, resultHtml: resultHtml,
    logicBoardHtml: logicBoardHtml, logicStageHtml: logicStageHtml, auditHtml: auditHtml, ACTS: ACTS,
    toggleClue: toggleClue,
    /* 换夜/换局时一并清掉物证展开状态：物证 id 是 clue_<话题>，跨夜会重名 */
    resetCache: function () { _cache = {}; openClues = {}; },
    KEY_HINT: KEY_HINT
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
