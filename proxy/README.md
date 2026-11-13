# P6 云端润色代理 · sandeng-llm-proxy

> 游戏是纯静态站，浏览器不能持有 API Key。本代理**独立于游戏**、在服务端持有 Key，
> 只做一件事：把一句 NPC 台词润色后返回。游戏端 `js/llm.js` 超时 5s 内拿不到就
> **静默回退原文**，所以代理挂了游戏照常玩，判定层完全不受影响。

## 为什么用「代理」而不是「把后端塞进游戏创空间」

| 方案 | 优点 | 代价 | 结论 |
| --- | --- | --- | --- |
| **代理（本方案）** | 游戏保持纯静态、零改动、刚验收的线上不受影响；代理故障只降级不崩；Key 存代理侧 secret | 多一个服务要部署 | ✅ 采用 |
| Studio 服务端集成（游戏改 docker） | 单部署、同源无 CORS | 要把整个站点交给 Python 托管、改 `sdk_type`、重写部署链，**去动一个已上线且验收过的静态作品**，风险高 | ❌ 暂不采用 |

## 推荐链（魔搭 API-Inference，免费 2000 次/天、单模型 500/天）

按「快 → 强」自动降级，任一成功即返回；Qwen 系列关思考（实测 3.3s → 1.2s）：

1. `Qwen/Qwen3.8-Flash-Next`（turbo 位，~1.2s）
2. `Qwen/Qwen3.5-122B-A10B`（plus 位，~1.1s）
3. `Qwen/Qwen3.5-397B-A17B`（max 位）
4. `Qwen/Qwen3.5-27B`（`qwen-vl` 无纯文本对话版，用 27B 补位）

> 实测：非 Qwen 的 Flash 类模型（DeepSeek-V4.1-Flash / Step / MiniMax）返回 400，
> GLM-4.7-Flash 返回 429，故备份链**只用 Qwen**。27B/35B-A3B 有冷启动 30s 的情况，
> 只作末位兜底，靠 `PER_MODEL_TIMEOUT` 快速跳过。

## 每日限额：250 次，到额自动停（2026-11-13 起）

平台给的是 2000 次/天（单模型 500/天），但我们**主动把上限压到 250 次/天**，避免演示期被刷爆。

| 项目 | 口径 |
| --- | --- |
| 计什么 | **每一次真实发往魔搭的上游调用**（`_call` 一次 = 1 次）。超时 / 失败 / 备份链降级同样计数，因为平台照样消耗额度 |
| 何时停 | 北京时间（UTC+8）自然日内累计到 250 次，立刻停；`_call` 在构造 Request 之前就被闸门挡住，**上游零流量** |
| 停的样子 | `POST /api/polish` 仍回 **HTTP 200** + `{"text":null,"reason":"daily_limit","quota":{...}}`。前端 `js/llm.js` 看到空 text 就静默回退原文 —— 玩家无感、游戏照常玩，**不是把服务停掉** |
| 何时恢复 | 次日 00:00（UTC+8）自动归零；无需重启、无需人工干预 |
| 计数存哪 | 优先 `/mnt/workspace`、其次 `/workspace`，都没有就落系统临时目录；原子写（`os.replace`）+ 线程锁，创空间重启不会立刻清零。可用 `POLISH_QUOTA_FILE` 覆盖 |
| 怎么改 | secret / 环境变量 `POLISH_DAILY_LIMIT`（默认 250）。设 **0 = 手动急停**，整天一次模型都不调 |
| 怎么看 | `GET /health` 返回 `daily_limit` 与 `quota:{day,limit,used,remaining,stopped,persistent}`；每个润色响应也带回 `quota` |

> `persistent:false` 表示容器文件系统只读、计数退化为纯内存（重启会清零），此时服务不受影响但**严格日上限不保**，需把 `POLISH_QUOTA_FILE` 指到可写且持久的目录。

测试：`.tooling/proxy_quota_test.py`（假上游，覆盖到额停调 / 20 线程抢 5 名额 / 落盘 / 跨日重置 / 急停 / 默认值 250），
`.tooling/proxy_real_smoke.py`（真实 Qwen 上游，限额 2 跑 3 次，第 3 次必须停）。

## 本地跑

```bash
MODELSCOPE_API_KEY=xxx python proxy/app.py       # 默认 :7860，默认 250 次/日
curl -s localhost:7860/health                  # 看 quota.remaining
curl -s -X POST localhost:7860/api/polish -H 'Content-Type: application/json' \
  -d '{"persona":"柳三娘","state":{"mood":"警惕"},"action":"ASK","baseText":"客官，这盏灯只够点五回。"}'
```

## 部署到魔搭创空间（Docker，免费 CPU）

1. 建一个 **Docker** 类型创空间，`resource_configuration=platform/2v-cpu-8g-mem`，`port=7860`。
2. 把本目录 `app.py` + `Dockerfile` 推送上去（可用 `.tooling/ms_studio_deploy.py` 的同类流程）。
3. 创空间 → 设置 → **环境变量（secret）** 加 `MODELSCOPE_API_KEY`（勾「大模型推理」的令牌）。
   可选 `ALLOW_ORIGINS=https://hutuboy-sandeng-wuxiang.ms.show`（收紧 CORS）；
   可选 `POLISH_DAILY_LIMIT`（不设即 250，设 0 为急停）。改 secret 后需重新部署才生效。
4. 部署后拿到地址形如 `https://<owner>-sandeng-proxy.ms.show`。
5. 回到游戏仓库，把 `js/llm-config.js` 的 `endpoint` 填成
   `https://<owner>-sandeng-proxy.ms.show/api/polish`，再重新部署游戏。

## 安全要点

- Key 只在创空间 secret 与容器内进程环境里，**绝不进前端、绝不进镜像、绝不入库**。
- `api-inference.modelscope.cn` 是国内直连，无需代理。
- 路由只暴露 `GET /health` 与 `POST /api/polish`，无其他能力。
