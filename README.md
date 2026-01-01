# emotion-bot

一个基于 Node.js + Express 的本地聊天机器人：支持多人设、每人设独立记忆、系统提示词，并通过 SiliconFlow 的 OpenAI 兼容接口完成对话。自带静态网页 UI。

## 功能特性

- 多人设管理：创建、删除、排序
- 每人设独立 `persona.md` 与 `memory.json`
- 系统提示词 `data/prompts/prompt.md`
- Web UI：编辑人设、记忆、配置
- 通过 SiliconFlow Chat Completions 接口生成回复

## 快速开始

1. `npm install`
2. `cp .env.example .env` 并填写 `SILICONFLOW_API_KEY`
3. `npm start` (开发模式：`npm run dev`)
4. 打开 `http://localhost:3000`

## 环境变量

- `SILICONFLOW_API_KEY` 必填
- `SILICONFLOW_API_BASE` 可选，默认 `https://api.siliconflow.cn/v1`
- `SILICONFLOW_MODEL` 可选
- `SILICONFLOW_MAX_TOKENS` 可选
- `SILICONFLOW_TEMPERATURE` 可选
- `SILICONFLOW_TOP_P` 可选
- `PORT` 服务端口

## 运行时配置 (`data/config.json`)

这些配置可以通过 UI 或 `/api/config` 修改，启动时会自动创建。

- `memoryTurns` 保留对话轮数
- `temperature` 采样温度
- `topP` nucleus 采样
- `sendDelayMs` 用户消息发送延迟
- `maxTokens` 生成上限
- `assistantSegmentDelayMs` 流式分段间隔
- `fontFamily` UI 字体方案：`system` `pingfang` `yahei` `noto` `song` `kaiti` `fangsong` `mono`

## 数据目录

```text
data/
  config.json
  prompts/
    prompt.md
  personas/
    default/
      persona.md
      memory.json
    <personaId>/
      persona.md
      memory.json
    order.json
```

说明：

- `data/config.json` 与 `data/prompts/prompt.md` 缺失时会自动创建
- `personaId` 需匹配 `[A-Za-z0-9_-]{1,32}`
- `order.json` 控制人设展示顺序

## API

- `GET  /api/health`
- `GET  /api/config`
- `PUT  /api/config` `{ memoryTurns, temperature, topP, sendDelayMs, maxTokens, assistantSegmentDelayMs, fontFamily }`
- `GET  /api/personas`
- `POST /api/personas` `{ id, name }`
- `PUT  /api/personas/order` `{ order: ["id1", "id2"] }`
- `DELETE /api/personas/:id`
- `GET  /api/persona?personaId=...`
- `PUT  /api/persona?personaId=...` `{ content }`
- `GET  /api/memory?personaId=...`
- `PUT  /api/memory?personaId=...` (body 是 memory 对象)
- `POST /api/chat` `{ userMessage, personaId }`

## 许可证

MIT
