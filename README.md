# 会读心的便签墙

一个 AI Native 小项目：用户把想法贴到墙上，便签会持久保存；每次新增便签时，后端会结合整面墙的历史内容调用一次 LLM，生成一段像“墙在读心”的反馈。

我没有直接丢 prompt 让 AI 开干，而是先把模糊需求整理成 [SPEC.md](./SPEC.md)：明确输入输出、边界条件、人工确认点和完成标准，再拆成可验证的小任务逐步实现。

## 1. 启动方式

环境要求：

- Node.js 18+
- npm
- 一个 OpenAI 兼容接口的 API Key

安装依赖：

```bash
npm install
```

配置环境变量：

```bash
copy .env.example .env
```

然后编辑 `.env`：

```bash
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=https://api.minimax.io/v1
OPENAI_MODEL=MiniMax-M2.7
PORT=3001
```

开发模式启动：

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:5173
```

生产构建：

```bash
npm run build
npm start
```

生产模式下打开：

```text
http://localhost:3001
```

数据保存在 `data/notes.json`，刷新页面或重启服务不会丢失。

说明：本项目的 AI 回响必须使用 LLM。没有配置 `OPENAI_API_KEY` 时，页面可以打开和查看已有数据，但新增便签、AI 回响、墙面总结、关联分析和下一句建议会提示需要配置 API。

## 2. 设计思路

我把“会读心”理解成一种轻量、可感知上下文的互动，而不是严肃的心理分析工具。用户写下新便签后，系统不只是回复当前这一句，而是把最近的便签作为一面墙的“记忆”，让 LLM 生成三段内容：

- `mood`：概括当前墙面的气质或主题。
- `thought`：对最新便签和历史便签之间关系的有趣解读。
- `prompt`：引导用户继续写下一张便签。

交互上保留便签墙的直接感：便签随机出现在墙面不同位置，颜色和角度略有变化；用户可以删除不想保留的便签，也可以手动重新生成反馈。

为了避免停留在一次性 demo，我把功能补成了一个更完整的便签工作流：

- 新增便签时可以选择心情标签。
- 便签支持搜索、按心情筛选、置顶、编辑和删除。
- 清空所有便签需要二次确认。
- 便签墙是一个大画布视口，支持缩放，缩放比例会保存到后端。
- 缩小画布时能看到更大范围；便签仍按墙面空间分散排布，避免集中挤在一起。
- 便签很多且缩放较小时，会进入热门精选展示，优先保留置顶、近期和内容更完整的便签。
- 最近一次 AI 反馈会跟随本地数据保存。
- LLM 是核心流程的必要依赖；未配置或调用失败时，接口会明确返回错误，不保存伪 AI 结果，也不用本地规则冒充 AI。
- 额外 LLM 能力：墙面总结、便签关联分析、下一句建议。

后端架构拆分：

- `server/index.js`：应用入口，只负责装配 Express、API 路由和静态资源。
- `server/config.js`：端口、数据文件路径和 LLM 配置。
- `server/store.js`：本地 JSON 数据读写、默认结构和兼容旧数据。
- `server/routes/api.js`：HTTP API 层。
- `server/services/noteService.js`：便签创建、编辑、置顶、删除、清空。
- `server/services/insightService.js`：LLM 调用、回响、墙面总结、关联分析和下一句建议。
- `server/services/boardService.js`：便签墙画布状态，例如缩放比例、画布尺寸和精选展示阈值。

技术取舍：

- 前端：Vite + React，适合快速实现可交互界面。
- 后端：Express，接口简单直接。
- 持久化：JSON 文件。这个任务的数据量小，用文件存储比引入数据库更轻，便于本地跑和代码审阅。
- LLM：使用 OpenAI-compatible `chat/completions` 接口，方便替换模型或代理服务。
- 兜底：LLM 未配置时页面仍可打开，但新增便签和 AI 功能明确提示需要 API Key，避免把本地规则包装成 LLM。

## 3. AI 协作记录

这次我把 AI Coding 当作一个工程流程，而不是单次 prompt 生成代码。

第一步是先写 spec。我不会直接丢 prompt 让 AI 开干，而是先定义需求、约束和完成标准：输入是什么、输出是什么、哪些操作需要人工确认、哪些内容必须验证。

第二步是拆成长任务。我把任务拆成可验证的小步骤：先能读取和保存便签，再能结构化触发 AI 反馈，再接入前端交互，最后补异常处理、状态保存和交互体验。

第三步是防止停留在 demo。我不会只看它能不能跑一次，而会验证关键链路：数据刷新后是否保留、LLM 失败时是否有 fallback、前后端联调是否稳定、生产构建是否能启动。

最后沉淀的不是某个 prompt，而是一套流程：`spec → task decomposition → tool use → verification → iteration`。这样换到别的业务场景，也能复用这套方式。

对我来说，AI Coding 的价值不是少写几行代码，而是提升需求拆解、快速验证和工程交付效率。AI 负责实现和探索，我负责判断方向、约束风险和验收结果。

## 接口概览

- `GET /api/notes`：读取所有便签和最近一次反馈。
- `POST /api/notes`：新增便签，并触发一次 LLM 反馈。
- `PATCH /api/notes/:id`：编辑便签内容、心情或置顶状态。
- `DELETE /api/notes/:id`：删除便签。
- `DELETE /api/notes`：清空所有便签。
- `POST /api/insight`：基于当前墙面重新生成反馈。
- `GET /api/board`：读取便签墙画布状态。
- `PATCH /api/board`：保存便签墙画布状态。
- `POST /api/llm/summary`：LLM 总结整面墙。
- `POST /api/llm/connections`：LLM 找出便签之间的关联。
- `POST /api/llm/next-prompts`：LLM 生成下一张便签提示。

## 当前完成度

- 功能主链路：已完成。
- 后端持久化：已完成。
- LLM 接入和 fallback：已完成。
- 大画布缩放和热门精选：已完成。
- 文档和本地验证：已完成。
- 需要提交前人工确认：配置真实 `OPENAI_API_KEY` 后新增一张便签，并测试墙面总结/关联/下一句建议。
