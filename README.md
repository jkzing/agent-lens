# agent-lens

TS-native AI Agent 调试 / 可观测工具（本地零配置，目标：`pnpm dlx agent-lens` / `npx agent-lens`）。

## Monorepo 结构

- `packages/server`：Hono OTEL 接收端 + SQLite 存储
- `packages/ui`：React + Rsbuild 前端
- `packages/cli`：`agent-lens` 命令入口（同时拉起 server + ui）

## 快速开始（pnpm）

```bash
cd ~/w/gh/jkzing/agent-lens
pnpm install
pnpm dev
```

默认端口：

- Server: `http://localhost:4318`
- UI: `http://localhost:5173`

## 当前 MVP 能力

- `POST /v1/traces` 接收 OTEL payload
- 结构化提取 span 字段：
  - `traceId`
  - `spanId`
  - `parentSpanId`
  - `name`
  - `kind`
  - `startTimeUnixNano`
  - `endTimeUnixNano`
  - `durationNs`
- SQLite 入库（`packages/server/data/agent-lens.db`）
- `GET /api/spans?limit=100` 查询最新 spans
- UI 展示 spans 列表（与 server 联调）

## 说明

- 目前解析优先支持 OTLP JSON 的 `resourceSpans[].scopeSpans[].spans[]`
- 若 payload 不含可解析 spans，仍会保留原始 payload 记录（结构化字段为空）
