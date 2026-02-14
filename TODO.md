# agent-lens MVP TODO

> 项目定位：TS-native AI Agent 调试/可观测工具，零配置本地运行 (`npx agent-lens`)
> 技术栈：Hono + better-sqlite3 + React + Rsbuild
> 验证场景：OpenClaw OTEL traces

## 当前进度

- [x] 项目骨架（monorepo: server / ui / cli）
- [x] pnpm workspace
- [x] Server: 接收 OTEL spans (`POST /v1/traces`)，存入 SQLite
- [x] Server: 查询接口 (`GET /api/spans`)
- [x] UI: 基础 spans 列表展示
- [x] CLI: `agent-lens` 入口，同时启动 server + ui
- [x] Git 初始化

---

## Phase 1: Server 完善

### 1.1 Trace 聚合查询
- [x] `GET /api/traces` — 按 traceId 聚合，返回 trace 列表（每个 trace 包含 span 数量、总耗时、根 span 名称、时间戳）
- [x] `GET /api/traces/:traceId` — 返回单个 trace 的所有 spans（按时间排序，保留父子关系）
- [x] 支持分页参数（`offset` / `limit`）

### 1.2 数据模型优化
- [x] spans 表添加 `attributes` 列（TEXT/JSON），存储 OTEL span attributes
- [x] spans 表添加 `status_code` 列（记录 OK/ERROR）
- [x] spans 表添加 `resource_attributes` 列（service.name 等资源信息）
- [x] 考虑添加 `events` 列（OTEL span events，包含 exceptions 等）

### 1.3 OTEL 协议兼容
- [x] 支持 protobuf 格式（`Content-Type: application/x-protobuf`），不仅是 JSON
- [x] 正确响应 OTEL Exporter 的 partial success

---

## Phase 2: UI — Trace Timeline 视图

### 2.1 Trace 列表页
- [x] 左侧 trace 列表，显示：根 span 名称、span 数量、总耗时、时间戳
- [x] 点击进入 trace 详情
- [x] 自动刷新 / 手动刷新
- [x] 简单的时间范围筛选

### 2.2 Trace 详情页 — Timeline
- [x] 瀑布图（waterfall）：横轴为时间，每个 span 一行
- [x] 展示父子层级关系（缩进或嵌套）
- [x] 颜色区分 span 类型（LLM call / tool call / internal）
- [x] 点击 span 展开详情侧面板

### 2.3 Span 详情面板
- [x] 显示 span 完整信息：name, traceId, spanId, duration, attributes
- [x] Tool call 的输入/输出展开折叠
- [x] LLM call 的 token 用量（从 attributes 中提取 `gen_ai.usage.*`）
- [x] 错误状态高亮

---

## Phase 3: Agent 可观测特性

### 3.1 Token 用量统计
- [x] 从 span attributes 提取 `gen_ai.usage.input_tokens`、`gen_ai.usage.output_tokens`
- [x] 每个 trace 的总 token 用量汇总
- [x] UI 上显示 token 数和估算成本

### 3.2 循环检测
- [x] 检测同一 trace 中重复的 tool call 模式
- [x] UI 上标记可能的循环（warning badge）

### 3.3 多 Agent 视图
- [x] 从 resource attributes 中提取 `service.name` 区分不同 agent
- [x] UI 上按 agent 筛选/分组

---

## Phase 4: CLI & 发布

### 4.1 CLI 完善
- [ ] `agent-lens` 命令启动时先 build UI（或使用预构建产物），再启动 server 静态服务 UI
- [ ] 支持 `--port` 参数
- [ ] 启动后自动打开浏览器
- [ ] 优雅关闭（cleanup SQLite connection）

### 4.2 `npx agent-lens` 零配置体验
- [ ] 确保 `npx agent-lens` 直接可用（package.json bin 配置）
- [ ] README 写清楚快速开始步骤

### 4.3 OpenClaw 集成验证
- [ ] 配置 OpenClaw `diagnostics.otel.endpoint` 指向 agent-lens
- [ ] 验证 traces 正确接收和展示
- [ ] 截图/录屏作为 README demo

---

## 开发规范

- 每次代码修改后 `git add -A && git commit`，写清楚 commit message
- 项目路径：`~/w/gh/jkzing/agent-lens`
- 开发命令：`pnpm dev`（同时启动 server + ui）
