# Contributing to Forge

Thanks for your interest in contributing! Forge aims to be a genuinely production-grade foundation, so the bar
for changes is real tests and honest claims.

## Development setup

Requires **Node ≥ 22**, **pnpm**, and **Docker**.

```bash
pnpm install
docker compose up -d postgres     # Postgres 17 + pgvector on port 5434
cp .env.example .env
```

## The checks

Every change must keep these green:

```bash
pnpm build          # all packages compile
pnpm typecheck      # strict TypeScript, no `any` escape hatches in the core
pnpm test           # unit tests (no services required)
pnpm test:arch      # the architecture-boundary + kernel-purity rules
```

Changes that touch the database or isolation must also pass the service-backed suites:

```bash
pnpm --filter @forge/db test:isolation    # tenant-isolation proof suite
pnpm --filter @forge/rag test:eval        # RAG retrieval + isolation
```

## Guidelines

- **Respect the layers.** The architecture test enforces the package dependency rule and domain purity — if it
  fails, the dependency is in the wrong place, not the test.
- **Tenant isolation is sacred.** Any change to the data layer must keep the isolation proof suite green. New
  tenant-owned tables need RLS and an `org_id` scope.
- **Generated code is never hand-edited.** Customize a feature in its `*.custom.ts` file; `check-drift` enforces
  this.
- **Claims are calibrated to tests.** Don't add a capability claim to docs without a test that proves it.
- **Small, focused PRs** with a clear description and passing checks are easiest to review.

## Commit / PR

Fork, branch from `develop`, open a PR against `develop`. Describe what changed and how it's tested. CI runs the
full suite; please make sure it's green.
