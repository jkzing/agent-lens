# AGENTS.md — agent-lens 协作规范

本文件定义 agent-lens 仓库内的默认开发与提交流程。

## 目标

- 保持改动可审阅、可回滚、可追踪
- 所有代码改动通过 PR 进入主分支
- 由 Kai 进行最终 review 与合并决策

---

## Git 提交流程（默认强制）

### 1) 禁止直接推送 `main`

除非 Kai 明确临时授权，默认不允许直接 `push origin main`。

### 2) 分支开发

每次任务都创建分支，例如：

- `feat/<topic>`
- `fix/<topic>`
- `chore/<topic>`
- `refactor/<topic>`

示例：`fix/waterfall-tree-connectors`

### 3) 本地自检

提交前至少执行：

```bash
pnpm typecheck
```

若涉及发布/打包链路，额外执行：

```bash
cd packages/cli && npm pack --dry-run
cd ../server && npm pack --dry-run
```

### 4) 提交规范

- commit message 使用 Conventional Commits（`feat:`, `fix:`, `refactor:` ...）
- commit author 按执行者区分：
  - **Lumi 提交**：`user.name = Lumi`，`user.email = zjk.agent@fastmail.com`
  - **Nyx 提交**：`user.name = Nyx`，`user.email = zjk.agent@fastmail.com`
- 若通过子代理（Nyx）执行提交，需在任务中显式要求 Nyx 使用自己的 `user.name`

### 5) PR 提交与 review

- 推送功能分支后创建 PR 到 `main`
- PR 描述应包含：
  - 背景/目标
  - 关键改动
  - 验证方式与结果
  - 风险与回滚点
- 指定 Kai review，等待 review 通过后再合并

---

## 默认执行策略

- 小改动也走 PR（不走直推）
- 紧急修复可先开最小 PR，后续补充清理 PR
- 未经 Kai 确认，不执行破坏性历史改写（如强推）

---

## 一句话原则

**agent-lens 后续所有代码修改：分支开发 → PR 提交 → Kai review → 合并。**
