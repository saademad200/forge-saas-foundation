#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSpec, explainSpec, generate } from "@forge/codegen";

/**
 * The `forge` CLI. Two commands for the codegen archetype:
 *   forge add-feature   --spec <spec.json> --out <dir>   generate + write a feature
 *   forge check-drift   --spec <spec.json> --out <dir>   fail if a @generated file drifted
 *
 * `add-feature` writes the @generated files and, ONCE, a hand-owned `<entity>.custom.ts`
 * seam (never overwritten). `check-drift` is the generation-gap guard: it regenerates and
 * compares, so a hand-edit to a @generated file is caught in CI — customization must live
 * in the .custom.ts file, which the generator never touches.
 */

interface Args {
  spec?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (val === undefined) continue;
    if (key === "--spec") args.spec = val;
    else if (key === "--out") args.out = val;
  }
  return args;
}

function loadSpec(path: string) {
  const raw = readFileSync(path, "utf8");
  return parseSpec(JSON.parse(raw));
}

function customSeam(entity: string): string {
  return (
    `// Hand-owned customization for the "${entity}" feature. The generator NEVER touches\n` +
    `// this file. Put overrides, extra use-cases, and hooks here — not in the @generated files.\n` +
    `export {};\n`
  );
}

function addFeature(args: Args): void {
  if (!args.spec || !args.out) throw new Error("usage: forge add-feature --spec <file> --out <dir>");
  const spec = loadSpec(args.spec);
  const files = generate(spec);

  for (const f of files) {
    const dest = join(args.out, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content);
  }

  // Create the customization seam once; never overwrite it.
  const seamPath = join(args.out, spec.entity, `${spec.entity}.custom.ts`);
  if (!existsSync(seamPath)) writeFileSync(seamPath, customSeam(spec.entity));

  // eslint-disable-next-line no-console
  console.log(explainSpec(spec));
  // eslint-disable-next-line no-console
  console.log(`\nGenerated ${files.length} file(s) into ${join(args.out, spec.entity)}/`);
}

function checkDrift(args: Args): void {
  if (!args.spec || !args.out) throw new Error("usage: forge check-drift --spec <file> --out <dir>");
  const spec = loadSpec(args.spec);
  const files = generate(spec);
  const drifted: string[] = [];
  for (const f of files) {
    const dest = join(args.out, f.path);
    const onDisk = existsSync(dest) ? readFileSync(dest, "utf8") : "";
    if (onDisk !== f.content) drifted.push(f.path);
  }
  if (drifted.length > 0) {
    console.error(
      `Drift detected in @generated files (hand-edited or stale — customize in .custom.ts instead):\n` +
        drifted.map((d) => `  - ${d}`).join("\n"),
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`No drift: ${files.length} @generated file(s) match the spec.`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case "add-feature":
      addFeature(args);
      break;
    case "check-drift":
      checkDrift(args);
      break;
    default:
      console.error("usage: forge <add-feature|check-drift> --spec <file> --out <dir>");
      process.exit(1);
  }
}

main();
