import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The dependency rule, compiler-enforced.
 *
 * Forge's core ships as packages with a strict import order: a package may import
 * only from packages in its allow-list. The list is DATA (a table), not branches,
 * so adding a package forces an explicit decision about what it may depend on —
 * the same "grants as data" discipline the authorization kernel uses. This test
 * walks every package's source, extracts its `@forge/*` imports, and fails the
 * build on any import outside the allow-list. It runs in the no-services CI job:
 * the boundary is an architectural claim, checked on every commit.
 *
 * As packages are added (policy, db, auth, ...), extend MAY_IMPORT below.
 */
const MAY_IMPORT: Record<string, readonly string[]> = {
  // kernel is the pure base: it may import NOTHING from @forge/*.
  kernel: [],
  // config is a leaf: the validated env schema, depended on by everything, depends
  // on nothing in @forge.
  config: [],
  // policy is the authorization kernel: pure domain over the kernel primitives.
  policy: ["kernel"],
  // tenancy: pure domain — the org lifecycle state machine and the membership->Actor
  // derivation (the bridge from authentication to authorization).
  tenancy: ["kernel", "policy"],
  // billing: pure entitlement domain (plans -> features, subscription-status rules).
  billing: [],
  // auth: the provider-agnostic session port + Actor resolver. The concrete
  // Better-Auth instance lives in the app (interface layer), not here.
  auth: ["kernel", "policy", "tenancy"],
  // ui: the design-system kit — presentational, depends on nothing in @forge.
  ui: [],
  // ai: the uniform Claude client + LLM steps + embedder. Self-contained.
  ai: [],
  // rag: tenant-isolated retrieval — orchestrates the AI embedder/LLM over the
  // tenant-scoped vector store (db) for an Actor (policy).
  rag: ["ai", "db", "policy"],
  // codegen: the spec IR + deterministic generator. Standalone tooling — the code it
  // EMITS imports @forge/db + @forge/policy, but the generator itself does not.
  codegen: [],
  // example-feature: a DEMO target holding CLI-generated code, proving generated
  // features compile + test against the real core. Its @generated code imports db + policy.
  "example-feature": ["db", "policy"],
  // db: infrastructure — the actor-bound repositories + wired RLS. Depends on the
  // kernel primitives, the policy Actor type, the tenancy + billing domain rules, env.
  db: ["kernel", "policy", "config", "tenancy", "billing"],
};

const PACKAGES_DIR = join(import.meta.dirname, "packages");

function listPackages(): string[] {
  if (!existsSync(PACKAGES_DIR)) return [];
  return readdirSync(PACKAGES_DIR).filter((name) => {
    const pkgJson = join(PACKAGES_DIR, name, "package.json");
    return existsSync(pkgJson);
  });
}

function tsFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Remove template-literal bodies before scanning for imports. A code-generator's
 * templates contain `from "@forge/..."` as generated OUTPUT (inside backticks), which
 * is not a real dependency of the generator. Real imports are never inside a template.
 */
function stripTemplates(source: string): string {
  return source.replace(/`(?:[^`\\]|\\.)*`/gs, "``");
}

/** Extract `@forge/<pkg>` specifiers from import/export-from/`import(...)` forms. */
function forgeImports(rawSource: string): string[] {
  const source = stripTemplates(rawSource);
  const specifiers: string[] = [];
  const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1];
    if (spec && spec.startsWith("@forge/")) {
      specifiers.push(spec.slice("@forge/".length).split("/")[0]!);
    }
  }
  return specifiers;
}

describe("architecture: package dependency rule", () => {
  const packages = listPackages();

  it("finds the workspace packages", () => {
    expect(packages).toContain("kernel");
  });

  for (const pkg of packages) {
    it(`@forge/${pkg} only imports packages in its allow-list`, () => {
      const allowed = MAY_IMPORT[pkg];
      expect(
        allowed,
        `package "${pkg}" has no MAY_IMPORT entry — add one to architecture.test.ts and decide its allowed deps`,
      ).toBeDefined();

      // The dependency rule governs SHIPPED code (what tsconfig compiles into dist),
      // not tests — test files legitimately import extra helpers (e.g. kernel for fixtures).
      const files = tsFilesUnder(join(PACKAGES_DIR, pkg, "src")).filter(
        (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx") && !f.endsWith(".itest.ts"),
      );
      const violations: string[] = [];
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        for (const dep of forgeImports(src)) {
          if (dep !== pkg && !allowed!.includes(dep)) {
            violations.push(`${file}: imports @forge/${dep} (not in allow-list [${allowed!.join(", ")}])`);
          }
        }
      }
      expect(violations, violations.join("\n")).toHaveLength(0);
    });
  }
});

describe("architecture: kernel purity", () => {
  it("kernel imports nothing non-relative (no packages, no node builtins)", () => {
    const files = tsFilesUnder(join(PACKAGES_DIR, "kernel", "src")).filter(
      (f) => !f.endsWith(".test.ts"),
    );
    const violations: string[] = [];
    const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1]!;
        if (!spec.startsWith(".")) {
          violations.push(`${file}: imports "${spec}" — kernel must be pure (relative imports only)`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("kernel contains no impure calls (Date.now, Math.random, fetch, new Date)", () => {
    const files = tsFilesUnder(join(PACKAGES_DIR, "kernel", "src")).filter(
      (f) => !f.endsWith(".test.ts"),
    );
    const banned = ["Date.now(", "Math.random(", "fetch(", "new Date("];
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const token of banned) {
        if (src.includes(token)) {
          violations.push(`${file}: contains "${token}" — kernel must be pure and deterministic`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
