<h1 align="center">Forge</h1>

<p align="center">
  A production-grade, reusable, AI-native full-stack foundation for building
  <b>multi-tenant AI SaaS</b> apps — with <b>provable tenant isolation</b>.
</p>

<p align="center">
  <a href="#license"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522-339933.svg">
</p>

---

Forge is two things fused:

1. **A hardened, modular core** — auth + RBAC + multi-tenancy, billing (idempotent webhooks), a clean UI kit,
   an AI layer (RAG + agents + LLM steps), and background/storage building blocks. Each module is independently
   tested and toggleable.
2. **A feature scaffolder** — takes a typed feature spec and generates *and wires* a tenant-scoped feature into
   the core (schema + repository + tests), so new features are generated, not hand-built each time.

The core's quality is what makes the generation trustworthy: the scaffolder emits code into a strongly typed,
tested, RBAC-correct architecture, so generated code inherits the guardrails.

## Why Forge is different

Most SaaS starters isolate tenants with a `WHERE tenant_id = …` clause that one missing predicate turns into a
cross-tenant leak — and none guard the vector/RAG path at all. Forge is built so the properties that actually
matter are **proven, not asserted**:

- **Provable tenant isolation** — application-layer repositories that cannot be constructed without a
  tenant-scoped actor, **plus** wired Postgres row-level security on relational *and* vector tables. A test
  suite proves cross-tenant read *and* write are denied, on relational *and* vector data, fail-closed — run
  against a live database in CI.
- **Verified codegen** — the scaffolder emits code that **typechecks against the real core and passes its
  generated tests**; a drift guard means generated files are never hand-edited (customization lives in a
  sibling file the generator never touches).
- **Idempotent billing** — a replayed webhook grants exactly once (event ledger + entitlement projection in
  one transaction); `past_due`/`grace` keep entitlements, `canceled` falls back to free.
- **AI-native, keyless in dev** — tenant-isolated RAG on pgvector, LLM steps with confidence-gating, and a
  tool-using agent with cost caps. The dev/demo path runs through the local Claude CLI with **no API key**.

## Architecture at a glance

A pnpm + Turborepo monorepo. The core ships as installable packages; a starter app consumes them; a CLI drives
the scaffolder. Each package mirrors a hexagonal split (domain / application / infrastructure / interface), and
a compiler-enforced architecture test keeps the dependency boundaries honest.

```
packages/
  kernel        Result type, branded ids (the tenant boundary starts in the type system)
  config        Zod-validated, fail-fast environment
  policy        the authorization kernel: pure decide(), grants-as-data, allow/deny/invisible → 200/403/404
  db            Drizzle client, tenant-scoped repositories, wired RLS (incl. the vector table)
  tenancy       org lifecycle + membership → actor derivation
  auth          provider-agnostic session port + actor resolver
  billing       plan → feature entitlements, subscription-status rules
  ai            uniform Claude client (mock/CLI), LLM steps, embedder, tool-agent
  rag           tenant-isolated retrieval on pgvector
  ui            a small, accessible, theme-aware design system
  codegen       the feature-spec IR + deterministic generator
apps/starter    a Next.js app that consumes the core
tooling/forge-cli   `forge add-feature` / `forge check-drift`
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Quickstart

Requires **Node ≥ 22**, **pnpm**, and **Docker** (for Postgres + pgvector).

```bash
pnpm install
docker compose up -d postgres          # Postgres 17 + pgvector on port 5434
cp .env.example .env

pnpm build        # build all packages
pnpm test         # unit tests (no services)
pnpm test:arch    # the architecture-boundary + purity rules
```

Run the tenant-isolation proof suite against the live database:

```bash
pnpm --filter @forge/db test:isolation   # cross-tenant read/write denied, relational + vector, fail-closed
pnpm --filter @forge/rag test:eval       # RAG retrieval quality + isolation
```

Generate a tenant-scoped feature and watch it typecheck + test:

```bash
pnpm --filter @forge/example-feature gen          # forge add-feature (invoice)
pnpm --filter @forge/example-feature build test   # generated code compiles and passes
pnpm --filter @forge/example-feature check-drift  # the generation-gap guard
```

## Status

Forge is under active development. The core spine (auth · RBAC · multi-tenancy with proven isolation), the
scaffolder, the AI layer (RAG + agents + LLM steps), and idempotent billing are built and tested. The starter
app, deploy recipes, and full feature-generation breadth are in progress — see the roadmap in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Capability claims here are calibrated to what is proven in the
test suite; nothing is claimed until it is green.

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues: please read [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) © Saad Hasan
