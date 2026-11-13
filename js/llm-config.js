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
  /* 只在 https（= 线上）下启用。file:// 是本地开发与四道门禁的运行环境：
   * ①门禁 G-52 要求「非 file:// 请求 0」，本地一律零网络才不会被云端调用污染；
   * ②代理每天免费额度 2000 次，QA 反复跑不该烧在本地测试上。 */
  var online = (typeof location !== 'undefined' && location && location.protocol === 'https:');
  if (typeof g.SANDENG_LLM.endpoint !== 'string') {
    // P6 已上线：独立润色代理（魔搭 Docker 创空间，服务端持 Key，前端不接触）
    g.SANDENG_LLM.endpoint = online ? 'https://hutuboy-sandeng-proxy.ms.show/api/polish' : '';
  }
  if (typeof g.SANDENG_LLM.timeout !== 'number') g.SANDENG_LLM.timeout = 5000;
})(typeof window !== 'undefined' ? window : this);
