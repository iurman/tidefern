import type { ConsoleMessage, Page, Request, Response } from "@playwright/test";
import { buildCatalog } from "../../src/lib/design-catalog";
import { expect, test } from "./fixtures";
import { addDays, api, DESKTOP, expectLimiterUntouched, projectOptions } from "./flows/steps";
import {
  apiProblems,
  baseHeaderProblems,
  htmlProblems,
  isPrivateNoStore,
  isThirdParty,
  titleProblems,
  urlProblems,
} from "./privacy-rules";
import { baseOrigin, freshAccount, onboard, serverHasDatabase, type Persona } from "./session";

/**
 * The privacy and performance walk (task J3f; BUILD_PROMPT section 10,
 * loop 5): every public route signed out and every signed-in route for a
 * seeded persona who can see it, loaded in a real browser on the
 * production build, with everything the page did recorded and held to the
 * rules in ./privacy-rules.ts:
 *
 * - not one request leaves the site's origin (architecture 9.1);
 * - the console stays clean: no error message and no uncaught exception,
 *   and no request fails or answers an error status, except the one route
 *   that exists to answer 404;
 * - every HTML page carries the nonce policy, the security headers,
 *   `private, no-store` and, off an indexable production, noindex; every
 *   API answer carries exactly `private, no-store` and the API's own
 *   policy; every static file carries the security headers;
 * - signed in, no page title, page path or query string names a health
 *   fact;
 * - no interface cue plays while a page loads or settles (architecture
 *   14.1: cues answer an action, never a load). Automation grants a fresh
 *   page sticky activation, so the shared audio context is already running
 *   when the page mounts: a cue on load would sound here, which is the
 *   point;
 * - every form on the page posts, so a press before hydration or with
 *   scripts off never puts a field in the address or the request log;
 * - a new-tab link carries `noopener`, and every same-origin link the walk
 *   met answers without an error once the walk is done.
 *
 * A fresh account's onboarding and empty states get the same walk, since
 * the seeded cast never shows them. A further test walks the shell by clicking, so the client navigations'
 * own fetches are held to the same rules and each click's settle cue is
 * counted: exactly one per navigation the person started.
 *
 * The personas only read. On a server without a database the persona
 * pages render their honest failed-read state and the API's reads answer
 * an error, so error statuses from `/api/` are expected there; every other
 * rule still holds. Nothing here is tagged @smoke.
 */

interface Route {
  path: string;
  /** The status the document answers with when it is not 200. */
  status?: number;
}

const catalog = buildCatalog();

const publicRoutes: Route[] = [
  { path: "/" },
  { path: "/privacy" },
  { path: "/health-privacy" },
  { path: "/terms" },
  { path: "/accessibility" },
  { path: "/account/delete" },
  { path: "/sign-in" },
  { path: "/sign-up" },
  { path: "/verify" },
  { path: "/reset" },
  { path: "/reset/sample-token" },
  ...[...catalog.chapters, ...catalog.groups].map((page) => ({ path: page.href })),
  { path: "/this-page-does-not-exist", status: 404 },
];

const settingsRoutes = [
  "/settings",
  "/settings/profile",
  "/settings/time-zone",
  "/settings/units",
  "/settings/theme",
  "/settings/sound",
  "/settings/notifications",
  "/settings/devices",
  "/settings/two-factor",
  "/settings/export",
  "/settings/consent",
  "/settings/close-account",
];

/** Each persona's routes; Noor's day page and every child page are added at run time from the API. */
const personaRoutes: Record<Persona, string[]> = {
  noor: ["/today", "/calendar", "/sharing", "/activity", "/journey", ...settingsRoutes],
  mira: ["/today", "/journey", "/family", "/calendar", "/sharing", "/activity"],
  pia: ["/today", "/family", "/calendar", "/sharing"],
  theo: ["/today", "/calendar", "/sharing", "/journey"],
  lena: ["/today", "/journey", "/family", "/calendar"],
};

interface Tone {
  type: string;
  hz: number;
}

interface Probe {
  tones: Tone[];
}

declare global {
  interface Window {
    __privacyProbe: Probe;
  }
}

/** What the page did while a route loaded. */
interface Record_ {
  requests: string[];
  responses: Response[];
  failed: string[];
  console: string[];
}

/**
 * Starts recording everything the page does, and counts every oscillator
 * the page starts (the cues are synthesized; nothing else in the site makes
 * an oscillator).
 */
