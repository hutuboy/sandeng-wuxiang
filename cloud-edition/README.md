# 三更灯 · 云档版（云存档 + 排行榜）

这是《三更灯 · 无相客栈》的**云档分支**，与根目录的原版静态站彼此独立：原版继续作为竞赛提交版本（纯离线、零外部请求），本版接入 WorkBuddy 云服务，提供免注册的云存档与排行榜。

## 身份：Cookie 自动取名，无注册

- 首次打开生成 `sd_cid` Cookie（`sd_` + 32 位随机十六进制，有效期一年、`SameSite=Lax`，https 下带 `Secure`）；`file://` 或隐私模式拒绝 Cookie 时退回 `localStorage`，保住同一身份。
- 侠名由该标识**确定性哈希**得出：如 `流萤·客卿-db6e`。同一 Cookie 永远同名，不需要输入任何资料。
- 换浏览器、清 Cookie / 站点数据就会换一个新侠名——这是无注册方案的固有代价，面板里已明示。

## 三个能力

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 云存档 | 封面「云档 · 排行榜」→「上传 / 取回云存档」 | 存完整对局快照（与本地 `sandeng.save.v2` 同结构）；按 Cookie 令牌隔离，别人读不到也改不了 |
| 排行榜 | 结算屏「上传成绩 · 排行榜」→「查看排行榜」 | 守满三夜才可上传；公开只读前 50 名，按累计分降序、同分先到在前 |
| 离线玩法 | 双击 `index.html` | 与竞赛版完全一致；云按钮只在点击时按需加载 SDK，`file://` 下给出明确降级提示，零外部请求 |

## 云服务配置

- 复用会话中已有应用：`wbapp_XI4fTWFZtJY08ipIT9bg4W`（名称「三更灯 · 无相客栈」），`billingStatus=normal` / `provisionStatus=assigned`。
- `js/cloud-config.js` 由 `publicConfig` 落盘（`endpoint` / `oauthRelayBaseUrl` / `publishableKey` / `resourceId`）。**换应用或换发布域必须整份替换**，服务端按源站精确匹配。
- SDK 走 CDN IIFE：`@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js`，只在 https 且用户点击云按钮后动态加载，不进首屏请求。

## 数据表（public schema，均已开启 RLS）

| 表 | 用途 | 权限 |
| --- | --- | --- |
| `sd_saves` | `client_id` 主键 + `display_name` + `state JSONB` + `updated_at` | 直接读写**全部拒绝**；只能走 `sd_save_put` / `sd_save_get` 两个 `SECURITY DEFINER` 函数，入参校验长度后按令牌 upsert / 查询 |
| `sd_scores` | 成绩：命中数、累计分、余灯、档位、seed、三夜明细 | `anon` / `authenticated` 可 SELECT（公开榜）、可 INSERT（带 CHECK 约束），**无 UPDATE / DELETE 策略**，上榜后不可改 |

## 已知边界

- **成绩由客户端上报，不可防篡改**：没有注册/服务端校验，就无法证明分数来自真实对局。榜单是趣味排行，不能当公平竞技。
- Cookie 是可随身携带的令牌：拿到别人的 `sd_cid` 就能读他的存档。随机 128 bit 下不可猜，但不要把它贴到公开场合。
- 云功能必须在**该应用的保留发布域**下才生效（源站精确匹配）；本地 `file://` 只能玩离线部分。
- 未发布。发布时须复用同一 `applicationId`，并把 `.wbapp_XI4fTWFZtJY08ipIT9bg4W.genie` 的 `entryHtml` 改为 `cloud-edition/index.html`。

## 验证记录（2026-11-18）

- 数据库：`sd_save_put` 写入 → `sd_save_get` 读回一致；换 `client_id` 读回 0 行；`sd_scores` 插入后按分数排序正确；测试行已清除。
- 前端：`.tooling/cloud_smoke.cjs` **10/10**（云按钮 / 首屏零 SDK / 侠名确定性 / 四动作齐全 / file:// 降级提示 / 离线开局 / 问话 / 零 pageerror / 零非本地请求）。
- **待发布后验证**：从保留域真实调用 SDK 的存档写入读回与榜单提交（源站校验使本地无法端到端模拟）。
