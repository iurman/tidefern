import { vi } from "vitest";

/**
 * A fake API for the family component tests: `window.fetch` answers each
 * `METHOD /path` from a queue the test fills, and every request is recorded
 * with its query, headers and body. Test-only: nothing in the app imports it.
 */

export interface Call {
  method: string;
  path: string;
  query: string;
  ifMatch: string | null;
  key: string | null;
  body: unknown;
}

export type Answer = () => Response | Promise<Response>;

export const json =
  (body: unknown, status = 200): Answer =>
  () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { "content-type": "application/json" },
    });

export const problem = (status: number, extra: Record<string, unknown> = {}): Answer =>
  json({ type: "urn:tidefern:problem:test", title: "Problem", status, ...extra }, status);

export function fakeApi() {
  const calls: Call[] = [];
  const routes = new Map<string, Answer[]>();
  const standing = new Map<string, Answer>();
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      ifMatch: request.headers.get("if-match"),
      key: request.headers.get("idempotency-key"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    const key = `${request.method} ${url.pathname}`;
    const next = routes.get(key)?.shift() ?? standing.get(key);
    if (next === undefined) throw new TypeError("Failed to fetch");
    return next();
  });
  return {
    calls,
    /** Queues one answer for `METHOD /path`. */
    route(key: string, answer: Answer) {
      routes.set(key, [...(routes.get(key) ?? []), answer]);
    },
    /** Answers every `METHOD /path` the queue has no answer for, until replaced. */
    always(key: string, answer: Answer) {
      standing.set(key, answer);
    },
  };
}

/** jsdom draws a dialog but does not open it as a modal; the sheet only needs the attribute. */
export function openDialogs() {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

/**
 * jsdom has no `scrollIntoView`; this lends every element one that records
 * which element asked and how, until `restore()` takes it away again.
 */
export function scrollSpy() {
  const scroll = vi.fn<(this: Element, options?: ScrollIntoViewOptions) => void>();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: scroll,
    configurable: true,
    writable: true,
  });
  return {
    scroll,
    /** The elements that were scrolled into view, in order. */
    targets: () => scroll.mock.contexts as Element[],
    restore() {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    },
  };
}

/** Collapses every run of white space, the no-break spaces between numbers and units included. */
export function words(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
