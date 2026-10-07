import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Cookie, type Page, type Request, type Route } from "@playwright/test";
import { baseOrigin, freshAccount, signInAs } from "./session";

/**
 * Onboarding at /welcome (task H1) against the production build.
 *
 * - Every stage path runs end to end on a fresh account of its own, made
 *   through the mail capture endpoint: cycle with a period start, pregnancy
 *   by each dating method, postpartum with a child and the guardian's
 *   consent, and here for someone else with no dates (which also carries an
 *   invitation fragment through to the sharing screen). The API is then
 *   read back to show what was written. No seeded persona changes.
 * - The pending and failure states of each write, the passkey step and the
 *   axe and reflow checks run on one shared account whose every write the
 *   test answers itself with page.route, so it never gets a profile and
 *   stays on /welcome for the next test.
 * - A real WebAuthn ceremony cannot run on 127.0.0.1, so the passkey step
 *   stubs `navigator.credentials.create` and answers /api/auth/passkey/*.
 * - The browser is in Berlin, like Noor, so a fresh account that takes the
 *   browser's zone counts the same calendar day the API gives her; the
 *   dates typed below are read from that day at run time.
 *
 * Without a database the helpers hand back null and the canned cookie, and
 * each test asserts the page's honest failed-read state instead. Nothing
 * here is tagged @smoke.
 */

test.use({ timezoneId: "Europe/Berlin" });

const ZONE = "Europe/Berlin";
const failedRead = "We could not load your account just now. Reload the page to try again.";

/** Today on the API's calendar in Berlin, from Noor's GET /api/v1/me; null without a database. */
let calendar: string | null | undefined;

async function calendarToday(page: Page): Promise<string | null> {
  if (calendar !== undefined) return calendar;
  const cookies = await signInAs(page, "noor");
  if (cookies === null) {
    calendar = null;
  } else {
    const response = await page.request.get(`${baseOrigin()}/api/v1/me`);
    const me = (await response.json()) as { today: string; profile: { timeZone: string } };
    expect(me.profile.timeZone, "Noor's calendar is Berlin's").toBe(ZONE);
    calendar = me.today;
  }
  await page.context().clearCookies();
  return calendar;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * A fresh account of its own with today's date, or null on a server
 * without a database (the canned cookie is then in place).
 */
async function newcomer(page: Page, label: string): Promise<{ today: string } | null> {
  const today = await calendarToday(page);
  const account = await freshAccount(page, { label: `welcome-${label}` });
  if (account === null || today === null) return null;
  return { today };
}

/** The shared account's cookies: it never gets a profile, because its writes are answered here. */
let shared: Cookie[] | null | undefined;

async function sharedNewcomer(page: Page): Promise<{ today: string } | null> {
  const today = await calendarToday(page);
  if (shared === undefined) {
    const account = await freshAccount(page, { label: "welcome-shared" });
    shared = account === null ? null : account.cookies;
  } else if (shared === null) {
    // No database: the helper adds the canned cookie again for this page.
    await freshAccount(page);
  } else {
    await page.context().addCookies(shared);
  }
  return shared === null || today === null ? null : { today };
}

/** The failed-read state a server without a database shows for the canned cookie. */
async function expectFailedRead(page: Page) {
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Tidefern");
  await expect(page.getByText(failedRead)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function problem(route: Route, status: number, detail?: string) {
  return route.fulfill({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({ type: "urn:tidefern:problem:test", title: "Test", status, detail }),
  });
}

type Answer = (route: Route) => Promise<void>;

interface Seen {
  method: string;
  path: string;
  key: string | null;
  body: unknown;
}

/**
 * Answers every write the page can make, so nothing reaches the server: each
 * endpoint takes its answers in order and repeats the last. Returns the
 * requests it saw.
 */
async function answerWrites(
  page: Page,
  answers: Partial<Record<"consent" | "profile" | "entry" | "pregnancy" | "child", Answer[]>> = {},
): Promise<Seen[]> {
  const seen: Seen[] = [];
  const ok: Record<string, Answer> = {
    consent: (route) => json(route, { id: "0199b0a0-0000-7000-8000-000000000001" }, 201),
    profile: (route) => json(route, { version: 1 }, 201),
    entry: (route) => json(route, { id: "e", version: 1 }),
    pregnancy: (route) => json(route, { id: "p" }, 201),
    child: (route) => json(route, { id: "c" }, 201),
  };
  const patterns = {
    consent: "**/api/v1/me/consents",
    profile: "**/api/v1/me/profile",
    entry: "**/api/v1/cycle/entries/*",
    pregnancy: "**/api/v1/pregnancies",
    child: "**/api/v1/children",
  } as const;
  for (const [name, pattern] of Object.entries(patterns)) {
    const queue = [...(answers[name as keyof typeof patterns] ?? [])];
    await page.route(pattern, async (route) => {
      const request: Request = route.request();
      seen.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        key: request.headers()["idempotency-key"] ?? null,
        body: request.postData() === null ? undefined : request.postDataJSON(),
      });
      const answer = queue.length > 1 ? queue.shift() : queue[0];
      await (answer ?? ok[name])!(route);
    });
  }
  // The end of onboarding is a full navigation to Today; this account has no profile there.
  await page.route("**/today", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Today stub</title><main><h1>Today stub</h1></main>",
    }),
  );
  return seen;
}

