/* 由 WorkBuddy 云服务的 publicConfig 落盘（前端公开值，无密钥）。
 * 迁移应用时必须整份替换：endpoint / publishableKey 与应用的发布域绑定，
 * 换域会让所有云请求在 Origin 校验处失败。 */
window.SD_CLOUD_CONFIG = {
  endpoint: 'https://sandeng-wuxiang.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_XI4fTWFZtJY08ipIT9bg4W_r2IF6i05Jkf6ByUmrYxo6yjxAc0ilZW9',
  resourceId: 'wbcs_iJslaJn9pX0OnX4PggFjGg'
};
