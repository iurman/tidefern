/**
 * Health data travels only in request and response bodies (architecture
 * 5.1 and 9.1): runtime logs record paths and query strings. The contract's
 * query parameters are ids, calendar dates, instants, page cursors, numbers
 * and one closed vocabulary filter, and this list names each one with the
 * shape its value must have. The client refuses any other key or any value
 * outside its shape before the request leaves, and a unit test fails when
 * openapi/v1.json gains a query parameter this list does not cover, so a
 * new one is reviewed here first.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const CURSOR = /^[A-Za-z0-9_-]{1,200}={0,2}$/;
const INTEGER = /^\d{1,4}$/;
// Child event kinds. A vocabulary code, not a health word (lead ruling on E5).
const CHILD_EVENT_KIND = /^(milestone|feed|sleep|diaper)$/;

export const allowedQuery: Readonly<Record<string, RegExp>> = {
  subject: UUID,
  childId: UUID,
  from: DATE,
  to: DATE,
  updatedSince: INSTANT,
  cursor: CURSOR,
  limit: INTEGER,
  age: INTEGER,
  kind: CHILD_EVENT_KIND,
};

/** Thrown, before any network call, for a query string the contract never carries. */
export class QueryNotAllowedError extends Error {
  override readonly name = "QueryNotAllowedError";

  constructor(readonly key: string) {
    // The value is left out on purpose: it is the thing that must not travel.
    super(`The query parameter "${key}" is not allowed or its value has the wrong shape.`);
  }
}

/** Throws QueryNotAllowedError for the first parameter of `url` outside the list. */
export function assertSafeQuery(url: URL): void {
  for (const [key, value] of url.searchParams) {
    const shape = Object.hasOwn(allowedQuery, key) ? allowedQuery[key] : undefined;
    if (shape === undefined || !shape.test(value)) throw new QueryNotAllowedError(key);
  }
}
