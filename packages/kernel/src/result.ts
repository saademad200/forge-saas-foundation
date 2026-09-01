/**
 * A total, explicit success-or-failure type. Use it instead of throwing across a
 * layer boundary (application <-> infrastructure), so a caller must handle the
 * failure by construction rather than remember a try/catch. Domain code is pure
 * and returns `Result`; only the interface layer decides how an `err` becomes an
 * HTTP status or a CLI exit code.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Map the success value, leaving a failure untouched. */
export const map = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

/** Chain a second fallible step onto a success. */
export const flatMap = <T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (r.ok ? f(r.value) : r);

/** Unwrap the value or fall back — never throws. */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;
