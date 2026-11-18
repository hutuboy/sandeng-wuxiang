/* L2 云端兜底适配器（可选、默认关闭、1.5s 超时、静默回退）
 * 只润色 NPC 表层台词，不参与决策、不写存档；未配置 endpoint 时零网络、零行为变化。
 *
 * 启用方式（二选一）：
 *   1) window.SANDENG_LLM = { endpoint: 'https://your-host/polish', key?: '...', timeout?: 1500 };
 *   2) <script>window.SANDENG_LLM = { endpoint: ... }</script> 在任何 NPC 动作之前注入
 * 关闭：不配置 endpoint 即纯端侧（默认）。
 */
(function (g) {
  'use strict';
  var DEF_TIMEOUT = 1500;

  function cfg() {
    var c = g.SANDENG_LLM;
    return (c && typeof c.endpoint === 'string' && c.endpoint) ? c : null;
  }
  function enabled() { return !!cfg(); }

  /** 返回 Promise<string>：成功=润色文本；未启用/超时/任何错误=baseText（绝不抛错、绝不阻塞） */
  function polish(payload, baseText) {
    var c = cfg();
    if (!c) return Promise.resolve(baseText);
    return new Promise(function (resolve) {
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; resolve(baseText); } }, c.timeout || DEF_TIMEOUT);
      function fin(v) { if (!done) { done = true; clearTimeout(to); resolve(typeof v === 'string' && v ? v : baseText); } }
      try {
        var headers = { 'Content-Type': 'application/json' };
        if (c.key) headers['Authorization'] = 'Bearer ' + c.key;
        fetch(c.endpoint, {
          method: 'POST', headers: headers,
          body: JSON.stringify({
            persona: payload && payload.persona,
            state: payload && payload.state,
            action: payload && payload.action,
            baseText: baseText
          })
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { fin(j && j.text); })
          .catch(function () { fin(null); });
      } catch (e) { fin(null); }
    });
  }

  /** 对一条日志做非阻塞润色：成功后替换 entry.text 并回调重绘；失败保持原文
   *  prefix（可选）：entry.text 里不参与润色的固定前缀（如「【名·动作】」），润色只吃台词部分 */
  function polishLog(entry, payload, rerender, prefix) {
    if (!enabled() || !entry || entry.l2polished) return;
    entry.l2polished = true;
    var pre = typeof prefix === 'string' ? prefix : '';
    var text = typeof entry.text === 'string' ? entry.text : '';
    var base = (pre && text.slice(0, pre.length) === pre) ? text.slice(pre.length) : text;
    polish(payload, base).then(function (txt) {
      if (txt && txt !== base) {
        entry.text = pre + txt;
        if (typeof rerender === 'function') rerender();
      }
    });
  }

  g.SANDENG_LLM = Object.assign(g.SANDENG_LLM || {}, {
    enabled: enabled, polish: polish, polishLog: polishLog, _timeout: DEF_TIMEOUT
  });
})(typeof window !== 'undefined' ? window : this);
