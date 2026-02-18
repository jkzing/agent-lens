# agent-lens TODO

## Roadmap

### M1 · UI 核心体验打磨（当前迭代）
### M2 · Agent 上下文关联
### M3 · 分析能力增强
### M4 · 实时 + 数据源

---

## M1 当前 TODO

### 0. Design System 基础（先做，其余依赖它）

- [ ] **引入 shadcn/ui**
  - 安装 shadcn CLI，初始化配置（Tailwind v4 模式）
  - 安装基础组件：Button, Badge, ScrollArea, Tooltip, Separator, Tabs
  - 在 `packages/ui/src/components/ui/` 存放生成的组件
  - 定义 CSS 变量 token（对齐设计系统色板，见下）

- [ ] **色彩 token 规范（在 Tailwind CSS 里定义）**
  - Background: `--color-bg` = slate-950
  - Surface: `--color-surface` = slate-900
  - Border: `--color-border` = slate-800
  - Text primary / muted: slate-100 / slate-400
  - Accent: indigo-500（选中、CTA）
  - Span 语义色：violet(LLM) / cyan(Tool) / slate(Internal)
  - 状态色：red(Error) / amber(Warning) / emerald(Success) / sky(Info)

### 1. Waterfall 时间轴重写

当前问题：每个 span 只是一个横向色块，没有真正 Gantt 结构，父子关系靠 paddingLeft 模拟

目标：
- [ ] 真正的 Gantt 图：span 条宽度 = 实际时长占比，位置 = 相对 trace 开始时间
- [ ] 层级线（连接父子 span 的竖线/折线）
- [ ] Span 条 hover 时显示 Tooltip（name / duration / type）
- [ ] 选中 span 后右侧 Detail 面板滚动到对应条目（双向联动）
- [ ] 时间刻度尺（顶部显示 0ms / 100ms / 500ms 等）
- [ ] 用 shadcn ScrollArea 替换原生滚动

### 2. Span Events 展示

当前问题：DB 里有 `events` 字段，UI 完全未渲染

- [ ] 在 Span Detail 面板新增 Events 折叠块（shadcn Accordion 或原生 `<details>`）
- [ ] 解析 events JSON，展示：timestamp offset、name、attributes
- [ ] 特殊标记：LLM streaming events（如 `gen_ai.content.prompt` / `gen_ai.content.completion`）

### 3. 搜索 & 过滤

- [ ] Trace 列表顶部加搜索框（按 root span name 过滤）
- [ ] Span 列表内搜索（按 span name 过滤，高亮匹配项）
- [ ] 使用 shadcn Input 组件

### 4. API_BASE 去硬编码

- [ ] 改为相对路径（`/api/...`），开发时通过 rsbuild proxy 转发到 server
- [ ] `rsbuild.config.ts` 加 proxy 配置：`/api` → `http://localhost:4318`，`/v1` → 同
- [ ] 删掉 `API_BASE` 常量和 `VITE_API_BASE` 环境变量

---

## M2 · Agent 上下文关联（下一迭代）

- [ ] 关联消息/会话上下文（哪条消息触发了该 trace）
- [ ] 多模型成本分项（不同 provider 不同价格，目前硬编码 Sonnet 价格）
- [ ] Trace 导出（JSON / CSV）

## M3 · 分析能力增强

- [ ] Loop 检测算法改进（现在只是 ≥3 次计数，太简单）
- [ ] Error 聚合视图（哪些 span 出错、错误率趋势）
- [ ] Trace 保留策略 + 手动清理

## M4 · 实时 + 数据源

- [ ] SSE 推送替代 5s 定时轮询
- [ ] 对接 `/tmp/openclaw-cachetrace.jsonl`（openclaw bug #18794 修好前的替代方案）
