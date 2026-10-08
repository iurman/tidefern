import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Cookie, type Locator, type Page, type Route } from "@playwright/test";
import type { Theme } from "./axe";
import {
  baseOrigin,
  freshAccount,
  MAIL_CAPTURE_PATH,
  onboard,
  signInAccount,
  signInAs,
  type Persona,
} from "./session";

/**
 * /activity against the production build (task H8): the person's audit
 * rows newest first, each the day in her zone, what happened and who did
 * it, with no health content; "Load more" over the cursor through the
 * browser client, with its pending and failure states; the shell marking
 * Settings and the way back to it.
 *
 * Populated states come from the seeded cast (packages/db README, "The
 * cast"), signed in once per persona for the worker through the shared
 * helper; the dates the rows must show are read from the API at run time
 * (the instants in GET /api/v1/me/activity, read in the profile's zone from
 * GET /api/v1/me), and seeded rows are asserted by presence, never by count
 * or position, because other specs sign the same people in. Load more needs
 * more rows than a page holds, which no seeded person has, so a fresh
 * account of this file's own makes them with exports, and a second one
 * shows its own sign-ins and a device it signed out. Two more, named with
 * the longest unbroken display names the profile allows, share with each
 * other so each name shows in the other's rows; nothing here changes a
 * seeded person beyond the sign-in every spec writes. Against a server
 * without a database the helpers hand back null and the canned cookie, and
 * each test asserts the honest failed-read state instead. Nothing here is
 * tagged @smoke.
 */

const PAGE_SIZE = 25;

/**
 * Better Auth's sign-in limiter allows three in ten seconds and keeps its
 * count for the whole run; this file sorts first, and the next one signs in
 * once without waiting out a 429. When this file is done it waits out the
 * window from its own last sign-in, so it never spends the next file's.
 */
const LIMITER_WINDOW_MS = 10_500;
let lastSignIn = 0;

test.afterAll(async () => {
  const left = lastSignIn + LIMITER_WINDOW_MS - Date.now();
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
});

async function as(page: Page, persona: Persona) {
  const cookies = await signInAs(page, persona);
  lastSignIn = Date.now();
  return cookies;
}

/** The category labels a row may carry (CONTENT.md, sharing descriptions), longest first. */
const LABELS = [
  "pregnancy overview",
  "pregnancy photos",
  "cycle history",
  "cycle status",
  "shared records",
  "private notes",
  "symptoms",
  "records",
];

const HEALTH =
  /\b(period|flow|bleed|spotting|cramp|ovulat|fertil|contracept|pregnant|miscarr|loss|birth|symptom|mood|weight|length|feed|diaper|sleep|milestone|temperature|medical|diagnos|health|cycle|pregnancy)/i;

interface ApiRow {
  id: string;
  action: string;
  actorId: string;
  subjectId: string;
  category?: string;
  childId?: string;
  occurredAt: string;
}

/** The person's own reading of her activity through the API, which writes no row of its own. */
async function apiActivity(page: Page): Promise<{ me: string; zone: string; items: ApiRow[] }> {
  const me = (await (await page.request.get("/api/v1/me")).json()) as {
    id: string;
    profile: { timeZone: string };
  };
  const page1 = await page.request.get("/api/v1/me/activity?limit=200");
  expect(page1.status()).toBe(200);
  const { items } = (await page1.json()) as { items: ApiRow[] };
  return { me: me.id, zone: me.profile.timeZone, items };
}

