/* =====================================================================
 * 三更灯 · ModelScope 线上增强 | ms-cloud.js
 * 本地 file:// 不注入开关：本文件只做隐藏按钮，不发任何请求。
 * 线上 Docker 后端注入 __SANDENG_CLOUD_ENABLED__ 后才启用云档 / 排行榜。
 * ===================================================================== */
(function (g) {
  'use strict';
  var ENABLED = g.__SANDENG_CLOUD_ENABLED__ === true;
  var BASE = g.__SANDENG_CLOUD_BASE__ || '/api/cloud';
  var SAVE_KEY = 'sandeng.save.v2';
  var meCache = null, mePromise = null, autoInFlight = null, backupInFlight = null;

  if (!ENABLED) {
    g.SANDENG_CLOUD = { enabled: false };
    return;
  }
  document.documentElement.classList.add('cloud-online');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function out(html) {
    var box = document.getElementById('cloud-out');
    if (box) box.innerHTML = html;
  }
  function toast(msg) {
    if (g.SD && g.SD.UI && g.SD.UI.toast) g.SD.UI.toast(msg);
  }
  function markResult(msg, kind) {
    if (!g.SANDENG_APP || g.SANDENG_APP.screen !== 'result') return;
    var foot = document.getElementById('result-foot');
    if (!foot || foot.getAttribute('data-auto-' + kind) === '1') return;
    foot.setAttribute('data-auto-' + kind, '1');
    foot.textContent += '　|　' + msg;
  }
  function api(path, options) {
    var opt = options || {};
    opt.credentials = 'same-origin';
    if (opt.body && typeof opt.body !== 'string') opt.body = JSON.stringify(opt.body);
    if (opt.body) opt.headers = Object.assign({ 'Content-Type': 'application/json' }, opt.headers || {});
    return fetch(BASE + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.reason || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function me() {
    if (meCache) return Promise.resolve(meCache);
    if (mePromise) return mePromise;
    mePromise = api('/me').then(function (j) {
      meCache = j;
      return j;
    }).catch(function (e) {
      mePromise = null;
      throw e;
    });
    return mePromise;
  }
  function fail(e) {
    var msg = (e && e.message) ? e.message : String(e || '未知错误');
    out('<p class="cloud-err">云操作失败：' + esc(msg) + '</p>');
    toast('云操作失败：' + msg);
  }
  function snapshot() {
    var A = g.SANDENG_APP;
    if (!A || !A.game) return null;
    return {
      v: 2, session: A.session, game: A.game, selected: A.selected,
      tone: A.tone, ended: A.ended, act: A.act
    };
  }

  function bindActions() {
    var save = document.getElementById('cloud-do-save');
    var load = document.getElementById('cloud-do-load');
    var submit = document.getElementById('cloud-do-submit');
    var board = document.getElementById('cloud-do-board');
    if (save) save.onclick = saveCloud;
    if (load) load.onclick = loadCloud;
    if (submit) submit.onclick = submitScore;
    if (board) board.onclick = showBoard;
  }

  function panel() {
    out('<p>正在确认侠名…</p>');
    me().then(function (j) {
      g.SD.UI.openModal('云档 · 排行榜',
        '<p class="cloud-id">侠名 <b>' + esc(j.name) + '</b><br />' +
        '<span>身份由服务端匿名 Cookie 自动生成，无需注册。清除 Cookie 会换一个新侠名。</span></p>' +
        '<div class="cloud-actions">' +
        '<button type="button" class="btn" id="cloud-do-save">备份当前进度</button>' +
        '<button type="button" class="btn" id="cloud-do-load">取回云端备份</button>' +
        '<button type="button" class="btn" id="cloud-do-submit">同步三夜成绩</button>' +
        '<button type="button" class="btn btn-ghost" id="cloud-do-board">查看排行榜</button>' +
        '</div><div id="cloud-out" class="cloud-out"></div>' +
        '<p class="cloud-note">每夜结算会自动备份云档；第三夜结算还会自动上传成绩。这里可手动覆盖备份或重传成绩。存档按浏览器身份隔离，排行榜只保留最高总分，属于趣味榜。</p>');
      bindActions();
      out('<p>已就绪。云档每夜自动备份，成绩第三夜自动上传。</p>');
    }).catch(fail);
  }

  function saveCloud() {
    var snap = snapshot();
    if (!snap) { out('<p>还没有开局，先点灯再存档。</p>'); return; }
    out('<p>正在上传存档…</p>');
    api('/save', { method: 'POST', body: { state: snap } }).then(function (j) {
      out('<p class="cloud-ok">已存档第 ' + esc(snap.game.night) + ' 夜。<br />侠名：' + esc(j.name) +
        '<br /><span>同一浏览器再点「取回云端备份」即可续上。</span></p>');
      toast('云档已备份');
    }).catch(fail);
  }

  function loadCloud() {
    out('<p>正在取回存档…</p>');
    api('/load').then(function (j) {
      if (!j.state) { out('<p>云端还没有你的备份，可先备份一次。</p>'); return; }
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(j.state)); } catch (e) { /* 隐私模式忽略 */ }
      var b = document.getElementById('btn-continue');
      if (b) { b.disabled = false; b.click(); }
      if (g.SD && g.SD.UI && g.SD.UI.closeModal) g.SD.UI.closeModal();
      toast('已取回云端备份 · ' + (j.name || '守夜人'));
    }).catch(fail);
  }

  function payloadFor(session) {
    var s = session || {};
    var nights = (s.nights || []).slice(0, 3);
    var last = nights[nights.length - 1] || {};
    return {
      correct: nights.filter(function (n) { return n && n.correct; }).length,
      total_score: (s.totalScore || 0),
      lamps_left: last.lampsLeft || 0,
      seed: s.seed || '',
      difficulty: s.difficultyTier || 'basic',
      chain_count: last.chain || 0,
      nights: nights
    };
  }
  function submitPayload(payload) {
    return api('/submit', { method: 'POST', body: payload });
  }
  function submitScore() {
    var A = g.SANDENG_APP;
    var nights = (A && A.session && A.session.nights) || [];
    if (nights.length < 3) {
      out('<p>守满三夜才能上榜；当前只走了 ' + nights.length + ' 夜。</p>');
      return;
    }
    out('<p>正在上传成绩…</p>');
    submitPayload(payloadFor(A.session)).then(function (j) {
      out('<p class="cloud-ok">已上榜：<b>' + esc(j.name) + '</b>，累计 ' + esc(j.total_score) +
        ' 分。若再次上传更低分，榜单会保留你的最高分。</p>');
      toast('成绩已上榜');
    }).catch(fail);
  }

  /* 三夜通关后自动上传：同一局只自动上报一次；失败后允许再次进入结算页重试。
     去重标记写在 session 上并随主流程 save() 落盘，避免刷新页面重复上报。 */
  function autoSubmit(session) {
    var s = session || {};
    var nights = s.nights || [];
    if (nights.length < 3) return Promise.resolve(null);
    var last = nights[nights.length - 1] || {};
    var sig = [s.seed || '', s.totalScore || 0, nights.length,
               last.night || 0, last.score || 0, last.correct ? 1 : 0].join('|');
    if (s.__sdAutoSubmittedFor === sig) return Promise.resolve(null);
    if (autoInFlight && autoInFlight.sig === sig) return autoInFlight.promise;
    s.__sdAutoSubmittedFor = sig;
    var promise = submitPayload(payloadFor(s)).then(function (j) {
      markResult('成绩已自动上传 · ' + (j.name || '侠名'), 'score');
      toast('三夜成绩已自动上传 · ' + (j.name || '侠名'));
      return j;
    }).catch(function (e) {
      s.__sdAutoSubmittedFor = '';
      markResult('自动上传未成功，可点右上角云档重试', 'score');
      toast('自动上传未成功，可点「同步成绩」重试');
      return null;
    });
    autoInFlight = { sig: sig, promise: promise };
    return promise;
  }

  /* 每夜结算自动备份云档：与成绩上传分开走 /save，失败后允许下次结算重试。
     signature 含夜数与本夜结算分，刷新/重复进入同一结算页不会反复备份。 */
  function autoBackup(session, night) {
    var s = session || {};
    var snap = snapshot();
    if (!snap) return Promise.resolve(null);
    var n = night || (snap.game && snap.game.night) || 0;
    var nights = s.nights || [];
    var last = nights[nights.length - 1] || {};
    var sig = [s.seed || '', n, s.totalScore || 0, nights.length,
               last.score || 0, last.correct ? 1 : 0].join('|');
    if (s.__sdAutoBackupFor === sig) return Promise.resolve(null);
    if (backupInFlight && backupInFlight.sig === sig) return backupInFlight.promise;
    s.__sdAutoBackupFor = sig;
    var promise = api('/save', { method: 'POST', body: { state: snap } }).then(function (j) {
      markResult('云档已自动备份 · 第 ' + n + ' 夜', 'backup');
      return j;
    }).catch(function (e) {
      s.__sdAutoBackupFor = '';
      markResult('云档备份失败，可点云档手动备份', 'backup');
      return null;
    });
    backupInFlight = { sig: sig, promise: promise };
    return promise;
  }

  function showBoard() {
    out('<p>正在读取排行榜…</p>');
    api('/leaderboard').then(function (j) {
      var rows = j.rows || [];
      if (!rows.length) { out('<p>榜上还没有人。守满三夜，做第一个。</p>'); return; }
      var html = '<div class="cloud-table"><table><thead><tr><th>#</th><th>侠名</th><th>累计分</th><th>命中</th><th>档位</th><th>余灯</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr' + (r.me ? ' class="is-me"' : '') + '><td>' + esc(r.rank) + '</td><td>' + esc(r.name) +
          '</td><td>' + esc(r.total_score) + '</td><td>' + esc(r.correct) + '/3</td><td>' + esc(r.difficulty) +
          '</td><td>' + esc(r.lamps_left) + '</td></tr>';
      });
      out(html + '</tbody></table></div>');
    }).catch(fail);
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('#btn-cloud') || t.closest('#btn-cloud-game') || t.closest('#btn-cloud-finale')) panel();
  });

  g.SANDENG_CLOUD = {
    enabled: true, panel: panel, save: saveCloud, load: loadCloud,
    submit: submitScore, autoSubmit: autoSubmit, autoBackup: autoBackup,
    board: showBoard, me: me
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
