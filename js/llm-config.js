/* P6 可选：云端润色代理配置（默认关闭）。
 * 部署代理后，把 endpoint 填成 "<proxy 地址>/api/polish"，游戏会在每句 NPC 台词后
 * 异步润色（先显示原文、成功后替换）；留空 = 纯端侧，零网络、零行为变化。
 *
 * 注意：llm.js 已定义 enabled / polish / polishLog；这里只补 endpoint / timeout，
 * 不覆盖已有键（用 typeof 判断，保留任何外部注入值）。
 */
(function (g) {
  'use strict';
  g.SANDENG_LLM = g.SANDENG_LLM || {};
  if (typeof g.SANDENG_LLM.endpoint !== 'string') g.SANDENG_LLM.endpoint = '';
  if (typeof g.SANDENG_LLM.timeout !== 'number') g.SANDENG_LLM.timeout = 5000;
})(typeof window !== 'undefined' ? window : this);