async function watch(page: Page): Promise<Record_> {
  await page.addInitScript(() => {
    const probe: Probe = { tones: [] };
    window.__privacyProbe = probe;
    if (typeof OscillatorNode === "undefined") return;
    const firstValue = new WeakMap<AudioParam, number>();
    const setValueAtTime = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value: number, time: number) {
      if (!firstValue.has(this)) firstValue.set(this, value);
      return setValueAtTime.call(this, value, time);
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when?: number) {
      probe.tones.push({
        type: this.type,
        hz: firstValue.get(this.frequency) ?? this.frequency.value,
      });
      return start.call(this, when);
    };
  });
  const record: Record_ = { requests: [], responses: [], failed: [], console: [] };
  page.on("request", (request: Request) => record.requests.push(request.url()));
  page.on("response", (response: Response) => record.responses.push(response));
  page.on("requestfailed", (request: Request) => {
    const reason = request.failure()?.errorText ?? "failed";
    // A link prefetch still in flight when the walk loads the next route is cancelled by the
    // browser; nobody waits on it, so it is not a failure a person meets.
    if (reason === "net::ERR_ABORTED" && new URL(request.url()).searchParams.has("_rsc")) return;
    record.failed.push(`${request.url()} (${reason})`);
  });
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") record.console.push(message.text());
  });
  page.on("pageerror", (error) => record.console.push(`uncaught: ${error.message}`));
  return record;
}

function reset(record: Record_) {
  record.requests.length = 0;
  record.responses.length = 0;
  record.failed.length = 0;
  record.console.length = 0;
}

function tones(page: Page): Promise<Tone[]> {
  return page.evaluate(() => window.__privacyProbe?.tones ?? []);
}

/** The settle cue: one sine at the success cue's first pitch, inside the three percent jitter. */
const isSettle = (tone: Tone) =>
  tone.type === "sine" && Math.abs(tone.hz - 523.25) / 523.25 <= 0.035;

/** Static files already judged in this worker, by path. */
const judgedStatic = new Set<string>();

/** The kind of thing a response is, by where it came from. */
function kindOf(response: Response): "html" | "api" | "rsc" | "static" | "other" {
  const url = new URL(response.url());
  const request = response.request();
  if (url.pathname.startsWith("/api/")) return "api";
  if (request.resourceType() === "document") return "html";
  if (request.headers()["rsc"] === "1" || url.searchParams.has("_rsc")) return "rsc";
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(svg|png|ico|webmanifest|woff2)$/.test(url.pathname)
  )
    return "static";
  return "other";
}

/**
 * Holds what was recorded for one route to every rule, softly, so one run
 * names every route that breaks one. `signedIn` adds the health-data rules
 * for titles and URLs.
 */
async function judge(
  page: Page,
  record: Record_,
  label: string,
  { signedIn, status = 200 }: { signedIn: boolean; status?: number },
) {
  const origin = baseOrigin();
  const indexable = process.env.EXPECT_INDEXABLE === "true";
  const databaseFree = serverHasDatabase() === false;

  const outside = record.requests.filter((url) => isThirdParty(url, origin));
  expect.soft(outside, `${label}: requests to another origin`).toEqual([]);
  // The not-found route answers 404 on purpose, and the browser logs that status for its document.
  const consoleErrors =
    status === 404
      ? record.console.filter((text) => !text.includes("status of 404"))
      : record.console;
  expect.soft(consoleErrors, `${label}: console errors`).toEqual([]);
  expect.soft(record.failed, `${label}: failed requests`).toEqual([]);

  const headerProblems: string[] = [];
  const statusProblems: string[] = [];
  for (const response of record.responses) {
    const url = new URL(response.url());
    if (url.origin !== origin) continue;
    const kind = kindOf(response);
    // A static file is judged on its first fetch; later loads replay it from the browser's cache,
    // which keeps the body but not every header.
    if (kind === "static") {
      if (judgedStatic.has(url.pathname)) continue;
      judgedStatic.add(url.pathname);
    }
    // Redirects carry headers but no body; the page they lead to is judged on arrival.
    if (response.status() >= 300 && response.status() < 400) continue;
    const headers = await response.allHeaders();
    const where = `${url.pathname} (${kind})`;
    const problems =
      kind === "html"
        ? htmlProblems(headers, { indexable })
        : kind === "api"
          ? apiProblems(headers)
          : kind === "rsc"
            ? [
                ...baseHeaderProblems(headers),
                // A client navigation's payload is the page itself, so a signed-in one is never stored either.
                ...(signedIn && !isPrivateNoStore(headers["cache-control"])
                  ? [
                      `Cache-Control is "${headers["cache-control"] ?? ""}", not private and no-store`,
                    ]
                  : []),
              ]
            : baseHeaderProblems(headers);
    for (const problem of problems) headerProblems.push(`${where}: ${problem}`);

    const expected = kind === "html" ? status : 200;
    const apiDown = databaseFree && kind === "api" && response.status() >= 500;
    if (response.status() >= 400 && response.status() !== expected && !apiDown)
      statusProblems.push(`${where} answered ${response.status()}`);
  }
  expect.soft(headerProblems, `${label}: header problems`).toEqual([]);
  expect.soft(statusProblems, `${label}: error statuses`).toEqual([]);

  if (signedIn) {
    const urlIssues = [
      ...urlProblems(page.url(), { checkPath: true }),
      ...record.requests
        .filter((url) => !isThirdParty(url, origin))
        .flatMap((url) => urlProblems(url, { checkPath: false })),
    ];
    expect.soft([...new Set(urlIssues)], `${label}: health data in a URL`).toEqual([]);
    expect
      .soft(titleProblems(await page.title()), `${label}: health data in the title`)
      .toEqual([]);
  }
}

