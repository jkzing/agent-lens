# agent-lens

TS-native AI Agent 调试 / 可观测工具（本地零配置）。

## Monorepo 结构

- `packages/server`：Hono OTEL 接收端 + SQLite 存储 + 静态服务 UI
- `packages/ui`：React + Rsbuild 前端
- `packages/cli`：`agent-lens` 命令入口

## 快速开始

### 方式 A：本地开发

```bash
cd ~/w/gh/jkzing/agent-lens
pnpm install
pnpm --filter @agent-lens/cli dev --port 4318
```

### 方式 B：零配置（发布后）

```bash
npx agent-lens --port 4318
```

命令行为：

1. 自动 build UI（`packages/ui/dist`）
2. build server
3. 启动 server 并静态托管 UI
4. 默认自动打开浏览器（可用 `--no-open` 关闭）

## CLI 参数

- `--port <number>`：指定 server 端口（默认 `4318`）
- `--no-open`：启动后不自动打开浏览器

## API

- `POST /v1/traces` 接收 OTEL payload（JSON / protobuf）
- `GET /api/traces` trace 聚合列表
- `GET /api/traces/:traceId` trace 详情 spans
- `GET /api/spans` spans 列表

## OpenClaw 集成

在 OpenClaw 配置中设置：

```json
{
  "diagnostics": {
    "otel": {
      "endpoint": "http://localhost:4318/v1/traces"
    }
  }
}
```

然后重启 OpenClaw，使 OTEL trace 导入 agent-lens。

## Demo

- UI 截图：`docs/demo.png`
