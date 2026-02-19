# AGENTS.md — agent-lens Collaboration Rules

This file defines the default development and submission workflow for the `agent-lens` repository.

## Goals

- Keep changes reviewable, reversible, and traceable
- Route all code changes through Pull Requests
- Let Kai make final review and merge decisions

---

## Git Workflow (Default Policy)

### 1) Do not push directly to `main`

Unless Kai explicitly grants a temporary exception, do **not** run `push origin main` directly.

### 2) Work on branches

Create a branch for every task, for example:

- `feat/<topic>`
- `fix/<topic>`
- `chore/<topic>`
- `refactor/<topic>`

Example: `fix/waterfall-tree-connectors`

### 3) Local validation before commit

Run at least:

```bash
pnpm typecheck
```

If the change touches publish/packaging flow, also run:

```bash
cd packages/server && pnpm pack && rm -f *.tgz
cd ../ui && pnpm pack && rm -f *.tgz
cd ../cli && pnpm pack && rm -f *.tgz
```

### 4) Commit conventions

- Use Conventional Commits (`feat:`, `fix:`, `refactor:`, ...)
- Use English as the primary language for commit messages
- Use actor-specific git identity:
  - **Lumi commits**: `user.name = Lumi`, `user.email = zjk.agent@fastmail.com`
  - **Nyx commits**: `user.name = Nyx`, `user.email = zjk.agent@fastmail.com`
- When delegating to Nyx, explicitly require Nyx identity in the task instructions

### 5) Pull Request flow

- Push the branch, then open a PR to `main`
- Use English as the primary language for PR title/body
- PR description should include:
  - Context / goal
  - Key changes
  - Validation steps and results
  - Risks and rollback notes
- Request Kai review and wait for approval before merge

---

## Execution defaults

- Even small changes should go through PR
- For urgent fixes, open a minimal PR first, then follow up with cleanup PRs
- Do not rewrite shared history (e.g., force push) unless Kai explicitly approves

---

## One-line principle

**All agent-lens code changes: branch → PR → Kai review → merge.**