async function next(page: Page, name: RegExp | string = /^(Continue|Finish)$/) {
  await page.getByRole("button", { name }).click();
}

async function heading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

async function typeDate(page: Page, legend: RegExp, iso: string) {
  const group = page.getByRole("group", { name: legend });
  const [year, month, day] = iso.split("-") as [string, string, string];
  await group.getByLabel("Month").fill(month);
  await group.getByLabel("Day").fill(day);
  await group.getByLabel("Year").fill(year);
}

/** Steps 1 and 2: the browser's zone, taken from the suggestion, and a stage card. */
async function zoneAndStage(page: Page, stage: string) {
  await heading(page, "Where are you?");
  await page.getByRole("button", { name: `Use ${ZONE}` }).click();
  await expect(page.getByRole("combobox", { name: /Time zone/ })).toHaveValue(ZONE);
  await next(page);
  await heading(page, "What brings you to Tidefern?");
  await page.getByRole("radio", { name: stage, exact: true }).check();
  await next(page);
}

async function agree(page: Page, { consent = true } = {}) {
  if (consent) await page.getByRole("checkbox", { name: /I agree to Tidefern collecting/ }).check();
  await page.getByRole("checkbox", { name: /I accept the terms of use/ }).check();
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
}

/** Step 5 offers a passkey wherever the browser has WebAuthn; these paths say Not now. */
async function notNow(page: Page) {
  await heading(page, "Add a passkey");
  await expect(page.getByText("Your account is set up.")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
}

async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${baseOrigin()}${path}`);
  expect(response.status(), path).toBe(200);
  return (await response.json()) as T;
}

interface ConsentRow {
  category: string;
  subjectId: string;
  consentingGuardianId: string | null;
  textVersion: string;
}

async function expectProfile(page: Page, stage: string) {
  const me = await api<{ id: string; profile: { stage: string; timeZone: string } | null }>(
    page,
    "/api/v1/me",
  );
  expect(me.profile).toMatchObject({ stage, timeZone: ZONE });
  return me.id;
}

test("a person without a profile lands on step 1, with the browser's zone offered and not chosen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page).toHaveTitle("Welcome | Tidefern");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Tidefern");
  await heading(page, "Where are you?");
  await expect(page.getByText(`Your device is set to ${ZONE}.`)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Time zone/ })).toHaveValue("");
  await expect(page.getByText(/Nothing is saved until you agree to the terms/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveText([
    "1Time zone",
    "2Stage",
    "3Dates",
    "4Consent",
    "5Passkey",
  ]);
  await next(page);
  await expect(page.getByText("Choose a zone from the list.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Where are you?" })).toBeVisible();
});

test("cycle: the consent, the profile and the period start with its flow are written in that order", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await newcomer(page, "cycle");
  if (fresh === null) return expectFailedRead(page);
  const start = addDays(fresh.today, -12);
  const order: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/v1/")) {
      order.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.goto("/welcome");
  await zoneAndStage(page, "Cycle");
  await heading(page, "Your dates");
  await expect(page.getByRole("radio", { name: "Medium" })).toBeChecked();
  await typeDate(page, /When did your last period start/, start);
  await page.getByRole("radio", { name: "Heavy" }).check();
  await next(page);
  await heading(page, "Your consent");
  await agree(page);
  await next(page);
  await notNow(page);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator("nav[aria-label='Main']").first()).toBeVisible();

  expect(order).toEqual([
    "POST /api/v1/me/consents",
    "PUT /api/v1/me/profile",
    `PUT /api/v1/cycle/entries/${start}`,
  ]);
  const me = await expectProfile(page, "cycle");
  const entries = await api<{ items: Array<{ date: string; flow: string }> }>(
    page,
    `/api/v1/cycle/entries?from=${start}&to=${start}`,
  );
  expect(entries.items).toEqual([expect.objectContaining({ date: start, flow: "heavy" })]);
  const consents = await api<{ items: ConsentRow[] }>(page, "/api/v1/me/consents");
  expect(consents.items.map((row) => row.category).sort()).toEqual([
    "cycle.history",
    "cycle.symptoms",
    "journal.private",
  ]);
  for (const row of consents.items) {
    expect(row).toMatchObject({ subjectId: me, textVersion: "2026-10" });
  }
});

const datings = [
  {
    method: "From my last period",
    fill: async (page: Page, today: string) =>
      typeDate(page, /First day of your last period/, addDays(today, -70)),
    expected: (today: string) => ({ datingMethod: "lmp", dueDate: addDays(today, 210) }),
  },
  {
    method: "From a scan",
    fill: async (page: Page, today: string) => {
      await typeDate(page, /Date of the scan/, addDays(today, -14));
      await page.getByRole("textbox", { name: /^Weeks/ }).fill("12");
      await page.getByRole("textbox", { name: /^Days/ }).fill("3");
    },
    // The scan day plus what is left of 280 days at 12 weeks and 3 days.
    expected: (today: string) => ({
      datingMethod: "ultrasound",
      dueDate: addDays(today, -14 + 193),
    }),
  },
  {
    method: "From an embryo transfer",
    fill: async (page: Page, today: string) => {
      await typeDate(page, /Date of the transfer/, addDays(today, -30));
      await page.getByRole("textbox", { name: /Embryo's age/ }).fill("5");
    },
    // A day-5 embryo: the transfer day plus 261 days (ACOG CO 700, core).
    expected: (today: string) => ({ datingMethod: "transfer", dueDate: addDays(today, -30 + 261) }),
  },
  {
    method: "I was given a due date",
    fill: async (page: Page, today: string) => typeDate(page, /Due date/, addDays(today, 200)),
    expected: (today: string) => ({ datingMethod: "manual", dueDate: addDays(today, 200) }),
  },
];

for (const dating of datings) {
  test(`pregnancy dated "${dating.method}": the API works out the due date from that method`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fresh = await newcomer(page, "pregnancy");
    if (fresh === null) return expectFailedRead(page);
    await page.goto("/welcome");
    await zoneAndStage(page, "Pregnancy");
    await heading(page, "Your dates");
    await page.getByRole("radio", { name: dating.method }).check();
    await dating.fill(page, fresh.today);
    await next(page);
    await heading(page, "Your consent");
    await expect(page.getByText("Pregnancy overview", { exact: true })).toBeVisible();
    await agree(page);
    await next(page);
    await notNow(page);
    await expect(page).toHaveURL(/\/today$/);

    await expectProfile(page, "pregnancy");
    const pregnancy = await api<{ datingMethod: string; dueDate: string; status: string }>(
      page,
      "/api/v1/pregnancies/current",
    );
    expect(pregnancy).toMatchObject({ status: "active", ...dating.expected(fresh.today) });
  });
}

test("postpartum: the child is added with the guardian's consent, then the period since", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await newcomer(page, "postpartum");
  if (fresh === null) return expectFailedRead(page);
  const birth = addDays(fresh.today, -45);
  const since = addDays(fresh.today, -3);
  await page.goto("/welcome");
  await zoneAndStage(page, "Postpartum");
  await heading(page, "Your dates");
  await expect(
    page.getByText(/On the child's behalf, you agree that Tidefern keeps/),
  ).toBeVisible();
  const box = page.getByRole("checkbox", { name: /I agree on my baby's behalf/ });
  await expect(box).not.toBeChecked();
  await page.getByRole("textbox", { name: /Your baby's name/ }).fill("Ilo");
  await typeDate(page, /When was the birth/, birth);
  await typeDate(page, /If a period has come since/, since);
  await next(page);
  await expect(page.getByText("Tick the box to add your baby.")).toBeVisible();
  await box.check();
  await next(page);
  await heading(page, "Your consent");
  await agree(page);
  await next(page);
  await notNow(page);
  await expect(page).toHaveURL(/\/today$/);

  const me = await expectProfile(page, "postpartum");
  const children = await api<{
    items: Array<{ id: string; displayName: string; dateOfBirth: string }>;
  }>(page, "/api/v1/children");
  const child = children.items.find((item) => item.displayName === "Ilo");
  expect(child).toMatchObject({ dateOfBirth: birth });
  const consents = await api<{ items: ConsentRow[] }>(page, "/api/v1/me/consents");
  expect(consents.items).toContainEqual(
    expect.objectContaining({ category: "child", subjectId: child?.id, consentingGuardianId: me }),
  );
  const entries = await api<{ items: Array<{ date: string; flow: string }> }>(
    page,
    `/api/v1/cycle/entries?from=${since}&to=${since}`,
  );
  expect(entries.items).toEqual([expect.objectContaining({ date: since, flow: "medium" })]);
});

test("here for someone else: no dates, no consent recorded, and an invitation lands on the sharing screen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await newcomer(page, "none");
  if (fresh === null) return expectFailedRead(page);
  await page.goto("/welcome#invitation=abc");
  // Out of the address bar at once; held in memory only.
  await expect(page).toHaveURL(/\/welcome$/);
  await zoneAndStage(page, "Here for someone else");
  await heading(page, "Before you start");
  await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveText([
    "1Time zone",
    "2Stage",
    "3Terms",
    "4Passkey",
  ]);
  await expect(page.getByRole("checkbox", { name: /I agree to Tidefern collecting/ })).toHaveCount(
    0,
  );
  await agree(page, { consent: false });
  await next(page);
  await heading(page, "Add a passkey");
  const landed = page.waitForURL(/\/sharing#invitation=abc$/, { waitUntil: "commit" });
  await page.getByRole("button", { name: "Not now" }).click();
  await landed;
  expect(new URL(page.url()).search, "the token never travels in a query").toBe("");

  await expectProfile(page, "none");
  const consents = await api<{ items: ConsentRow[] }>(page, "/api/v1/me/consents");
  expect(consents.items).toEqual([]);
});

/** Walks the shared account to the consent step of the cycle path. */
async function toCycleConsent(page: Page, today: string) {
  await page.goto("/welcome");
  await zoneAndStage(page, "Cycle");
  await typeDate(page, /When did your last period start/, addDays(today, -12));
  await next(page);
  await heading(page, "Your consent");
}

test("each write says what is happening, and a failed one says what to do and retries with the same key", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = await answerWrites(page, {
    consent: [
      async (route) => {
        await held;
        await problem(route, 500);
      },
      (route) => json(route, { id: "x" }, 201),
    ],
  });
  await toCycleConsent(page, fresh.today);
  await agree(page);
  await next(page, "Continue");

  // Pending: the button keeps its place and says Saving; the line under it names the write.
  await expect(page.getByRole("button", { name: /Saving/ })).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "Recording your consent" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("We could not record your consent. Wait a moment and try again."),
  ).toBeVisible();
  await next(page, "Try again");
  await heading(page, "Add a passkey");
  const consents = seen.filter((request) => request.path === "/api/v1/me/consents");
  expect(consents).toHaveLength(2);
  expect(consents[1]?.key, "the retry carries the first key").toBe(consents[0]?.key);
  expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
    "POST /api/v1/me/consents",
    "POST /api/v1/me/consents",
    "PUT /api/v1/me/profile",
    `PUT /api/v1/cycle/entries/${addDays(fresh.today, -12)}`,
  ]);
});

test("a profile that did not save is retried without recording the consent again", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  const seen = await answerWrites(page, {
    profile: [(route) => route.abort("failed"), (route) => json(route, { version: 1 }, 201)],
  });
  await toCycleConsent(page, fresh.today);
  await agree(page);
  await next(page, "Continue");
  await expect(
    page.getByText("We could not save your profile. Check your connection and try again."),
  ).toBeVisible();
  await expect(page.getByText("Saved so far: your consent.")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I agree to Tidefern collecting/ }),
  ).toBeDisabled();
  // Nothing about the earlier steps is settled yet, so she may still go back.
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await next(page, "Try again");
  await heading(page, "Add a passkey");
  expect(seen.filter((request) => request.path === "/api/v1/me/consents")).toHaveLength(1);
  expect(seen.filter((request) => request.path === "/api/v1/me/profile")).toHaveLength(2);
});

test("a period start that did not save can be tried again or skipped once the profile is saved", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  const seen = await answerWrites(page, { entry: [(route) => problem(route, 503)] });
  await toCycleConsent(page, fresh.today);
  await agree(page);
  await next(page, "Continue");
  await expect(
    page.getByText("We could not save your period start. Wait a moment and try again."),
  ).toBeVisible();
  await expect(page.getByText("Saved so far: your consent and your profile.")).toBeVisible();
  await expect(page.getByText("You can log it later from Today.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  await next(page, "Try again");
  await expect(
    page.getByText("We could not save your period start. Wait a moment and try again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await heading(page, "Add a passkey");
  expect(seen.filter((request) => request.path.startsWith("/api/v1/cycle/entries"))).toHaveLength(
    2,
  );
});

test("a pregnancy and a child that did not save are retried with the same id and key", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  const seen = await answerWrites(page, {
    pregnancy: [(route) => problem(route, 500), (route) => json(route, { id: "p" }, 201)],
    child: [(route) => route.abort("failed"), (route) => json(route, { id: "c" }, 201)],
  });

  await page.goto("/welcome");
  await zoneAndStage(page, "Pregnancy");
  await page.getByRole("radio", { name: "I was given a due date" }).check();
  await typeDate(page, /Due date/, addDays(fresh.today, 150));
  await next(page);
  await agree(page);
  await next(page, "Continue");
  await expect(
    page.getByText("We could not save your pregnancy. Wait a moment and try again."),
  ).toBeVisible();
  await expect(page.getByText("You can add it later from Journey.")).toBeVisible();
  await next(page, "Try again");
  await heading(page, "Add a passkey");
  const starts = seen.filter((request) => request.path === "/api/v1/pregnancies");
  expect(starts).toHaveLength(2);
  expect(starts[1]?.key).toBe(starts[0]?.key);
  expect(starts[1]?.body).toEqual(starts[0]?.body);
  expect(starts[0]?.body).toMatchObject({
    dating: { method: "manual", dueDate: addDays(fresh.today, 150) },
  });

  await page.goto("/welcome");
  await zoneAndStage(page, "Postpartum");
  await page.getByRole("textbox", { name: /Your baby's name/ }).fill("Sol");
  await typeDate(page, /When was the birth/, addDays(fresh.today, -20));
  await page.getByRole("checkbox", { name: /I agree on my baby's behalf/ }).check();
  await next(page);
  await agree(page);
  await next(page, "Continue");
  await expect(
    page.getByText("We could not add your baby. Check your connection and try again."),
  ).toBeVisible();
  await expect(page.getByText("You can add your baby later from Family.")).toBeVisible();
  await next(page, "Try again");
  await heading(page, "Add a passkey");
  const children = seen.filter((request) => request.path === "/api/v1/children");
  expect(children).toHaveLength(2);
  expect(children[1]?.key).toBe(children[0]?.key);
  expect(children[1]?.body).toEqual(children[0]?.body);
  expect(children[0]?.body).toMatchObject({
    displayName: "Sol",
    guardianConsent: { given: true, textVersion: "2026-10" },
  });
});

test("an ended session is sent to sign in again instead of retrying", async ({ page }) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  await answerWrites(page, { consent: [(route) => problem(route, 401)] });
  await toCycleConsent(page, fresh.today);
  await agree(page);
  await next(page, "Continue");
  await expect(page.getByText("Your session has ended. Sign in again to finish.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

/** A credential as Chromium hands one back, enough for @simplewebauthn/browser to read. */
const stubCredentials = `(() => {
  const bytes = (text) => new TextEncoder().encode(text).buffer;
  window.__passkeyOutcome = "created";
  navigator.credentials.create = async () => {
    if (window.__passkeyOutcome === "closed") {
      throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
    }
    return {
      id: "c3R1Yi1jcmVkZW50aWFs",
      rawId: bytes("stub-credential"),
      type: "public-key",
      authenticatorAttachment: "platform",
      response: {
        clientDataJSON: bytes("{}"),
        attestationObject: bytes("stub"),
        getTransports: () => ["internal"],
      },
      getClientExtensionResults: () => ({}),
    };
  };
})();`;

const registerOptions = {
  challenge: "c3R1Yi1jaGFsbGVuZ2U",
  rp: { name: "Tidefern", id: "127.0.0.1" },
  user: { id: "c3R1Yi11c2Vy", name: "welcome@example.test", displayName: "Sam" },
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
  timeout: 60000,
  attestation: "none",
  excludeCredentials: [],
  authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
};

test("the passkey step adds a passkey, says when the prompt was closed, and finishes on Today", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  await page.addInitScript(stubCredentials);
  const passkeyCalls: string[] = [];
  await page.route("**/api/auth/passkey/**", async (route) => {
    const url = new URL(route.request().url());
    passkeyCalls.push(`${route.request().method()} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/generate-register-options")) return json(route, registerOptions);
    if (url.pathname.endsWith("/verify-registration")) {
      return json(route, { id: "passkey", name: null, createdAt: "2026-10-05T10:00:00.000Z" });
    }
    return problem(route, 500);
  });
  await answerWrites(page);
  await toCycleConsent(page, fresh.today);
  await agree(page);
  await next(page, "Continue");
  await heading(page, "Add a passkey");
  await expect(page.getByText("Step 5 of 5")).toBeHidden(); // the row, not the phone line, at 1440

  await page.evaluate(() => {
    (window as unknown as { __passkeyOutcome: string }).__passkeyOutcome = "closed";
  });
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(
    page.getByText("The passkey prompt was closed. Try again, or choose Not now."),
  ).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __passkeyOutcome: string }).__passkeyOutcome = "created";
  });
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Your passkey is saved.")).toBeVisible();
  // No name and no context travel in the options request's query.
  expect(passkeyCalls).toContain("GET /api/auth/passkey/generate-register-options");
  expect(passkeyCalls).toContain("POST /api/auth/passkey/verify-registration");
  const landed = page.waitForURL(/\/today$/);
  await page.getByRole("button", { name: "Finish" }).click();
  await landed;
});

