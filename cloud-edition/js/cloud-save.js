/* =====================================================================
 * 三更灯 · 云档版 | cloud-save.js
 * 无注册：浏览器 Cookie 生成身份 → 侠名；云存档按 Cookie 令牌隔离；
 * 排行榜公开只读、条目只增不改。只在 https 下按需加载云 SDK。
 * ===================================================================== */
(function (g) {
  'use strict';
  var CFG = g.SD_CLOUD_CONFIG || {};
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';
  var COOKIE = 'sd_cid';
  var SAVE_KEY = 'sandeng.save.v2';
  var client = null, sdkPromise = null;

  /* ---------- Cookie 身份 ---------- */
  function hex(n) {
    var a = new Uint8Array(n), out = '', i;
    if (g.crypto && g.crypto.getRandomValues) g.crypto.getRandomValues(a);
    else for (i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < n; i++) out += ('0' + a[i].toString(16)).slice(-2);
    return out;
  }
  function readCookie() {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  function clientId() {
    var v = readCookie();
    /* file:// 与部分隐私模式下浏览器不写 Cookie，退回 localStorage 保住同一身份；
       线上 https 仍以 Cookie 为准（随请求携带、可设 Secure/SameSite）。 */
    if (!v || v.length < 8) { try { v = localStorage.getItem(COOKIE) || ''; } catch (e) { v = ''; } }
    if (v && v.length >= 8) return v;
    v = 'sd_' + hex(16);
    try {
      document.cookie = COOKIE + '=' + encodeURIComponent(v) +
        '; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) { /* 本地文件协议可能拒绝 */ }
    try { localStorage.setItem(COOKIE, v); } catch (e) { /* 隐私模式，只保内存态 */ }
    return v;
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function displayName(id) {
    var A = ['青竹', '孤鹤', '霜刃', '墨鲤', '寒鸦', '松风', '疏影', '赤羽', '白砚', '乌木', '流萤', '断桥'];
    var N = ['更夫', '游侠', '书生', '刀客', '道人', '伶人', '货郎', '算师', '守夜人', '镖师', '掌柜', '客卿'];
    var h = hash(id || '');
    return A[h % A.length] + '·' + N[(h >>> 8) % N.length] + '-' + ('0000' + (h & 0xffff).toString(16)).slice(-4);
  }

  /* ---------- 云服务（只初始化一次） ---------- */
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (g.WorkBuddyCloud && g.WorkBuddyCloud.createWorkBuddyCloud) return resolve(g.WorkBuddyCloud);
      if (location.protocol !== 'https:') {
        return reject(new Error('云档需要在线版（https）；本地双击打开仍可离线玩'));
      }
      var s = document.createElement('script');
      s.src = SDK_URL; s.async = true;
      s.onload = function () {
        if (g.WorkBuddyCloud && g.WorkBuddyCloud.createWorkBuddyCloud) resolve(g.WorkBuddyCloud);
        else reject(new Error('云组件加载失败'));
      };
      s.onerror = function () { reject(new Error('云组件加载失败，请检查网络')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }
  function cloud() {
    if (client) return Promise.resolve(client);
    if (!CFG.endpoint || !CFG.publishableKey) return Promise.reject(new Error('云配置缺失'));
    return loadSdk().then(function (W) {
      client = W.createWorkBuddyCloud({
        endpoint: CFG.endpoint,
        oauthRelayBaseUrl: CFG.oauthRelayBaseUrl,
        publishableKey: CFG.publishableKey
      });
      return client;
    });
  }

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function out(html) { var e = document.getElementById('cloud-out'); if (e) e.innerHTML = html; }
  function fail(e) {
    var msg = (e && e.message) ? e.message : String(e || '未知错误');
    out('<p class="cloud-err">云操作失败：' + esc(msg) + '</p>');
    if (g.SD && g.SD.UI) g.SD.UI.toast('云操作失败：' + msg);
  }
  function toast(m) { if (g.SD && g.SD.UI) g.SD.UI.toast(m); }
  function snapshot() {
    var A = g.SANDENG_APP;
    if (!A || !A.game) return null;
    return {
      v: 2, session: A.session, game: A.game, selected: A.selected,
      tone: A.tone, ended: A.ended, act: A.act
    };
  }

  /* ---------- 四个动作 ---------- */
  function saveCloud() {
    var id = clientId(), name = displayName(id), snap = snapshot();
    if (!snap) { out('<p>还没有开局，先点灯再存档。</p>'); return; }
    out('<p>正在上传存档…</p>');
    cloud().then(function (c) {
      return c.database.rpc('sd_save_put', { p_client: id, p_name: name, p_state: snap });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      out('<p class="cloud-ok">已存档第 ' + esc(snap.game.night) + ' 夜。<br />侠名：' + esc(name) +
        '<br /><span>同一浏览器再点「取回云存档」即可续上。</span></p>');
      toast('云存档已上传');
    }).catch(fail);
  }
  function loadCloud() {
    out('<p>正在取回存档…</p>');
    cloud().then(function (c) {
      return c.database.rpc('sd_save_get', { p_client: clientId() })
        .select('display_name,state,updated_at').order('updated_at', { ascending: false }).limit(1);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      var row = (r.data && r.data[0]) || null;
      if (!row) { out('<p>云端还没有你的存档，先上传一次。</p>'); return; }
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(row.state)); }
      catch (e) { /* 隐私模式下 localStorage 不可用，下面仍会用内存态续档 */ }
      var b = document.getElementById('btn-continue');
      if (b) { b.disabled = false; b.click(); }
      if (g.SD && g.SD.UI) g.SD.UI.closeModal();
      toast('已取回云端存档 · ' + row.display_name);
    }).catch(fail);
  }
  function submitScore() {
    var A = g.SANDENG_APP, ns = (A && A.session && A.session.nights) || [];
    if (ns.length < 3) { out('<p>守满三夜才能上榜；当前只走了 ' + ns.length + ' 夜。</p>'); return; }
    var id = clientId(), last = ns[ns.length - 1];
    var payload = {
      client_id: id, display_name: displayName(id),
      correct: ns.filter(function (n) { return n.correct; }).length,
      total_score: A.session.totalScore || 0,
      lamps_left: last.lampsLeft || 0,
      seed: A.session.seed || '',
      difficulty: A.session.difficultyTier || 'basic',
      chain_count: last.chain || 0,
      nights: ns
    };
    out('<p>正在上传成绩…</p>');
    cloud().then(function (c) {
      return c.database.from('sd_scores').insert(payload).select('id,total_score');
    }).then(function (r) {
      if (r && r.error) throw r.error;
      out('<p class="cloud-ok">已上榜：<b>' + esc(payload.display_name) + '</b>，累计 ' +
        esc(payload.total_score) + ' 分，命中 ' + esc(payload.correct) + '/3。</p>');
      toast('成绩已上榜');
    }).catch(fail);
  }
  function showBoard() {
    out('<p>正在读取排行榜…</p>');
    cloud().then(function (c) {
      return c.database.from('sd_scores')
        .select('display_name,total_score,correct,lamps_left,difficulty,seed,created_at')
        .order('total_score', { ascending: false }).order('created_at', { ascending: true }).limit(50);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) { out('<p>榜上还没有人。守满三夜，做第一个。</p>'); return; }
      var html = '<div class="cloud-table"><table><thead><tr><th>#</th><th>侠名</th><th>累计分</th><th>命中</th><th>档位</th><th>余灯</th></tr></thead><tbody>';
      rows.forEach(function (x, i) {
        html += '<tr><td>' + (i + 1) + '</td><td>' + esc(x.display_name) + '</td><td>' + esc(x.total_score) +
          '</td><td>' + esc(x.correct) + '/3</td><td>' + esc(x.difficulty) + '</td><td>' + esc(x.lamps_left) + '</td></tr>';
      });
      out(html + '</tbody></table></div>');
    }).catch(fail);
  }

  /* ---------- 面板 ---------- */
  function panel() {
    var id = clientId(), name = displayName(id);
    g.SD.UI.openModal('云档 · 排行榜',
      '<p class="cloud-id">侠名 <b>' + esc(name) + '</b><br />' +
      '<span>身份由本浏览器 Cookie 自动生成，无需注册。换浏览器或清除 Cookie 会换一个新侠名。</span></p>' +
      '<div class="cloud-actions">' +
      '<button type="button" class="btn" id="cloud-do-save">上传云存档</button>' +
      '<button type="button" class="btn" id="cloud-do-load">取回云存档</button>' +
      '<button type="button" class="btn" id="cloud-do-submit">上传三夜成绩</button>' +
      '<button type="button" class="btn btn-ghost" id="cloud-do-board">查看排行榜</button>' +
      '</div><div id="cloud-out" class="cloud-out"></div>' +
      '<p class="cloud-note">成绩由客户端上报，榜分不可防篡改——这里比的是手气与思路，不是公平竞技。</p>');
    document.getElementById('cloud-do-save').onclick = saveCloud;
    document.getElementById('cloud-do-load').onclick = loadCloud;
    document.getElementById('cloud-do-submit').onclick = submitScore;
    document.getElementById('cloud-do-board').onclick = showBoard;
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('#btn-cloud') || t.closest('#btn-cloud-finale')) panel();
  });

  g.SANDENG_CLOUD = {
    panel: panel, clientId: clientId, displayName: displayName,
    save: saveCloud, load: loadCloud, submit: submitScore, board: showBoard
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
