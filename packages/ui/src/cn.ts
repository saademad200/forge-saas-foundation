/** Tiny class-name joiner. Falsy parts are dropped. No dependency needed. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
