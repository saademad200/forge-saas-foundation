/**
 * Nominal ("branded") types. A `Branded<string, "OrgId">` is a string at runtime
 * but a distinct type at compile time, so an `OrgId` can never be passed where a
 * `UserId` is expected — the tenant boundary starts in the type system. This is
 * the same discipline used for entity ids; Forge extends it to the tenant
 * discriminator (`OrgId`) so cross-tenant confusion is a type error, not a runtime
 * bug.
 */
declare const brand: unique symbol;

export type Branded<T, B extends string> = T & { readonly [brand]: B };

/** Construct a branded value. Validation lives at the trust boundary (Zod), not here. */
export const brandOf = <B extends string>() =>
  <T>(value: T): Branded<T, B> => value as Branded<T, B>;

/** The tenant discriminator. Threaded through every tenant-scoped table and query. */
export type OrgId = Branded<string, "OrgId">;
export const OrgId = brandOf<"OrgId">();

export type UserId = Branded<string, "UserId">;
export const UserId = brandOf<"UserId">();