/** The calendar day an instant falls on in a zone, YYYY-MM-DD. */
function dayIn(zone: string, instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function list(page: Page): Locator {
  return page.locator("main ol");
}

/** The rows that say exactly this, by this person, on this day when one is given. */
function rows(page: Page, what: string, who: string, day?: string): Locator {
  let found = list(page)
    .locator("li")
    .filter({ has: page.getByText(what, { exact: true }) })
    .filter({ has: page.getByText(who, { exact: true }) });
  if (day !== undefined) found = found.filter({ has: page.locator(`time[datetime="${day}"]`) });
  return found;
}

/** No dotted action code and no health word outside a category's label, anywhere in the rows. */
async function expectNoHealthContent(page: Page) {
  const text = await list(page).innerText();
  expect(text).not.toMatch(/\b[a-z]+\.[a-z_]+\b/);
  const bare = LABELS.reduce((rest, label) => rest.split(label).join(" "), text.toLowerCase());
  expect(bare).not.toMatch(HEALTH);
}

/** The days in the list, in the order drawn. */
async function daysDrawn(page: Page): Promise<string[]> {
  return list(page)
    .locator("li time")
    .evaluateAll((times) => times.map((time) => time.getAttribute("datetime") ?? ""));
}

/** The page's honest state when the session read failed: the layout says so, the page claims no rows. */
async function expectFailedRead(page: Page) {
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByText(/could not load your profile just now/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await expect(page.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
    "href",
    "/settings",
  );
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByText("No activity yet")).toHaveCount(0);
}

async function expectNoOverflow(page: Page) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${page.url()} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Axe on the page as it stands (no navigation), in both themes at 1440 and 390. */
async function expectNoAxeViolationsHere(page: Page, state: string) {
  for (const theme of ["light", "dark"] as Theme[]) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${state} in ${theme} at ${width}`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/**
 * Every row's words stay inside their own column at 1440, 390 and 320. A
 * long unbroken name has to break where its column ends: past it, the name
 * covers the next column where the window is wide, which the document's
 * scroll width cannot show, and scrolls the page sideways on a phone.
 */
async function expectWordsInsideRows(page: Page) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const spill = await list(page).evaluate((ol) => {
      let worst = 0;
      for (const cell of ol.querySelectorAll(":scope > li > span")) {
        const column = cell.getBoundingClientRect();
        const words = document.createRange();
        words.selectNodeContents(cell);
        const drawn = words.getBoundingClientRect();
        worst = Math.max(worst, drawn.right - column.right, column.left - drawn.left);
      }
      return worst;
    });
    expect(spill, `words outside their column at ${width}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/**
 * Display names as long as the profile allows (80 characters) with nowhere
 * to break: an address used as a name, which the schema accepts.
 */
const LONG_NAMES = {
  owner: "alexandra.vandenberg-marchetti.family.records.at.home@the-long-household.example",
  partner: "theodore.wolfeschlegelsteinhausenbergerdorff.marchetti@another-household.example",
} as const;

/** Puts one device's session in the page's context, and nothing else. */
async function useDevice(page: Page, cookies: Cookie[]) {
  await page.context().clearCookies();
  await page.context().addCookies(cookies);
}

/** The signed-in person's id, from GET /api/v1/me. */
async function myId(page: Page): Promise<string> {
  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(200);
  return ((await me.json()) as { id: string }).id;
}

/** The token in the newest invitation link the mail capture holds for an address. */
async function invitationToken(page: Page, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.request.get(MAIL_CAPTURE_PATH);
    expect(response.status()).toBe(200);
    const { messages } = (await response.json()) as {
      messages: Array<{ to: string; link?: string }>;
    };
    const link = messages
      .filter((message) => message.to === email && message.link?.includes("#invitation="))
      .at(-1)?.link;
    if (link !== undefined) return new URL(link).hash.slice("#invitation=".length);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no invitation link reached ${email}`);
}

/** The browser's own Load more call; the server's first page is in process and never routed. */
const NEXT_PAGE = "**/api/v1/me/activity?**";

test("a visitor without a session is sent to sign in before anything renders", async ({
  request,
}) => {
  const response = await request.get("/activity", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toBe("/sign-in");
});

test("Noor reads her sign-in, the grants she gave and revoked, her invitations and Theo's reads, newest first in her zone, under Settings", async ({
  page,
}) => {
  const cookies = await as(page, "noor");
  await page.goto("/activity");
  if (cookies === null) {
    await expectFailedRead(page);
    return;
  }
  await expect(page).toHaveTitle("Activity | Tidefern");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await expect(page.getByRole("link", { name: "Back to Settings" })).toHaveAttribute(
    "href",
    "/settings",
  );
  const shell = page.locator("nav[aria-label='Main']");
  await expect(shell.first().getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const { zone, items } = await apiActivity(page);
  expect(zone).toBe("Europe/Berlin");
  const expected: Array<{ action: string; category?: string; what: string; who: string }> = [
    { action: "session.sign_in", what: "Signed in", who: "by you" },
    {
      action: "grant.create",
      category: "cycle.status",
      what: "Started sharing your cycle status",
      who: "by you",
    },
    {
      action: "grant.create",
      category: "cycle.symptoms",
      what: "Started sharing your symptoms",
      who: "by you",
    },
    {
      action: "grant.create",
      category: "cycle.history",
      what: "Started sharing your cycle history",
      who: "by you",
    },
    {
      action: "grant.revoke",
      category: "cycle.history",
      what: "Stopped sharing your cycle history",
      who: "by you",
    },
    { action: "invitation.create", what: "Sent an invitation", who: "by you" },
    { action: "invitation.withdraw", what: "Withdrew an invitation", who: "by you" },
    {
      action: "partner.read",
      category: "cycle.symptoms",
      what: "Viewed your symptoms",
      who: "by Theo",
    },
  ];
  for (const row of expected) {
    const matching = items.filter(
      (item) => item.action === row.action && item.category === row.category,
    );
    expect(matching.length, `${row.action} ${row.category ?? ""} in the API`).toBeGreaterThan(0);
    for (const item of matching) {
      await expect(
        rows(page, row.what, row.who, dayIn(zone, item.occurredAt)).first(),
      ).toBeVisible();
    }
  }
  // Theo's two seeded reads sit on two days in Berlin, one row each.
  const theoReads = items.filter((item) => item.action === "partner.read");
  expect(
    new Set(theoReads.map((item) => dayIn(zone, item.occurredAt))).size,
  ).toBeGreaterThanOrEqual(2);

  const days = await daysDrawn(page);
  expect(days.length).toBeGreaterThanOrEqual(9);
  expect(days, "newest first").toEqual([...days].sort().reverse());
  await expectNoHealthContent(page);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(shell.last().getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Back to Settings" })).toBeVisible();
  await expectNoOverflow(page);
});

test("Theo sees his own sign-in and his reads of Noor's symptoms by her name, and none of her rows", async ({
  page,
}) => {
  const cookies = await as(page, "theo");
  await page.goto("/activity");
  if (cookies === null) {
    await expectFailedRead(page);
    return;
  }
  const { zone, items } = await apiActivity(page);
  const reads = items.filter((item) => item.action === "partner.read");
  expect(reads.length).toBeGreaterThan(0);
  for (const read of reads) {
    await expect(
      rows(page, "Viewed Noor's symptoms", "by you", dayIn(zone, read.occurredAt)).first(),
    ).toBeVisible();
  }
  await expect(rows(page, "Signed in", "by you").first()).toBeVisible();
  for (const hers of [
    "Sent an invitation",
    "Withdrew an invitation",
    "Viewed your symptoms",
    "Started sharing your cycle status",
    "Stopped sharing your cycle history",
  ]) {
    await expect(list(page).getByText(hers, { exact: true }), hers).toHaveCount(0);
  }
  await expectNoHealthContent(page);
  await expectNoAxeViolationsHere(page, "Theo's activity");
  await expectNoOverflow(page);
});

test("Mira, a guardian, sees Sol by name, her contributions to Lena's pregnancy overview and last year's row with its year, and the page writes no activity", async ({
  page,
}) => {
  const cookies = await as(page, "mira");
  if (cookies === null) {
    await page.goto("/activity");
    await expectFailedRead(page);
    return;
  }
  const before = await apiActivity(page);
  await page.goto("/activity");
  const { zone, items } = before;
  const sol = items.find((item) => item.action === "grant.create" && item.category === "child");
  expect(sol, "Mira's grant on Sol in the API").toBeDefined();
  await expect(
    rows(
      page,
      "Started sharing Sol's records",
      "by you",
      dayIn(zone, sol?.occurredAt ?? ""),
    ).first(),
  ).toBeVisible();
  const writes = items.filter((item) => item.action === "partner.write");
  expect(writes.length).toBeGreaterThan(0);
  for (const write of writes) {
    await expect(
      rows(
        page,
        "Contributed to Lena's pregnancy overview",
        "by you",
        dayIn(zone, write.occurredAt),
      ).first(),
    ).toBeVisible();
  }
  const lastYear = items.find(
    (item) => item.action === "grant.create" && item.category === "pregnancy.overview",
  );
  expect(lastYear, "Mira's pregnancy grant in the API").toBeDefined();
  const day = dayIn(zone, lastYear?.occurredAt ?? "");
  const today = (await (await page.request.get("/api/v1/me")).json()) as { today: string };
  expect(day.slice(0, 4), "the seeded grant is from another year than today").not.toBe(
    today.today.slice(0, 4),
  );
  const older = rows(page, "Started sharing your pregnancy overview", "by you", day).first();
  await expect(older).toBeVisible();
  await expect(older.locator("time")).toContainText(day.slice(0, 4));
  await expectNoHealthContent(page);
  await expectNoAxeViolationsHere(page, "Mira's activity, with last year's row");
  await expectNoOverflow(page);

  // Names came from reads a guardian makes without an audit row: nothing new in her activity.
  const after = await apiActivity(page);
  expect(after.items.map((item) => item.id)).toEqual(before.items.map((item) => item.id));
});

test("Lena sees Mira's contributions to her pregnancy overview, by Mira's name", async ({
  page,
}) => {
  const cookies = await as(page, "lena");
  await page.goto("/activity");
  if (cookies === null) {
    await expectFailedRead(page);
    return;
  }
  const { zone, items } = await apiActivity(page);
  const writes = items.filter((item) => item.action === "partner.write");
  expect(writes.length, "Mira's writes for Lena in the API").toBeGreaterThan(0);
  for (const write of writes) {
    await expect(
      rows(
        page,
        "Contributed to your pregnancy overview",
        "by Mira",
        dayIn(zone, write.occurredAt),
      ).first(),
    ).toBeVisible();
  }
  const granted = items.find(
    (item) => item.action === "grant.create" && item.category === "pregnancy.overview",
  );
  expect(granted, "Lena's grant to Mira in the API").toBeDefined();
  await expect(
    rows(
      page,
      "Started sharing your pregnancy overview",
      "by you",
      dayIn(zone, granted?.occurredAt ?? ""),
    ).first(),
  ).toBeVisible();
  await expectNoHealthContent(page);
  await expectNoAxeViolationsHere(page, "Lena's activity");
  await expectNoOverflow(page);
});

test("Pia, who reaches Sol through a grant, sees her read without his name, and the page writes no activity", async ({
  page,
}) => {
  const cookies = await as(page, "pia");
  if (cookies === null) {
    await page.goto("/activity");
    await expectFailedRead(page);
    return;
  }
  const before = await apiActivity(page);
  await page.goto("/activity");
  const read = before.items.find((item) => item.action === "partner.read");
  expect(read, "Pia's read of Sol in the API").toBeDefined();
  await expect(
    rows(
      page,
      "Viewed a child's records",
      "by you",
      dayIn(before.zone, read?.occurredAt ?? ""),
    ).first(),
  ).toBeVisible();
  await expect(list(page)).not.toContainText("Sol");
  await expectNoHealthContent(page);
  await expectNoAxeViolationsHere(page, "Pia's activity");
  await expectNoOverflow(page);
  // A grantee's GET /v1/children would have audited a read of Sol; the page never makes it.
  const after = await apiActivity(page);
  expect(after.items.map((item) => item.id)).toEqual(before.items.map((item) => item.id));
});

test("Load more reads the next page through the browser, says it is loading, and says what to do when it fails", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, { label: "activity-pages" });
  lastSignIn = Date.now();
  if (account === null) {
    await page.goto("/activity");
    await expectFailedRead(page);
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin" });
  // Each export writes one row; more of them than a page holds give the list a second page.
  for (let made = 0; made < PAGE_SIZE + 5; made += 1) {
    const exported = await page.request.get("/api/v1/me/export");
    expect(exported.status(), "an export right after signing in").toBe(200);
  }
  const { items: all } = await apiActivity(page);
  expect(all.length).toBeGreaterThan(PAGE_SIZE);

  await page.goto("/activity");
  const drawn = list(page).locator("li");
  await expect(drawn).toHaveCount(PAGE_SIZE);
  await expect(rows(page, "Requested a copy of your data", "by you").first()).toBeVisible();
  const more = page.getByRole("button", { name: "Load more" });
  const width = (await more.boundingBox())?.width ?? 0;

  // Pending: the browser's call is held, the button keeps its width and says what is happening.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const queries: string[] = [];
  await page.route(NEXT_PAGE, async (route: Route) => {
    queries.push(new URL(route.request().url()).search);
    await held;
    await route.continue();
  });
  await more.click();
  const busy = page.getByRole("button", { name: "Loading" });
  await expect(busy).toHaveAttribute("aria-busy", "true");
  expect(Math.abs(((await busy.boundingBox())?.width ?? 0) - width)).toBeLessThan(1);
  await expectNoAxeViolationsHere(page, "Load more while it waits");
  await expectNoOverflow(page);
  await expect(busy).toHaveAttribute("aria-busy", "true");
  release();
  await expect(drawn).toHaveCount(all.length);
  await expect(drawn.nth(PAGE_SIZE)).toBeFocused();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(queries).toHaveLength(1);
  expect(queries[0]).toMatch(new RegExp(`^\\?cursor=[A-Za-z0-9_-]+&limit=${PAGE_SIZE}$`));
  await page.unroute(NEXT_PAGE);
  const days = await daysDrawn(page);
  expect(days, "newest first across the pages").toEqual([...days].sort().reverse());
  await expectNoHealthContent(page);
  // The end of the list, with focus on the first new row and the button gone.
  await expectNoAxeViolationsHere(page, "the end of the list");
  await expectNoOverflow(page);
  await expect(drawn.nth(PAGE_SIZE)).toBeFocused();

  // A failed page: the sentence says what to do next and the button stays for the retry.
  await page.reload();
  await expect(drawn).toHaveCount(PAGE_SIZE);
  await page.route(NEXT_PAGE, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      body: JSON.stringify({ type: "about:blank", title: "Internal error", status: 500 }),
    }),
  );
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("We could not load more activity. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toBeEnabled();
  await expect(drawn).toHaveCount(PAGE_SIZE);
  await expectNoAxeViolationsHere(page, "the failed Load more");
  await expectNoOverflow(page);
  await page.unroute(NEXT_PAGE);

  // No answer at all: the connection.
  await page.route(NEXT_PAGE, (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(
    page.getByText("We could not reach Tidefern. Check your connection and try again."),
  ).toBeVisible();
  await page.unroute(NEXT_PAGE);

  // The retry reads the real page.
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(drawn).toHaveCount(all.length);
  await expect(page.getByRole("status")).toHaveCount(0);
});

// Changed on purpose when task C7 began auditing sign-ins: this test first showed a fresh
// onboarded account's empty state, which a signed-in person can no longer reach, because the
// sign-in that let her in is itself a row. The empty state stays covered by the list's own
// component test (activity-list.test.tsx); here a fresh account's real sign-ins and the device
// it signs out are its rows.
test("a fresh account's own sign-ins and the device it signed out are its only rows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const account = await freshAccount(page, { label: "activity-sign-ins" });
  lastSignIn = Date.now();
  if (account === null) {
    await page.goto("/activity");
    await expectFailedRead(page);
    return;
  }
  await onboard(page, { stage: "none", timeZone: "America/New_York" });
  const first = await apiActivity(page);
  expect(first.items.map((item) => item.action)).toEqual(["session.sign_in"]);
  await page.goto("/activity");
  await expect(list(page).locator("li")).toHaveCount(1);
  await expect(
    rows(page, "Signed in", "by you", dayIn(first.zone, first.items[0]?.occurredAt ?? "")),
  ).toHaveCount(1);
  await expect(page.getByText("No activity yet")).toHaveCount(0);

  // A second device signs in, then signs the first one out.
  const firstDevice = await page.context().cookies();
  await page.context().clearCookies();
  const second = await signInAccount(page, account);
  lastSignIn = Date.now();
  expect(second).not.toBeNull();
  const origin = baseOrigin();
  const revoked = await page.request.post(`${origin}/api/auth/revoke-other-sessions`, {
    data: {},
    headers: { origin },
  });
  expect(revoked.status()).toBe(200);

  const { zone, items } = await apiActivity(page);
  expect(items.map((item) => item.action)).toEqual([
    "session.revoke",
    "session.sign_in",
    "session.sign_in",
  ]);
  await page.goto("/activity");
  await expect(list(page).locator("li")).toHaveCount(3);
  // One device went; the row's words claim no number of devices either way.
  await expect(
    rows(page, "Signed out elsewhere", "by you", dayIn(zone, items[0]?.occurredAt ?? "")),
  ).toHaveCount(1);
  await expect(rows(page, "Signed in", "by you")).toHaveCount(2);
  const days = await daysDrawn(page);
  expect(days, "newest first").toEqual([...days].sort().reverse());
  await expectNoAxeViolationsHere(page, "a fresh account's sign-ins");
  await expectNoOverflow(page);

  // The first device's session went with the sign-out.
  await page.context().clearCookies();
  await page.context().addCookies(firstDevice);
  expect((await page.request.get(`${origin}/api/v1/me`)).status()).toBe(401);
});

test("a long unbroken display name breaks inside its row at every width, as who did it and as whose records", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const owner = await freshAccount(page, { label: "activity-long-owner" });
  lastSignIn = Date.now();
  if (owner === null) {
    await page.goto("/activity");
    await expectFailedRead(page);
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: LONG_NAMES.owner });
  const ownerId = await myId(page);
  const ownerDevice = await page.context().cookies();

  await page.context().clearCookies();
  const partner = await freshAccount(page, { label: "activity-long-partner" });
  lastSignIn = Date.now();
  if (partner === null) throw new Error("the second fresh account found no database");
  await onboard(page, {
    stage: "none",
    timeZone: "Europe/Berlin",
    displayName: LONG_NAMES.partner,
  });
  const partnerId = await myId(page);
  const partnerDevice = await page.context().cookies();
  const origin = baseOrigin();

  // She invites him into her household, and he accepts with the link's token.
  await useDevice(page, ownerDevice);
  const invited = await page.request.post(`${origin}/api/v1/sharing/invitations`, {
    data: { inviteeEmail: partner.email, role: "partner" },
    headers: { origin, "idempotency-key": randomUUID() },
  });
  expect(invited.status(), "the invitation").toBe(201);
  const token = await invitationToken(page, partner.email);
  await useDevice(page, partnerDevice);
  const accepted = await page.request.post(`${origin}/api/v1/sharing/invitations/accept`, {
    data: { token },
    headers: { origin, "idempotency-key": randomUUID() },
  });
  expect(accepted.status(), "the acceptance").toBe(200);

  // She shares her cycle history with him, and his read of it is a row for each of them.
  await useDevice(page, ownerDevice);
  const shared = await page.request.put(`${origin}/api/v1/sharing/grants/${partnerId}`, {
    data: {
      grants: [{ category: "cycle.history", level: "read" }],
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    },
    headers: { origin },
  });
  expect(shared.status(), "the grant").toBe(200);
  await useDevice(page, partnerDevice);
  const read = await page.request.get(`${origin}/api/v1/cycle/predictions?subject=${ownerId}`);
  expect(read.status(), "his read of her cycle history").toBe(200);

  // His page names her as whose records he viewed.
  await page.goto("/activity");
  await expect(rows(page, `Viewed ${LONG_NAMES.owner}'s cycle history`, "by you")).toHaveCount(1);
  await expectWordsInsideRows(page);
  await expectNoOverflow(page);
  await expectNoAxeViolationsHere(page, "the owner's long name in the partner's row");

  // Hers names him as who viewed them.
  await useDevice(page, ownerDevice);
  await page.goto("/activity");
  await expect(rows(page, "Viewed your cycle history", `by ${LONG_NAMES.partner}`)).toHaveCount(1);
  await expectWordsInsideRows(page);
  await expectNoOverflow(page);
  await expectNoAxeViolationsHere(page, "the partner's long name in the owner's row");
});

test("the populated page has no axe violations in either theme at 1440 and 390", async ({
  page,
}) => {
  const cookies = await as(page, "noor");
  await page.goto("/activity");
  if (cookies === null) {
    await expectFailedRead(page);
  } else {
    await expect(list(page).locator("li").first()).toBeVisible();
    await expectWordsInsideRows(page);
  }
  await expectNoAxeViolationsHere(page, cookies === null ? "the failed read" : "Noor's activity");
  await expectNoOverflow(page);
});
