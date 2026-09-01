# Architecture

Forge is a pnpm + Turborepo monorepo. The core ships as installable packages consumed by a starter app and
driven by a CLI. This document describes the design; capability claims are calibrated to what the test suite
proves.

## 1. Topology

```
forge/
  packages/
    kernel          domain primitives: Result, branded ids, the tenant discriminator
    config          Zod environment schema, validated once at boot, fail-fast
    policy          the authorization kernel (pure decide(), grants-as-data)
    db              Drizzle client, tenant-scoped repository factory, wired RLS, migrations
    tenancy         org lifecycle + membership → actor derivation
    auth            provider-agnostic session port + actor resolver
    billing         plan → feature entitlements + subscription-status rules
    ai              uniform Claude client (mock/CLI), LLM steps, embedder, tool-agent
    rag             tenant-isolated retrieval on pgvector
    ui              accessible, theme-aware design system
    codegen         feature-spec IR + deterministic generator
    example-feature a generated feature, proving generated code compiles + tests
  apps/
    starter         a Next.js app consuming the core packages
  tooling/
    forge-cli       forge add-feature / forge check-drift
```

The core ships as **packages**, not a template: a consuming app depends on `@forge/policy`, `@forge/db`, etc.
at a version, so a core fix is a version bump rather than a manual re-merge. Turborepo caches builds and tests
across the graph.

**Boundary discipline is compiler-enforced.** `architecture.test.ts` walks each package's imports and fails the
build on any dependency outside a declared allow-list (the allow-list is a data table). It also asserts kernel
purity — no non-relative imports, no `Date.now`/`Math.random`/`fetch` in the domain primitives.

## 2. The hexagonal seam

Every core package mirrors a four-layer split:

- **domain** — pure types and total functions, zero I/O, zero dependencies.
- **application** — use cases that depend on the domain and on *ports* (interfaces), never on concrete
  infrastructure; dependencies are passed as arguments so they are tested with fakes.
- **infrastructure** — adapters that implement the ports (Drizzle repositories, the Claude backends, storage).
- **interface** — delivery: server actions / route handlers, or CLI entry points.

A request resolves an `Actor`, checks the policy, calls an application use case, and persists through an
injected infrastructure port. The UI's permission checks are *derived from* the same `decide()` function, so
there is never a second source of authorization truth.

## 3. Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` |
| Runtime | Node ≥ 22 |
| Monorepo | pnpm + Turborepo |
| Web / UI | Next.js 15 (App Router) / React 19 / Tailwind v4 |
| ORM / DB | Drizzle + Postgres 17 + pgvector |
| Auth | provider-agnostic session port (Better-Auth as the default base, wired in the app) |
| Queue (planned) | pg-boss (Postgres-backed, zero extra infra) |
| AI | uniform Claude client — mock (CI) / `claude` CLI (keyless dev) / SDK (prod) |
| Tests | Vitest (unit) + Playwright + axe (e2e/a11y) |

## 4. The tenant model

**The organization is the isolation boundary.** `org_id` is the tenant discriminator threaded through every
tenant-owned table, the repository access scope, and the RLS policies. Teams/projects are intra-org RBAC
scopes, not isolation boundaries.

- The `Actor` carries the user id, the active `org_id`, and the org role. A request is always in the context
  of exactly one active org.
- Cross-tenant roles are explicit, never implicit: a support/operator path is greppable and audited; background
  jobs carry an explicit `org_id` so a job can never run tenant-unscoped.
- Lifecycle: an org is `created → active → suspended → deleting` (suspended = data inaccessible but retained).
- Onboarding creates the first user's org + owner membership **atomically**, so a user is never orphaned.

## 5. Tenant-isolation enforcement — three layers + a calibrated proof

**Layer 1 — application.** Repositories cannot be constructed without a tenant-scoped `Actor`; every read is
AND-ed with the actor's org, and `list()` takes a *filter*, never a full predicate. The only bypass is a
greppable `systemRepositories()` that the architecture test fails the build on if used outside the CLI.

**Layer 2 — database.** Postgres RLS on every tenant table, **including the embeddings table**. The app
connects as a non-owner role with no `BYPASSRLS`; a per-request transaction sets a transaction-local
`forge.org_id` GUC before any query, and the policies fail closed when it is unset (no GUC → zero rows).

**Layer 3 — codegen.** The generated repository is parameterized by tenant scope, so there is no generated code
path that produces a tenant-less query.

### The proof suite (calibrated claim)

Run as the non-owner app role, gated in CI:

| Gate | Asserts |
|---|---|
| read / relational | actor in org A reading org B's rows → 0 rows |
| read / vector | an ANN query by A over a shared index → 0 of B's chunks |
| write | A cannot insert/update a row attributed to B (write-path contamination) |
| jobs | a job with no `org_id` refuses; a job scoped to A cannot touch B |
| super-admin | reachable only through the audited escape hatch |
| fail-closed | a query with no tenant GUC returns zero rows, never all |

The claim Forge makes is exactly this coverage — cross-tenant read and write denied under both the application
layer and RLS, on relational and vector data — and no more.

## 6. The codegen pipeline

Scope: one archetype — the **tenant-scoped CRUD entity**. RAG/agents are hand-written core, not generatable.

- **Spec IR (Zod)** — `{ entity, orgScoped, fields, permissions }`, where `orgScoped` is `z.literal(true)`, so
  a non-tenant-scoped feature is *unrepresentable*. Permissions are deny-by-default. The spec has a
  content-hashed stable id.
- **Generation-gap output** — `*.generated.ts` files carry a provenance header and are never hand-edited; a
  `check-drift` command fails if a generated file diverges from what its spec would produce. All customization
  lives in an adjacent hand-owned `*.custom.ts` the generator never touches.
- **The gate** — generate → typecheck → run generated tests. The generated repository's every query carries the
  org scope (asserted on the output itself).

The LLM's role (when used) is to author or fill a *validated spec* and typed slots — never to emit whole files.
An `explainSpec` readout renders the permission/isolation implications in plain English for human confirmation.

## 7. Deploy (in progress)

- **Dev:** `docker compose up` → Postgres 17 + pgvector + object storage; the CLI migrates and seeds.
- **Live:** the starter app on a serverless host + managed Postgres (pgvector), with per-tenant LLM-cost
  metrics as structured logs.
- **Self-host:** a production compose file.

## Roadmap

- The starter app shell, auth screens, and org/member management (concrete Better-Auth wiring).
- Background jobs (pg-boss, tenant-scoped job actor) and file storage.
- A deployed reference app with a measured spec → wired-feature time.
- Capability adapters for external document-intake and automation engines.
