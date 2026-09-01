import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, map, flatMap, unwrapOr } from "./result.js";
import { OrgId, UserId } from "./brand.js";

describe("Result", () => {
  it("ok carries a value; err carries an error", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err("boom"))).toBe(true);
    const o = ok(1);
    if (o.ok) expect(o.value).toBe(1);
  });

  it("map transforms a success and leaves a failure untouched", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err<string>("boom"), (n: number) => n * 3)).toEqual(err("boom"));
  });

  it("flatMap chains fallible steps and short-circuits on failure", () => {
    const parse = (s: string) =>
      s === "1" ? ok(1) : err("not one");
    expect(flatMap(ok("1"), parse)).toEqual(ok(1));
    expect(flatMap(ok("2"), parse)).toEqual(err("not one"));
    expect(flatMap(err<string>("earlier"), parse)).toEqual(err("earlier"));
  });

  it("unwrapOr falls back without throwing", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err<string>("boom"), 0)).toBe(0);
  });
});

describe("branded ids", () => {
  it("are strings at runtime", () => {
    const o = OrgId("org_123");
    const u = UserId("user_456");
    expect(o).toBe("org_123");
    expect(u).toBe("user_456");
    // At compile time, `const bad: typeof o = u` would be a type error — the
    // tenant boundary is enforced by the type system, verified by tsc in CI.
  });
});
