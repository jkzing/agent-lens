# Release Checklist (agent-lens)

This document defines the recommended release process for the `agent-lens` monorepo.

> Package publish order matters:
> 1) `@agent-lens/server`
> 2) `@agent-lens/ui`
> 3) `@agent-lens/cli`

---

## 0) Preconditions

- Clean working tree (`git status` has no unstaged/uncommitted changes)
- On latest `main`
- PRs merged and CI green
- Correct git identity configured

```bash
git status
git switch main
git pull --ff-only origin main
```

---

## 1) Version bump

Bump versions in all publishable packages together:

- `packages/server/package.json`
- `packages/ui/package.json`
- `packages/cli/package.json`

Keep them aligned (example: all `0.2.0`).

---

## 2) Build and type checks

```bash
pnpm typecheck
pnpm -r build
```

---

## 3) Package dry-run check

Use **pnpm pack** for monorepo publishables.

Why: `@agent-lens/cli` depends on workspace packages; `pnpm pack` rewrites workspace deps to real versions in tarball metadata.

```bash
cd packages/server && pnpm pack && rm -f *.tgz
cd ../ui && pnpm pack && rm -f *.tgz
cd ../cli && pnpm pack && rm -f *.tgz
```

Optional: inspect packed manifest for CLI dependency resolution:

```bash
cd packages/cli
pnpm pack
TARBALL=$(ls -t agent-lens-cli-*.tgz | head -1)
tar -xOf "$TARBALL" package/package.json
rm -f "$TARBALL"
```

Expected in packed CLI `package.json`:

- `"@agent-lens/server": "<version>"`
- `"@agent-lens/ui": "<version>"`

(not `workspace:*`)

---

## 4) Publish to npm

> Make sure you are logged in (`npm whoami`) and have rights for all package names.

```bash
cd packages/server && pnpm publish --access public
cd ../ui && pnpm publish --access public
cd ../cli && pnpm publish --access public
```

### GitHub Actions (recommended)

Use the workflow: `.github/workflows/release.yml`

- Trigger: **Actions → Release → Run workflow**
- Inputs:
  - `dry_run` (default `true`)
  - `npm_tag` (default `latest`)
  - `create_git_tag` (default `true`)

Trusted Publishing setup (npm):

- Configure **Trusted Publisher** in npm for each package:
  - `@agent-lens/server`
  - `@agent-lens/ui`
  - `@agent-lens/cli`
- Use this GitHub repository + workflow as trusted source
- No `NPM_TOKEN` secret is required in this model

The workflow uses GitHub OIDC and runs:

1. `pnpm release:check`
2. pack artifacts with `pnpm pack`
3. publish in order via `npm publish --provenance`:
   - `@agent-lens/server` → `@agent-lens/ui` → `@agent-lens/cli`
4. optional git tag creation: `vX.Y.Z`

---

## 5) Post-publish verification

- `npx @agent-lens/cli --port 4318` starts successfully
- UI loads and can receive traces
- Install checks:

```bash
npm view @agent-lens/server version
npm view @agent-lens/ui version
npm view @agent-lens/cli version
```

---

## 6) Tag and changelog

After successful publish:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Then create/update release notes on GitHub.

---

## Quick rollback notes

If CLI release is broken but server/ui are fine:

- Publish a patch release for CLI only (`X.Y.(Z+1)`)
- Keep server/ui unchanged unless incompatibility requires coordinated patch
