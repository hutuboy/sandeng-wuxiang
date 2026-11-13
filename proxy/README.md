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

## 本地跑

```bash
MODELSCOPE_API_KEY=xxx python proxy/app.py       # 默认 :7860
curl -s localhost:7860/health
curl -s -X POST localhost:7860/api/polish -H 'Content-Type: application/json' \
  -d '{"persona":"柳三娘","state":{"mood":"警惕"},"action":"ASK","baseText":"客官，这盏灯只够点五回。"}'
```

## 部署到魔搭创空间（Docker，免费 CPU）

1. 建一个 **Docker** 类型创空间，`resource_configuration=platform/2v-cpu-8g-mem`，`port=7860`。
2. 把本目录 `app.py` + `Dockerfile` 推送上去（可用 `.tooling/ms_studio_deploy.py` 的同类流程）。
3. 创空间 → 设置 → **环境变量（secret）** 加 `MODELSCOPE_API_KEY`（勾「大模型推理」的令牌）。
   可选 `ALLOW_ORIGINS=https://hutuboy-sandeng-wuxiang.ms.show`（收紧 CORS）。
4. 部署后拿到地址形如 `https://<owner>-sandeng-proxy.ms.show`。
5. 回到游戏仓库，把 `js/llm-config.js` 的 `endpoint` 填成
   `https://<owner>-sandeng-proxy.ms.show/api/polish`，再重新部署游戏。

## 安全要点

- Key 只在创空间 secret 与容器内进程环境里，**绝不进前端、绝不进镜像、绝不入库**。
- `api-inference.modelscope.cn` 是国内直连，无需代理。
- 路由只暴露 `GET /health` 与 `POST /api/polish`，无其他能力。
