/* =====================================================================
 * 三更灯 · 无相客栈  |  guide.js
 * 新用户首次操作指引：纯前端 / 零依赖 / 只读 DOM 几何 / 绝不触碰游戏状态
 *
 * 契约来源（冲突以制作人裁决单为准）：
 *   docs/引导-设计案-v1.md      步骤 id / 顺序 / 文案 / 参数终值
 *   docs/引导-视觉规格-v1.md    类名 / 层级 / 动效 / 移动端
 *   docs/引导-制作人裁决单-v1.md  C-1..C-12 冲突终裁
 *
 * 硬边界：本文件禁止调用 Game.dispatch / doAsk / doListen / UI.paint /
 *         SANDENG_API.dispatch，禁止读写 sandeng.save.v2，禁止改灯数与证词。
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = g.SD;
  if (!SD) return;

  /* ---------------- 契约常量（写死，不从 DOM 反读） ---------------- */
  var KEY = 'sandeng.guide.v1';
  var VAL_DONE = 'done';
  var VAL_SKIP = 'skipped';
  var TOTAL = 6;
  var AUTO_DELAY = 500;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* 步骤表：逐字来自 docs/引导-设计案-v1.md 第二章（唯一来源） */
  var STEPS = [
    { id: 'G1', anchor: null, fallback: null, secondary: null,
      title: '掌柜手札 · 今夜',
      body: '一夜三客，一人是无相。六盏灯，问一句灭一盏，灯尽前认出他。' },
    { id: 'G2', anchor: '#guest-switch', fallback: '#guest-row', secondary: null,
      title: '先相中一位',
      body: '三位客人都到了。灯下这扇窗一次只开一位，上方换人；第一位已替你相中。' },
    { id: 'G3', anchor: '#tone-group', fallback: '.action-dock', secondary: null,
      title: '同一句，三种问法',
      body: '温问养信任，逼问要真话，示物压伪饰。语气随你，先不定也成。' },
    { id: 'G4', anchor: '#topic-row', fallback: '.action-dock', secondary: null,
      title: '点话头，就是开口',
      body: '五张话头，点一张便是问一句、灭一盏灯。等下由你亲手点。' },
    { id: 'G5', anchor: '#statement-list', fallback: '.col-left', secondary: '#clue-list',
      title: '话落在簿上',
      body: '他答的话记进证词簿，拿去对柜上物证，破绽才现形。' },
    { id: 'G6', anchor: '.topbar', fallback: '.tb-center', secondary: null,
      title: '该你开口了',
      body: '灯在顶栏，「AI」摊开客人的心思，灯尽前点灯指认。现在，点张话头，问出第一句吧。' }
  ];

  /* ---------------- 模块内存态（绝不落盘中间进度） ---------------- */
  var active = false;
  var stepIdx = 0;
  var replayMode = false;
  var root = null;
  var memFlag = null;           // localStorage 不可用时的会话内兜底
  var priorFocus = null;
  var autoTimer = 0;
  var rafId = 0;
  var afterglowTimer = 0;
  var scrollLocked = false;
  var currentHelpRect = null;   // #btn-help 豁免洞 rect（仅用于坐标判定，不建捕获层）
  var E = {};                   // 缓存 DOM 引用

  /* ---------------- 存储：只碰自己的键 ---------------- */
  function readFlag() {
    try { return localStorage.getItem(KEY); } catch (e) { return memFlag; }
  }
  function writeFlag(v) {
    memFlag = v;
    try { localStorage.setItem(KEY, v); } catch (e) { /* 隐私模式：仅内存态 */ }
  }
  function hasFlag() {
    var v = readFlag();
    return v === VAL_DONE || v === VAL_SKIP;
  }

  function params() {
    var o = {};
    (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) { /* 忽略坏参数 */ }
    });
    return o;
  }

  /* ---------------- DOM 工具 ---------------- */
  function qs(sel) {
    if (!sel) return null;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }
  /* C-8：不用 offsetParent —— ≤760px 时 .action-dock 是 position:fixed，
     offsetParent 恒为 null，会把 G3/G4 锚点误判为不可见。 */
  function visible(el) {
    if (!el) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    try { if (el.getClientRects().length === 0) return false; } catch (e) { return false; }
    return true;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rectIntersects(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }
  function elRect(el) { return el.getBoundingClientRect(); }

  /* 当前步的可见锚点列表（主锚 + 同屏可见副锚，最多 2 个；C-1 建议 ≤3） */
  function anchorsFor(step) {
    var list = [];
    if (!step.anchor) return list;                 // G1：整屏无洞
    var main = qs(step.anchor);
    if (!visible(main)) main = qs(step.fallback);
    if (visible(main)) list.push(main);
    if (step.secondary && innerWidth > 400) {          // 设计案 9.2：≤400px 强制单洞
      var sec = qs(step.secondary);
      if (visible(sec)) {
        var r = elRect(sec);
        if (r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight) list.push(sec);
      }
    }
    return list;
  }

  /* 洞几何：视口坐标系，不叠加 scrollY / scrollTop（视觉规格 1.5-1） */
  function rectsFor(step) {
    var pad = innerWidth <= 400 ? 6 : 8;
    var out = [];
    anchorsFor(step).forEach(function (el) {
      var r = elRect(el);
      var x = clamp(r.left - pad, 0, innerWidth);
      var y = clamp(r.top - pad, 0, innerHeight);
      var w = clamp(r.width + pad * 2, 0, innerWidth - x);
      var h = clamp(r.height + pad * 2, 0, innerHeight - y);
      if (w > 0 && h > 0) out.push({ x: x, y: y, w: w, h: h });
    });
    return out;
  }
  /* C-2：#btn-help 豁免洞只挖空、不画琥珀框，用于「可见」 */
  function helpRect() {
    var b = qs('#btn-help');
    if (!visible(b)) return null;
    var r = elRect(b), pad = 4;
    var x = clamp(r.left - pad, 0, innerWidth), y = clamp(r.top - pad, 0, innerHeight);
    return { x: x, y: y, w: clamp(r.width + pad * 2, 0, innerWidth - x),
             h: clamp(r.height + pad * 2, 0, innerHeight - y) };
  }

  /* ---------------- 构建引导层（body 直接子节点） ---------------- */
  function build() {
    root = document.createElement('div');
    root.id = 'guide-layer';
    root.setAttribute('data-guide-step-total', String(TOTAL));
    root.setAttribute('data-guide-step', STEPS[0].id);

    var dots = '';
    for (var i = 0; i < TOTAL; i++) {
      dots += '<span class="guide-dot' + (i === 0 ? ' is-active' : ' is-todo') + '"' +
              (i === 0 ? ' aria-current="step"' : '') + '></span>';
    }

    root.innerHTML =
      '<div class="guide-scrim" id="guide-scrim" aria-hidden="true"></div>' +
      '<svg class="guide-mask" id="guide-mask" aria-hidden="true" xmlns="' + SVG_NS + '">' +
        '<defs><mask id="guide-holes" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">' +
          '<rect id="guide-mask-white" x="0" y="0" width="100" height="100" fill="#ffffff"/>' +
          '<g id="guide-mask-holes"></g>' +
        '</mask></defs>' +
        '<rect id="guide-mask-fill" x="0" y="0" width="100" height="100" ' +
          'fill="#050409" fill-opacity="0.72" mask="url(#guide-holes)"/>' +
      '</svg>' +
      '<div id="guide-holes-box" aria-hidden="true"></div>' +
      /* 5.4-5：不为 #btn-help 新建任何捕获层 / 透传层，唯一命中层是 .guide-scrim */
      '<div class="guide-bubble" id="guide-bubble" role="dialog" aria-modal="true" ' +
        'aria-labelledby="guide-title" aria-describedby="guide-body" tabindex="-1">' +
        '<div class="guide-bubble__arrow" id="guide-arrow" aria-hidden="true"></div>' +
        '<div class="guide-label" id="guide-label"></div>' +
        '<h3 class="guide-bubble__title" id="guide-title"></h3>' +
        '<p class="guide-bubble__body" id="guide-body" aria-live="polite"></p>' +
        '<div class="guide-progress" id="guide-progress" role="group">' +
          dots + '<span class="guide-progress__text" id="guide-progress-text" aria-live="polite"></span>' +
        '</div>' +
        '<div class="guide-actions" id="guide-actions">' +
          '<button type="button" class="btn btn-ghost" id="btn-guide-prev">上一步</button>' +
          '<button type="button" class="btn btn-primary" id="btn-guide-next">下一步</button>' +
          '<button type="button" class="btn btn-ghost guide-actions__skip" id="btn-guide-skip">跳过</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(root);

    E.scrim = root.querySelector('#guide-scrim');
    E.svg = root.querySelector('#guide-mask');
    E.mask = root.querySelector('#guide-holes');
    E.maskWhite = root.querySelector('#guide-mask-white');
    E.maskHoles = root.querySelector('#guide-mask-holes');
    E.maskFill = root.querySelector('#guide-mask-fill');
    E.holesBox = root.querySelector('#guide-holes-box');
    E.bubble = root.querySelector('#guide-bubble');
    E.arrow = root.querySelector('#guide-arrow');
    E.label = root.querySelector('#guide-label');
    E.title = root.querySelector('#guide-title');
    E.body = root.querySelector('#guide-body');
    E.progress = root.querySelector('#guide-progress');
    E.progressText = root.querySelector('#guide-progress-text');
    E.dots = [].slice.call(root.querySelectorAll('.guide-dot'));
    E.prev = root.querySelector('#btn-guide-prev');
    E.next = root.querySelector('#btn-guide-next');
    E.skip = root.querySelector('#btn-guide-skip');
  }

  /* ---------------- 重算遮罩 / 高亮框 / 气泡 ---------------- */
  function recompute() {
    if (!active || !root) return;
    var W = innerWidth, H = innerHeight;
    var step = STEPS[stepIdx];
    var rects = rectsFor(step);
    var hr = helpRect();

    /* SVG：用户单位 = CSS 像素，显式尺寸避免 objectBoundingBox 换算 */
    E.svg.setAttribute('width', W);
    E.svg.setAttribute('height', H);
    E.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    E.svg.setAttribute('preserveAspectRatio', 'none');
    E.mask.setAttribute('x', 0); E.mask.setAttribute('y', 0);
    E.mask.setAttribute('width', W); E.mask.setAttribute('height', H);
    [E.maskWhite, E.maskFill].forEach(function (r) {
      r.setAttribute('x', 0); r.setAttribute('y', 0);
      r.setAttribute('width', W); r.setAttribute('height', H);
    });

    /* 黑矩形 = 挖空；豁免洞并入同一 mask，但不生成 .guide-hole（无琥珀框） */
    while (E.maskHoles.firstChild) E.maskHoles.removeChild(E.maskHoles.firstChild);
    var all = hr ? rects.concat([hr]) : rects;
    all.forEach(function (r) {
      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', r.x); rect.setAttribute('y', r.y);
      rect.setAttribute('width', r.w); rect.setAttribute('height', r.h);
      rect.setAttribute('rx', 4); rect.setAttribute('fill', '#000000');
      rect.setAttribute('class', 'guide-hole-mask');
      E.maskHoles.appendChild(rect);
    });

    /* 高亮框：纯视觉，pointer-events:none（CSS） */
    E.holesBox.innerHTML = rects.map(function (r, i) {
      return '<div class="guide-hole" data-guide-anchor="' + i + '" style="left:' + r.x +
             'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px"></div>';
    }).join('');

    /* 5.4-5：豁免洞只挖像素；该 rect 的点击由 .guide-scrim 统一消费，
       主程序在 onClick 里按 3.2 映射为「跳过」。无捕获层、无透传。 */
    currentHelpRect = hr;

    placeBubble(rects);
    try { document.dispatchEvent(new CustomEvent('guide:rects', { detail: { step: step.id, rects: rects } })); }
    catch (e) { /* CustomEvent 不可用时忽略 */ }
  }

  /* 矩形归一：{x,y,w,h} 或 DOMRect → {left,top,right,bottom} */
  function toRect(r) {
    if (!r) return { left: 0, top: 0, right: 0, bottom: 0 };
    var l = (r.x !== undefined ? r.x : r.left);
    var t = (r.y !== undefined ? r.y : r.top);
    var w = (r.w !== undefined ? r.w : r.width);
    var h = (r.h !== undefined ? r.h : r.height);
    return { left: l, top: t, right: l + w, bottom: t + h };
  }
  function overlapArea(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  /* 气泡定位：候选四向落位，逐个与本步「全部高亮洞（含副锚）+ 吸底操作台」求交，
     取首个零重叠；全重叠时取重叠面积最小者。避免「讲什么就遮什么」。 */
  function placeBubble(rects) {
    var W = innerWidth, H = innerHeight;
    var b = E.bubble;
    b.style.visibility = 'hidden';
    b.style.left = '0px'; b.style.top = '0px';
    var bw = b.offsetWidth, bh = b.offsetHeight;

    var mobile = W <= 760;
    var topSafe = (mobile ? 52 : 58) + 8;
    var dockEl = qs('.action-dock');
    var dockRect = (mobile && visible(dockEl)) ? elRect(dockEl) : null;

    var obstacles = rects.map(toRect);
    if (dockRect) obstacles.push(toRect(dockRect));

    var minLeft = 12;
    var maxLeft = Math.max(minLeft, W - bw - 12);
    var minTop = topSafe;
    var maxTop = Math.max(minTop, (dockRect ? dockRect.top - 12 : H - 16) - bh);

    var main = rects[0] ? toRect(rects[0])
      : { left: 0, right: W, top: topSafe - 8, bottom: topSafe - 8 };
    var gap = 12;
    var cx = main.left + (main.right - main.left) / 2 - bw / 2;
    var cy = main.top + (main.bottom - main.top) / 2 - bh / 2;

    var cands = [
      { top: main.bottom + gap, left: cx, placement: 'top' },       // 下方
      { top: main.top - gap - bh, left: cx, placement: 'bottom' },  // 上方
      { top: cy, left: main.right + gap, placement: 'left' },       // 右侧
      { top: cy, left: main.left - gap - bw, placement: 'right' },  // 左侧
      { top: minTop, left: cx, placement: 'bottom' },               // 贴顶
      { top: maxTop, left: cx, placement: 'top' }                   // 贴底（操作台上方）
    ];

    var chosen = null, minArea = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var left = clamp(c.left, minLeft, maxLeft);
      var top = clamp(c.top, minTop, maxTop);
      var box = { left: left, right: left + bw, top: top, bottom: top + bh };
      var area = 0;
      for (var j = 0; j < obstacles.length; j++) area += overlapArea(box, obstacles[j]);
      if (area === 0) { chosen = { left: left, top: top, placement: c.placement }; break; }
      if (area < minArea) { minArea = area; chosen = { left: left, top: top, placement: c.placement }; }
    }
    if (!chosen) chosen = { left: minLeft, top: minTop, placement: 'bottom' };

    var finalBox = { left: chosen.left, right: chosen.left + bw, top: chosen.top, bottom: chosen.top + bh };
    b.classList.toggle('is-dock-anchor', !!dockRect && overlapArea(finalBox, toRect(dockRect)) > 0);

    b.style.left = Math.round(chosen.left) + 'px';
    b.style.top = Math.round(chosen.top) + 'px';
    b.style.visibility = 'visible';

    /* 箭头：气泡在洞下方 → 朝上；在洞上方 → 朝下；左右落位时统一朝下 */
    var arrowUp = chosen.placement === 'top';
    E.arrow.className = 'guide-bubble__arrow ' + (arrowUp ? 'is-top' : 'is-bottom');
    var ax = clamp(main.left + (main.right - main.left) / 2 - chosen.left - 7, 14, Math.max(14, bw - 21));
    E.arrow.style.left = Math.round(ax) + 'px';
    b.setAttribute('data-guide-placement', chosen.placement);
  }

  function scheduleRecompute() {
    if (!active) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function () { rafId = 0; recompute(); });
  }

  /* ---------------- 步骤 ---------------- */
  function setStep(i) {
    if (!active || !root) return;
    stepIdx = clamp(i, 0, TOTAL - 1);
    var step = STEPS[stepIdx], n = stepIdx + 1;

    root.setAttribute('data-guide-step', step.id);
    /* 先广播步号、让应用把对应的幕切上来，再量锚点几何（P0 五幕改造）。
       顺序不可互换：若先量几何，G2–G6 会量到未显示的窗口 → 洞数为 0。 */
    try { document.dispatchEvent(new CustomEvent('guide:step', { detail: { stepNo: n, stepId: step.id } })); }
    catch (e) { /* 忽略 */ }
    E.label.textContent = '操作指引 · 第 ' + n + ' / ' + TOTAL + ' 步';
    E.title.textContent = step.title;
    E.body.textContent = step.body;
    E.progressText.textContent = n + ' / ' + TOTAL;
    E.progress.setAttribute('aria-label', '第 ' + n + ' 步，共 ' + TOTAL + ' 步');
    E.dots.forEach(function (d, k) {
      d.className = 'guide-dot ' + (k < stepIdx ? 'is-done' : (k === stepIdx ? 'is-active' : 'is-todo'));
      if (k === stepIdx) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    E.prev.disabled = stepIdx === 0;
    E.next.textContent = stepIdx === TOTAL - 1 ? '知道了 · 去问第一句' : '下一步';
    E.next.classList.toggle('is-last', stepIdx === TOTAL - 1);

    /* 切步先把锚点滚入可视区，再读几何；随后锁滚动（设计案 4. 章） */
    unlockScroll();
    var anchors = anchorsFor(step);
    if (anchors[0]) {
      try { anchors[0].scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { /* 忽略 */ }
    }
    requestAnimationFrame(function () {
      if (!active) return;
      lockScroll();
      recompute();
      try { E.bubble.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    });
  }

  function goPrev() { if (active && stepIdx > 0) setStep(stepIdx - 1); }
  function goNext() {
    if (!active) return;
    if (stepIdx >= TOTAL - 1) finish(VAL_DONE);
    else setStep(stepIdx + 1);
  }

  /* ---------------- 点击 / 键盘 / 滚动拦截 ---------------- */
  function onClick(e) {
    if (!active) return;
    /* 引导层是全拦截层：一律阻止冒泡到 document，main.js 的委托收不到任何点击 */
    e.stopPropagation();
    var t = e.target;
    var btn = t && t.closest ? t.closest('button') : null;
    if (btn) {
      if (btn.id === 'btn-guide-prev') goPrev();
      else if (btn.id === 'btn-guide-next') goNext();
      else if (btn.id === 'btn-guide-skip') finish(VAL_SKIP);
      return;
    }
    /* 5.4-5：#btn-help 豁免洞内的点击由 .guide-scrim 统一消费（不新建捕获层、
       不调用 #btn-help.click()、不 elementFromPoint().click()、不 dispatchEvent 转发），
       由引导层直接按 3.2 映射为「跳过」。 */
    var h = currentHelpRect;
    if (h && typeof e.clientX === 'number' &&
        e.clientX >= h.x && e.clientX <= h.x + h.w &&
        e.clientY >= h.y && e.clientY <= h.y + h.h) {
      finish(VAL_SKIP);
    }
  }

  function focusables() {
    return [E.prev, E.next, E.skip].filter(function (b) { return b && !b.disabled; });
  }
  function onKeyDown(e) {
    if (!active) return;
    var k = e.key;
    /* capture 阶段全拦截：main.js 的冒泡 keydown 不会收到任何键 */
    e.stopImmediatePropagation();
    if (k === 'Tab') {
      e.preventDefault();
      var list = focusables();
      if (!list.length) return;
      var i = list.indexOf(document.activeElement);
      var next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
      try { list[next].focus(); } catch (err) { /* 忽略 */ }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); finish(VAL_SKIP); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
    if (k === 'ArrowRight' || k === 'Enter' || k === ' ') { e.preventDefault(); goNext(); return; }
    /* 其余按键（1/2/3、Q/W/E/R/T、L、A、C 等）一律吞掉，不耗灯、不弹窗 */
    e.preventDefault();
  }
  function blockScroll(e) {
    if (active && scrollLocked) e.preventDefault();
  }
  function onScrollCapture() { scheduleRecompute(); }
  function onResize() { scheduleRecompute(); }

  function lockScroll() { scrollLocked = true; }
  function unlockScroll() { scrollLocked = false; }

  function bindGlobals() {
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', blockScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', blockScroll, { capture: true, passive: false });
    document.addEventListener('scroll', onScrollCapture, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }
  function unbindGlobals() {
    if (root) root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('wheel', blockScroll, true);
    document.removeEventListener('touchmove', blockScroll, true);
    document.removeEventListener('scroll', onScrollCapture, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
  }

  /* ---------------- 生命周期 ---------------- */
  function destroy() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
    unbindGlobals();
    unlockScroll();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null; E = {};
    document.body.classList.remove('is-guiding');
    /* C-2：不修改 #btn-help 的任何样式 —— 引导层移除即自动恢复 */
    if (priorFocus && priorFocus.focus) {
      try { priorFocus.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    }
    priorFocus = null;
  }

  function finish(value) {
    if (!active) return;
    /* C-7：replay / ?guide=1 全程不改写标记 */
    if (!replayMode) writeFlag(value);
    var v = value;
    destroy();
    active = false;
    if (v === VAL_DONE) afterglow();
    try { document.dispatchEvent(new CustomEvent('guide:done', { detail: { value: v, replay: replayMode } })); }
    catch (e) { /* 忽略 */ }
  }

  /* 可砍项：结束态 #topic-row 呼吸描边 2s，不拦截、不耗灯 */
  function afterglow() {
    var t = qs('#topic-row');
    if (!t) return;
    if (afterglowTimer) clearTimeout(afterglowTimer);
    t.classList.remove('guide-afterglow');
    void t.offsetWidth;
    t.classList.add('guide-afterglow');
    afterglowTimer = setTimeout(function () { t.classList.remove('guide-afterglow'); }, 2000);
  }

  function canAttach() {
    var s = qs('#screen-game');
    if (!s || !s.classList.contains('active')) return false;
    if (document.querySelector('.modal-mask')) return false;   // 3.3 启动前无活动弹窗
    return true;
  }

  /**
   * 启动引导。
   * @param {{replay?:boolean}} opts  replay=true 表示重看 / ?guide=1，不写标记
   */
  function start(opts) {
    opts = opts || {};
    if (active || !canAttach()) return false;
    replayMode = !!opts.replay;
    stepIdx = 0;
    priorFocus = document.activeElement;
    document.body.classList.add('is-guiding');
    build();
    active = true;
    bindGlobals();
    setStep(0);
    try { document.dispatchEvent(new CustomEvent('guide:start', { detail: { replay: replayMode } })); }
    catch (e) { /* 忽略 */ }
    return true;
  }

  /** main.js 在 startNight(1, true) 完成之后调用。 */
  function maybeAutoStart(app) {
    if (active || autoTimer) return;
    var p = params();
    if (p.guide === '0') return;                 // C-7：强制抑制
    if (p.guide === '1') return;                 // C-7：由 boot 显式强制复跑，避免双启动
    if (hasFlag()) return;                       // 老用户
    if (p.autopilot === '1' || (app && app.autopilot)) return;
    if (p.seed && p.night) return;               // 可复现 seed 直开
    if (!app || app.screen !== 'game' || !app.game) return;
    if (app.game.night !== 1 || app.game.phase !== 'playing') return;
    if (document.querySelector('.modal-mask')) return;
    autoTimer = setTimeout(function () {
      autoTimer = 0;
      if (hasFlag()) return;
      start({ replay: false });
    }, AUTO_DELAY);
  }

  /** C-9：进入结算 / 通关屏前的防御性收尾 */
  function forceCleanup() {
    if (!active) return;
    if (!replayMode && !hasFlag()) writeFlag(VAL_SKIP);
    destroy();
    active = false;
    try { document.dispatchEvent(new CustomEvent('guide:skip', { detail: { forced: true } })); }
    catch (e) { /* 忽略 */ }
  }

  SD.Guide = {
    KEY: KEY,
    TOTAL: TOTAL,
    /* 只读快照，供验收与调试；不提供任何改写游戏状态的入口 */
    status: function () {
      return { active: active, step: active ? stepIdx + 1 : 0,
               stepId: active ? STEPS[stepIdx].id : null,
               replay: replayMode, flag: readFlag(), total: TOTAL };
    },
    start: start,
    maybeAutoStart: maybeAutoStart,
    forceCleanup: forceCleanup,
    finish: function (v) { finish(v === VAL_DONE ? VAL_DONE : VAL_SKIP); },
    /* 只读：供 QA 比对文案，不作为期望值来源 */
    copyOf: function () { return STEPS.map(function (s) { return { id: s.id, title: s.title, body: s.body }; }); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
