# 三更灯 · 无相客栈（ModelScope 线上增强版）

本目录是部署到 `hutuboy/sandeng-wuxiang` 的 **Docker 创空间源**：纯标准库后端托管本地可玩的静态游戏，并为线上版本注入免注册云档 / 排行榜开关。

> 原则：**本地离线可玩、线上可选增强**。双击 `studio-edition/index.html` 仍是完整离线游戏；云按钮只在后端注入开关后显示，未点击不发云请求。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.html` / `assets/style.css` / `js/*.js` | 本地可玩的静态游戏 |
| `js/ms-cloud.js` | 线上云档 / 排行榜前端；仅在注入开关时工作 |
| `app.py` | 静态托管 + 注入开关 + `/api/cloud/*` |
| `Dockerfile` | 监听 `0.0.0.0:7860` 的创空间容器 |

## 云能力

- 匿名身份：后端签发 HttpOnly Cookie `sd_uid`，一年有效；用户名由 uid 经 FNV-1a 稳定派生，前端不传名字。
- 云存档：按 uid 隔离，状态存 `/mnt/workspace/sandeng-cloud/cloud.json`，原子写入 + 线程锁。
- 排行榜：只保留每名玩家最高总分，公开只读、服务端校验数值范围；Cookie 即身份，不做账号体系。
- 本地 `file://`：不注入开关，云元素隐藏，零云请求；断网照常推理通关。

## 部署

推送到魔搭后必须再调用 `POST /openapi/v1/studios/hutuboy/sandeng-wuxiang/deploy`，并轮询到 Running。仓库内 `.gitattributes` 固定 LF，避免 Windows CRLF 造成线上 SHA 漂移。