/** Every same-origin link the walk has met, with the first route it was seen on. */
const seenLinks = new Map<string, string>();

/**
 * Follows every link the walk met (with the page's own cookies, so a
 * signed-in link is read signed in) and names each one that lands on an
 * error. The not-found route's own address is the one link allowed to 404.
 */
async function expectLinksResolve(page: Page, label: string) {
  const broken: string[] = [];
  for (const [link, from] of seenLinks) {
    if (link === "/this-page-does-not-exist") continue;
    const answer = await page.request.get(link, { maxRedirects: 5 });
    if (answer.status() >= 400) broken.push(`${link} (from ${from}) answered ${answer.status()}`);
  }
  expect.soft(broken, `${label}: links that land on an error`).toEqual([]);
  seenLinks.clear();
}

/** Loads a route, lets it settle, and judges everything it did. */
async function walk(page: Page, record: Record_, route: Route, who: string, signedIn: boolean) {
  reset(record);
  await page.goto(route.path);
  await page.waitForLoadState("networkidle");
  // Past the 600 ms settle window and the ring's settle, where a stray cue would land.
  await page.waitForTimeout(700);
  const label = `${who} ${route.path}`;
  await judge(page, record, label, { signedIn, status: route.status });
  // A form pressed before the page hydrates, or with scripts off, submits natively: as a GET it
  // would put every field (a password, a name, a health fact) in the address and the request log.
  const getForms = await page.evaluate(() =>
    [...document.forms]
      .filter((form) => form.method !== "post")
      .map((form) => form.getAttribute("aria-label") ?? form.querySelector("button")?.textContent),
  );
  expect.soft(getForms, `${label}: forms that would submit their fields in the URL`).toEqual([]);
  const { links, openers } = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
    return {
      links: anchors
        .filter((a) => a.origin === location.origin && !a.hasAttribute("download"))
        .map((a) => a.pathname + a.search),
      // A new tab must not get a handle on this one, nor learn where it came from.
      openers: anchors
        .filter((a) => a.target === "_blank" && !/\bnoopener\b/.test(a.rel))
        .map((a) => a.href),
    };
  });
  expect.soft(openers, `${label}: new-tab links without noopener`).toEqual([]);
  for (const link of links) if (!seenLinks.has(link)) seenLinks.set(link, route.path);
  // A full load starts a fresh document, so the probe starts empty.
  expect.soft(await tones(page), `${label}: cues on load`).toEqual([]);
}

test("every public route: own origin only, a clean console, the headers, and no cue on load", async ({
  browser,
}, info) => {
  test.setTimeout(300_000);
  const context = await browser.newContext(projectOptions(info, { viewport: DESKTOP }));
  const page = await context.newPage();
  try {
    const record = await watch(page);
    for (const route of publicRoutes) await walk(page, record, route, "signed out:", false);
    await expectLinksResolve(page, "signed out");
  } finally {
    await context.close();
  }
});

