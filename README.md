---
sdk: static
app_file: index.html
license: mit
---

# 三更灯 · 无相客栈

> 一夜三客，一人为「无相」。灯不认人，只认破绽。

一款 **AI 原生网页推理游戏**。三位客人不是写好的剧本，而是由本地 AI 决策引擎驱动的 NPC：
带量化状态、持久记忆、规则校验，会记住你说过的每句话，会因为你逼得太紧而拂袖离店。

**AI+∞ 开发者创作大赛 · 第三期「AI 造游戏」参赛作品**　|　纯静态 · 离线可玩 · 零外部素材 · MIT 开源

**开源仓库**：https://github.com/hutuboy/sandeng-wuxiang

---

## 直接试玩

**在线试玩（魔搭创空间）**：https://modelscope.cn/studios/hutuboy/sandeng-wuxiang
（Static 类型 · 公开访问 · 免费 CPU；直连应用地址 `https://hutuboy-sandeng-wuxiang.ms.show/`）

本地试玩：双击根目录 `index.html` 即可（无需安装、无需构建、无需联网）。
也可起一个静态服务器：

```bash
python -m http.server 8000
# 打开 http://localhost:8000
```

地址栏参数：

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `seed` | 指定随机种子，复现同一夜 | `?seed=SD-DEMO2026` |
| `night` | 指定夜次（1/2/3） | `?seed=SD-DEMO2026&night=2` |
| `autopilot` | 让「影子掌柜」自动试玩一整夜 | `?autopilot=1` |

---

## 五步一窗：点灯 → 问询 → 推演 → 指认 → 结案

一夜不是一个挤满控件的大屏，而是**一步步走完的五幕**。每幕只开一扇窗，顶上一条步骤条标出走到第几步。

| 幕 | 你要做的事 | 窗里有什么 |
| --- | --- | --- |
| **① 点灯** | 认人、清点物证 | 三位客人到齐，柜上物证的真值先摆出来，几盏灯一清二楚 |
| **② 问询** | 点谁问谁 | 三位客人**自上而下排成三行**，每人一行：**立绘在左、信任/好感/张力/疑心/定力在右**（宽屏五维一行铺开、窄屏两列），点任意一位即换人，没有页签；下面是**精简物证带**（一行一件，点开看全文）压在「灯下对话」之上；选语气、点话头，问一句灭一盏灯 |
| **③ 推演** | 把表摊开 | 「物证 × 客人」的相符 / 不符表，四个逻辑算子实时切换 |
| **④ 指认** | 点头认人 | 三位并列，点谁就点灯。选错，灯灭人走 |
| **⑤ 结案** | 看真相 | 真相摊开 + 复盘卡（漏掉的物证 / 自相矛盾 / 离最高结局差几条证据） |

**逻辑层（`js/logic.js`）** 把「谁的说法与物证不符」写成原子命题，再组合成四种算子：

| 算子 | 含义 | 在局里的作用 |
| --- | --- | --- |
| `∧` **与** | 每条物证都对不上 | **标准解**——无相在每条物证上都错，清白客人至多「记岔一句」 |
| `∨` **或** | 只要一条对不上 | 快速缩小范围，但会把记岔的清白人一起网进来 |
| `¬` **非** | 并非全部对不上 | 反向筛：谁至少有一条咬得住（洗清嫌疑用） |
| `⊕` **异或** | 恰好只有一条对不上 | 专抓「只错一处」的人——通常正是那个记岔了的清白客 |

四个算子都能在推演台上点，切错了会看到「命中 2 人以上」——那不是 bug，是提示。
`selftest` 的 T7 会跨 4 档 × 3 夜 × 60 seed（720 组）断言 `∧` 标准解**恒为唯一**。

---

## 三个 AI，各司其职

### 1. AI NPC 决策引擎（`js/npc.js`）

```
量化状态 (信任/好感/张力/疑心/定力) + 人格权重 + 交互特征
   → 线性效用打分 → softmax(T) 采样
   → 规则层 legal mask 校验动作合法性
   → 组合式语言生成（引用记忆）
   → 实际行为落库，改变游戏状态与后续决策
```

- **可量化角色状态**：五维数值，实时显示在客人卡与决策面板。
- **行为决策可校验**：`trust < 35` 锁定「交心透底 / 交付物件」；`tension < 70` 锁定「离店」；非无相不可「虚与委蛇」；第三夜疑心 ≥ 60 才开放「趁夜遁走」。
- **对话输出与行为执行的闭环**：`GIFT / CONFIDE / LEAVE / FLEE` 会真实新增证词、关闭证据路径或提前结束本夜，不只是输出文字。
- **持久记忆**：每轮交互写入 `memory[]`；同一话题重复提问时触发 `repeated` 特征、引用历史答复、并锁定重复交心。
- **状态变化后的重新决策**：`NPC.reDecide()` 对状态施加扰动后重新计算效用分布与合法动作集，面板可一键查看对比。

### 2. AI 导演（`js/director.js`）

带约束求解的程序化案件生成：随机选客人 / 人格 / 无相 / 物证，构造唯一矛盾；
`solve()` 校验「矛盾唯一 + 行动点充足 + 理想玩家可解」，不满足则重掷（最多 60 次）。
所有案件由 `seed` 决定，可完整复现。难度随夜次递增（红鲱鱼措辞、双物证、遁走分支）。

### 3. 影子掌柜 · 自动试玩 Agent（`js/agent.js`）

