import { Button, Card } from "@forge/ui";

const provenModules = [
  {
    title: "Provable tenant isolation",
    desc: "App-layer actor-bound repositories plus wired Postgres RLS on relational and vector tables. Cross-tenant read and write denied, fail-closed — proven in CI against a live database.",
  },
  {
    title: "Authorization kernel",
    desc: "One pure decide() function: permissions not roles, grants as data, allow / deny / invisible → 200 / 403 / 404. A resource in another org is 404 — indistinguishable from nonexistent.",
  },
  {
    title: "Multi-tenant onboarding",
    desc: "Atomic org + owner creation, membership-to-Actor resolution, and a validated org lifecycle — so authentication answers who you are and Forge answers which org, what role.",
  },
];

export default function Home() {
  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "5rem 1.5rem" }}>
      <span
        style={{
          display: "inline-block",
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--accent)",
          marginBottom: "1rem",
        }}
      >
        Forge
      </span>

      <h1
        style={{
          fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          fontWeight: 680,
          margin: "0 0 1.25rem",
          maxWidth: "20ch",
        }}
      >
        A production-grade foundation that builds itself forward.
      </h1>

      <p
        style={{
          fontSize: "1.125rem",
          color: "var(--text-muted)",
          maxWidth: "56ch",
          lineHeight: 1.6,
          margin: "0 0 2rem",
        }}
      >
        A reusable, AI-native full-stack core for shipping multi-tenant AI SaaS apps in days — where
        the tenant boundary is proven zero-leak and new features are generated typechecked, tested,
        and RBAC-correct. Not a boilerplate you adapt.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "4rem" }}>
        <Button variant="primary">Get started</Button>
        <Button variant="secondary">Read the architecture</Button>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
        }}
      >
        {provenModules.map((m) => (
          <Card key={m.title} title={m.title} description={m.desc} />
        ))}
      </div>
    </main>
  );
}