test("without WebAuthn there is no passkey step: the consent step finishes on Today", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) return expectFailedRead(page);
  await page.addInitScript(() => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  });
  await answerWrites(page);
  await toCycleConsent(page, fresh.today);
  await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveText([
    "1Time zone",
    "2Stage",
    "3Dates",
    "4Consent",
  ]);
  await agree(page);
  const landed = page.waitForURL(/\/today$/);
  await next(page, "Finish");
  await landed;
});

/** axe in both themes at 1440 and 390, and no horizontal overflow at 390 and 320, for what is shown. */
async function checkState(page: Page, state: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${state} in ${theme} at ${width}`).toEqual([]);
    }
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${state} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("every step has no axe violations in both themes and no overflow at 390 and 320", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const fresh = await sharedNewcomer(page);
  if (fresh === null) {
    await expectFailedRead(page);
    return checkState(page, "failed read");
  }
  await answerWrites(page, { entry: [(route) => problem(route, 500)] });
  await page.goto("/welcome");
  await heading(page, "Where are you?");
  await checkState(page, "step 1");
  await next(page);
  await checkState(page, "step 1 with its error");
  await page.getByRole("button", { name: `Use ${ZONE}` }).click();
  await next(page);
  await heading(page, "What brings you to Tidefern?");
  await next(page);
  await checkState(page, "step 2 with its error");

  await page.getByRole("radio", { name: "Postpartum" }).check();
  await next(page);
  await next(page);
  await checkState(page, "step 3, postpartum, with its errors");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("radio", { name: "Pregnancy" }).check();
  await next(page);
  await page.getByRole("radio", { name: "From a scan" }).check();
  await next(page);
  await checkState(page, "step 3, pregnancy by scan, with its errors");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("radio", { name: "Cycle" }).check();
  await next(page);
  await checkState(page, "step 3, cycle");
  await typeDate(page, /When did your last period start/, addDays(fresh.today, -12));
  await next(page);
  await heading(page, "Your consent");
  await next(page, "Continue");
  await checkState(page, "step 4 with its errors");
  await agree(page);
  await next(page, "Continue");
  await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
  await checkState(page, "step 4 with a failed write");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await heading(page, "Add a passkey");
  await checkState(page, "step 5");
});