只通过结构化接口 `getState() / listActions() / dispatch()` 驱动游戏，与人走同一套规则。
以信息增益选择问话、以信念更新做指认，输出「初始状态 + 随机种子 + 完整动作序列 + 信念轨迹」。
另附跨种子不变量自检与预置缺陷复现：

```bash
node tools/selftest.cjs --seeds 200 --json tools/selftest-report.json
```

200 组种子实测：6/6 项通过，自动试玩通关率 91.7%。

---

## AI 架构：端侧保底，**LLM 可选、默认关**

核心决策与措辞**全部在浏览器端完成**（`js/npc.js` 效用打分 + 规则掩码 + 模板措辞，`js/director.js` 程序化生成案件），
**零网络、断网可玩、可复现**。云端大模型是**可选项，默认关闭**：

| 层 | 位置 | 默认 | 说明 |
| --- | --- | --- | --- |
| L0 决策 | 浏览器本地 | **必选** | 五维状态 × 人格权重 → 效用 → softmax → 规则校验 → 状态回写；**永不上云** |
| L1 措辞 | 浏览器本地 | **必选** | 人格词典 + 状态/记忆模板组合 |
| L2 云端润色 | 自建端点（可选） | **关闭** | 只润色台词表层措辞，**不改决策与存档**；1.5s 超时或任何异常静默回退原文 |
| L3 DGX 本地大模型 | DGX Spark | **未启用** | 算力**已申请、待审批**；若获批仅用于离线演示 / 录屏 / 评审现场，不挂公开链接 |

**怎么开 L2**（公开链接默认不带端点、不带密钥，不注入即完全零网络）：

```js
// 浏览器控制台手动注入即启用；删除即恢复纯端侧
window.SANDENG_LLM = { endpoint: 'https://your-endpoint/polish', key: 'optional', timeout: 1500 };
// 请求体 { persona, state, action, baseText } → 响应 { text }
```

适配器实现见 `js/llm.js`，只在 `js/main.js` 的 `afterDispatch` 单点挂钩，**不触碰 `game.js` 状态机**；
开启与否不影响 `getState()` 与所有自检结果。设计取舍与计费规避见 `docs/AI架构-B方案-端侧+云端兜底-v1.md`。

## 结构化接口（评测 / 二次开发）

浏览器控制台可直接使用 `window.SANDENG_API`：

```js
SANDENG_API.getState()          // sandeng.state.v1 结构化快照
SANDENG_API.listActions()       // 当前合法动作全集
SANDENG_API.dispatch({type:'ASK', guestId:'g0', topic:'hour', tone:'warm'})
SANDENG_API.newRun('MY-SEED', 3)
SANDENG_API.trace('MY-SEED', 2)  // 完整自动试玩轨迹
SANDENG_API.selftest(200)
SANDENG_API.defectDemo('DEFECT_F01')
```

核心逻辑层（`core / director / npc / game / agent`）不依赖 DOM，可在 Node 中直接 `require`。

---

## 目录

```
index.html              游戏入口
assets/style.css        视觉体系（暗色国风 / 响应式）
js/core.js              确定性随机、词库、数学工具
js/logic.js             逻辑层：原子命题 + ∧ ∨ ¬ ⊕ 求值 + 标准解（纯逻辑、Node 可跑）
js/director.js          AI 导演：案件生成 + 可解性求解
js/npc.js               AI NPC 决策引擎 + 规则层 + 语言生成
js/game.js              纯状态机 / 计分 / 快照
js/agent.js             影子掌柜 Agent / 工程自检 / 缺陷复现
js/ui.js                程序化立绘 / Canvas 夜景 / WebAudio / DOM 渲染
js/main.js              流程编排 / 存档 / 弹窗 / 对外 API
js/guide.js             新用户六步引导（G1–G6）
js/difficulty.js        四档难度配置与派生（唯一数值来源）
js/llm.js               L2 云端润色可选适配器（默认关、零网络）
docs/                   创作手记、报名帖、部署指南、交付清单、截图、演示视频
tools/                  自检 CLI、浏览器冒烟测试、录屏脚本及运行记录
```

## 工程自检

```bash
node tools/selftest.cjs --seeds 200 --demo --json tools/selftest-report.json
node tools/browser-smoke.cjs          # 需要 .tooling/playwright-core + 本机 Edge
node tools/guide-smoke.cjs            # 新用户引导 60 项门禁（含几何断洞）
QA_DIFFICULTY_RUN=1 node tools/difficulty-smoke.cjs   # 四档难度 44 项
node tools/clue-toggle-probe.cjs      # 物证条展开态：问话重绘后不丢、换局复位
node tools/g5-geom.cjs                # 引导 G5 气泡与两处高亮洞的重叠面积应为 0
node tools/make-demo.cjs              # 重新录制演示视频（需要 ffmpeg）
```

## 素材与许可

所有立绘、背景、纹理、音效均由 SVG / Canvas / WebAudio **程序化生成**，
字体使用系统字体栈，未引入任何第三方图片、音频、字体、模型权重或 CDN 依赖。
代码以 **MIT** 许可开源，详见 [LICENSE](LICENSE)。

## 部署到魔搭创空间

见 [docs/部署到魔搭创空间.md](docs/部署到魔搭创空间.md)。要点：选择 **Static** SDK，
`index.html` 必须位于仓库根目录，本仓库已满足。