test("with scripts off, an auth form submits nothing into the address", async ({
  browser,
}, info) => {
  const context = await browser.newContext(projectOptions(info, { javaScriptEnabled: false }));
  const page = await context.newPage();
  const secret = "not-a-real-password";
  try {
    for (const [path, fields] of [
      ["/sign-in", { email: "someone@example.test", password: secret }],
      ["/sign-up", { name: "Sam", email: "someone@example.test", password: secret }],
      ["/reset", { email: "someone@example.test" }],
    ] as const) {
      await page.goto(path);
      for (const [name, value] of Object.entries(fields))
        await page.locator(`main input[name="${name}"]`).fill(value);
      const navigation = page.waitForRequest((request) => request.isNavigationRequest());
      await page.locator("main form button[type='submit']").first().click();
      const request = await navigation;
      await page.waitForLoadState();
      expect.soft(request.method(), `${path} posts, never a GET with its fields`).toBe("POST");
      expect.soft(new URL(page.url()).search, `${path} keeps the address bare`).toBe("");
      expect.soft(page.url()).not.toContain("example.test");
      await expect.soft(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

/** Noor's day page for yesterday, from the API's `today`, and every child page the persona's API lists. */
async function runtimeRoutes(page: Page, persona: Persona): Promise<string[]> {
  const paths: string[] = [];
  if (persona === "noor") {
    const me = await page.request.get("/api/v1/me");
    if (me.ok()) {
      const { today } = await api<{ today: string }>(page, "/api/v1/me");
      paths.push(`/log/${addDays(today, -1)}`);
    }
  }
  const children = await page.request.get("/api/v1/children");
  if (children.ok()) {
    const { items } = (await children.json()) as { items: { id: string }[] };
    for (const child of items) paths.push(`/family/${child.id}`);
  }
  return paths;
}

for (const persona of ["noor", "mira", "pia", "theo", "lena"] as const) {
  test(`${persona}'s routes: own origin only, a clean console, the headers, no health data in a URL or title, and no cue on load`, async ({
    asPersona,
  }) => {
    test.setTimeout(300_000);
    const page = await asPersona(persona, { viewport: DESKTOP });
    const record = await watch(page);
    const paths = [...personaRoutes[persona], ...(await runtimeRoutes(page, persona))];
    for (const path of paths) await walk(page, record, { path }, `${persona}:`, true);
    // On a server without a database every signed-in page is its failed-read state, whose links
    // lead to more of the same; the links are followed where the pages are real.
    if (serverHasDatabase() !== false) await expectLinksResolve(page, persona);
    else seenLinks.clear();
    expectLimiterUntouched();
  });
}

test("a new account's empty states keep the rules, and every link they offer leads somewhere", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const context = await browser.newContext(projectOptions(info, { viewport: DESKTOP }));
  const page = await context.newPage();
  try {
    // Before the profile exists: onboarding.
    const account = await freshAccount(page, { label: "privacy-empty" });
    const record = await watch(page);
    await walk(page, record, { path: "/welcome" }, "new account:", true);
    if (account === null) return;
    // A cycle profile with nothing logged: every screen shows its empty state.
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Sam" });
    for (const path of ["/today", "/calendar", "/sharing", "/activity", "/journey", "/settings"])
      await walk(page, record, { path }, "new account:", true);
    await expectLinksResolve(page, "new account");
  } finally {
    await context.close();
  }
});

test("client navigations in the shell keep the rules, and each click settles with one cue", async ({
  asPersona,
}) => {
  test.setTimeout(120_000);
  const page = await asPersona("noor", { viewport: DESKTOP });
  const record = await watch(page);
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  const rail = page.locator("nav[aria-label='Main']").first();
  await expect(rail).toBeVisible();
  const settles = async () => (await tones(page)).filter(isSettle).length;
  for (const [name, path] of [
    ["Calendar", "/calendar"],
    ["Sharing", "/sharing"],
    ["Settings", "/settings"],
    ["Today", "/today"],
  ] as const) {
    reset(record);
    const before = await settles();
    await rail.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(700);
    const label = `noor: click to ${path}`;
    await judge(page, record, label, { signedIn: true });
    // One settle cue as the view arrives, never a second.
    expect.soft((await settles()) - before, `${label}: one settle cue`).toBe(1);
  }
});
