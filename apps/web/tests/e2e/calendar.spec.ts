import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { addDays } from "@tidefern/core";
import { formatChildAge } from "../../src/lib/child-age";
import type { Theme } from "./axe";
import { baseOrigin, freshAccount, onboard, signInAs, type FreshAccount } from "./session";

/**
 * The calendar and the day page against the production build (task H3):
 * Noor's seeded October drawn and said as the API predicts it, the list
 * view, the day sheet over the calendar and its keyboard path, a real save
 * and its Undo on a fresh account, the first guess and not enough regular
 * cycles on that account, the pending and failure states through
 * `page.route`, the stages that log nothing or predict nothing, /log/<date>
 * with and without JavaScript, and the not-found page inside the shell.
 *
 * The seeded personas are only read: every write lands on a fresh account
 * of the spec's own (one sign-up for the file), and the writes that must
 * fail are answered by `page.route` before they leave the browser. Dates
 * that follow from today are read from the API at run time (`today` on GET
 * /api/v1/me); the seeded October facts are fixed by the seed itself
 * (packages/db README, "The cast"). Against a server without a database the
 * session helpers hand back null and the canned cookie, and each test
 * asserts the page's honest failed read instead. Nothing here is tagged
 * @smoke.
 */

const CONTRACEPTION = "An estimate from your logged dates. Not a form of contraception.";
const FOOTER =
  "Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis or treatment, and is not a form of birth control. Talk with your doctor or midwife before making health decisions.";
const NOT_ENOUGH =
  "Your recent cycles have been too different from each other to estimate a date. Keep logging and this will update.";
const CALENDAR_FAILED = "We could not load your calendar. Try again.";
const DAY_FAILED = "We could not load this day. Try again.";

/** Noor's October as the seed writes it: periods from Aug 8, Sep 5 and Oct 3, 28 days apart. */
const NOOR_OCTOBER = "/calendar?month=2026-10";

interface Prediction {
  basis: "none" | "first_guess" | "estimate" | "not_enough_regular_cycles";
  sampleSize: number;
  uncertaintyDays: number;
  nextPeriod: { expected: string; start: string; end: string } | null;
  ovulation: { expected: string; start: string; end: string } | null;
  fertileWindow: { start: string; end: string } | null;
}

interface EntryList {
  items: { date?: string; flow?: string | null; mood?: string | null; deletedAt: string | null }[];
}

/* ------------------------------------------------------------------------ */
/* Dates, worded the way the page words them (en-US, read as UTC days)       */
/* ------------------------------------------------------------------------ */

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "Monday, October 5, 2026": the grid's day names. */
function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
}

/** "Monday, Oct 5": the sheet's title and the saved line. */
function sheetDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
}

/** "Oct 5" */
function shortDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
}

/** "Oct 15 to 19", or "Sep 29 to Oct 2" across months. */
function span(start: string, end: string): string {
  if (start === end) return shortDay(start);
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${shortDay(start)} to ${Number(end.slice(8, 10))}`
    : `${shortDay(start)} to ${shortDay(end)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A day's button in the month grid, today's included. */
function dayButton(page: Page, date: string): Locator {
  return page
    .getByRole("grid")
    .getByRole("button", { name: new RegExp(`^(Today, )?${escapeRegExp(longDate(date))}(,|$)`) });
}

/* ------------------------------------------------------------------------ */
/* Reads and writes through the API, as the signed-in page                   */
/* ------------------------------------------------------------------------ */

async function apiGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${baseOrigin()}${path}`);
  expect(response.status(), path).toBe(200);
  return (await response.json()) as T;
}

/** One day written the way the sheet writes it: all three fields, with the Origin the API checks. */
async function putDay(page: Page, date: string, body: Record<string, unknown>): Promise<void> {
  const origin = baseOrigin();
  const response = await page.request.put(`${origin}/api/v1/cycle/entries/${date}`, {
    data: { flow: null, symptoms: [], mood: null, ...body },
    headers: { origin },
  });
  expect(response.status(), `PUT ${date}`).toBe(200);
}

async function deleteDay(page: Page, date: string): Promise<void> {
  const origin = baseOrigin();
  const response = await page.request.delete(`${origin}/api/v1/cycle/entries/${date}`, {
    headers: { origin },
  });
  expect([204, 404], `DELETE ${date}`).toContain(response.status());
}

async function liveEntries(page: Page, date: string) {
  const list = await apiGet<EntryList>(page, `/api/v1/cycle/entries?from=${date}&to=${date}`);
  return list.items.filter((item) => item.deletedAt === null);
}

/* ------------------------------------------------------------------------ */
/* Sessions                                                                   */
/* ------------------------------------------------------------------------ */

interface Fresh {
  account: FreshAccount;
  today: string;
}

/** The file's own onboarded cycle account: one sign-up for every test that writes. */
let fresh: Fresh | null | undefined;

async function freshSession(page: Page): Promise<Fresh | null> {
  if (fresh === null || fresh === undefined) {
    const made = await freshAccount(page, { label: "calendar" });
    if (made === null) {
      fresh = null;
      return null;
    }
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Sam" });
    const me = await apiGet<{ today: string }>(page, "/api/v1/me");
    fresh = { account: made, today: me.today };
    return fresh;
  }
  await page.context().addCookies(fresh.account.cookies);
  return fresh;
}

/* ------------------------------------------------------------------------ */
/* Shared expectations                                                        */
/* ------------------------------------------------------------------------ */

/** The calendar's failed read, under the shell's own notice: what happened and Try again. */
async function expectCalendarFailure(page: Page) {
  await expect(page.getByText(/could not load your profile just now/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expect(page.getByText(CALENDAR_FAILED)).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
}

async function expectNoOverflow(page: Page, what: string) {
  const restore = page.viewportSize() ?? { width: 1440, height: 900 };
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${what} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize(restore);
}

/** Axe with the wcag22aa tag set, in the theme the product would draw, on the page as it is now. */
async function expectAxeClean(page: Page, theme: Theme, what: string) {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, `${what} in ${theme}`).toEqual([]);
}

/** Holds a route until the test lets it go, so a pending state stays on screen. */
function holdRoute(): { handler: (route: Route) => Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    handler: async (route) => {
      await held;
      await route.continue();
    },
    release,
  };
}

const problem = (status: number) => ({
  status,
  contentType: "application/problem+json",
  body: JSON.stringify({ type: "about:blank", title: "Refused in the test", status }),
});

/* ------------------------------------------------------------------------ */
/* Noor, read only                                                           */
/* ------------------------------------------------------------------------ */

test("Noor's October: the logged period, the expected band and the fertile window by name, and the 13.10 sentences", async ({
  page,
}) => {
  const session = await signInAs(page, "noor");
  await page.goto(NOOR_OCTOBER);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  await expect(page).toHaveTitle("Calendar | Tidefern");
  const me = await apiGet<{ today: string }>(page, "/api/v1/me");
  // The seed's prediction: two 28-day cycles, the next start between Oct 28 and Nov 3.
  const prediction = await apiGet<Prediction>(page, "/api/v1/cycle/predictions");
  expect(prediction.basis).toBe("estimate");
  expect(prediction.nextPeriod).toEqual({
    expected: "2026-10-31",
    start: "2026-10-28",
    end: "2026-11-03",
  });

  const grid = page.getByRole("grid", { name: "October 2026" });
  await expect(grid).toBeVisible();
  for (const date of ["2026-10-03", "2026-10-04"]) {
    const logged = dayButton(page, date);
    await expect(logged).toHaveAccessibleName(
      new RegExp(`^(Today, )?${escapeRegExp(longDate(date))}, period logged, `),
    );
    await expect(logged.locator("xpath=ancestor::td")).toHaveClass(/logged/);
  }
  for (const date of ["2026-10-28", "2026-10-30", "2026-10-31"]) {
    await expect(dayButton(page, date)).toHaveAccessibleName(`${longDate(date)}, period expected`);
    await expect(dayButton(page, date).locator("xpath=ancestor::td")).toHaveClass(/predicted/);
  }
  for (const date of ["2026-10-12", "2026-10-14"]) {
    await expect(dayButton(page, date)).toHaveAccessibleName(
      `${longDate(date)}, fertile window estimated. ${CONTRACEPTION}`,
    );
    await expect(dayButton(page, date).locator("xpath=ancestor::td")).toHaveClass(/estimated/);
  }
  await expect(dayButton(page, "2026-10-17")).toHaveAccessibleName(/ovulation estimated$/);
  await expect(dayButton(page, me.today)).toHaveAccessibleName(
    new RegExp(`^Today, ${escapeRegExp(longDate(me.today))}`),
  );
  await expect(page.getByRole("list", { name: "Key" })).toContainText("Logged");

  const estimate = page.getByText(
    "Based on your last 2 cycles, your next period will likely start between Oct 28 and Nov 3.",
  );
  await expect(estimate).toBeVisible();
  await expect(estimate).toHaveClass(/estimate/);
  await expect(
    page.getByText(
      `Ovulation is estimated around Oct 17 (Oct 15 to 19). Oct 12 to 17 are the days pregnancy is most likely. ${CONTRACEPTION}`,
    ),
  ).toBeVisible();
  await expect(page.getByText(FOOTER)).toBeVisible();
  await expect(page.getByText("This is worth mentioning to your doctor or midwife.")).toHaveCount(
    0,
  );
});

test("a month change is an address, its wait shows on the grid, and Nothing logged this month sits outside it", async ({
  page,
}) => {
  const session = await signInAs(page, "noor");
  await page.goto(NOOR_OCTOBER);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  // Hold the server render of the next month so its wait is on screen.
  const hold = holdRoute();
  const november = (url: URL) =>
    url.pathname === "/calendar" && url.searchParams.get("month") === "2026-11";
  await page.route(november, hold.handler);
  await page.getByRole("button", { name: "Next month" }).click();
  const busy = page.locator('[aria-busy="true"]').filter({ has: page.getByRole("grid") });
  await expect(busy).toBeVisible();
  await expect(busy.getByText("Loading")).toBeVisible();
  hold.release();
  await expect(page.getByRole("grid", { name: "November 2026" })).toBeVisible();
  await expect(page).toHaveURL(/\/calendar\?month=2026-11$/);
  await page.unroute(november, hold.handler);

  // November holds the end of the expected band and nothing logged.
  await expect(dayButton(page, "2026-11-02")).toHaveAccessibleName(
    `${longDate("2026-11-02")}, period expected`,
  );
  const empty = page.getByRole("region", { name: "Nothing logged this month" });
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("Days you log show here with their flow and symptoms.");
  await expect(empty.getByRole("button", { name: "Log today" })).toBeVisible();
  expect(await page.getByRole("grid").locator("section").count()).toBe(0);

  // Today comes back to today's month.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeDisabled();
});

test("the list view: this week's strip with today on warmth over the month's days newest first", async ({
  page,
}) => {
  const session = await signInAs(page, "noor");
  await page.goto(NOOR_OCTOBER);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const me = await apiGet<{ today: string }>(page, "/api/v1/me");
  await page.getByRole("radio", { name: "List" }).check();
  // The switch swaps the view in place and keeps it in the address for a reload; no navigation.
  await expect(page).toHaveURL(/\/calendar\?view=list$/);
  await expect(page.getByRole("grid")).toHaveCount(0);

  const strip = page.getByRole("list", { name: "This week" });
  await expect(strip.getByRole("listitem")).toHaveCount(7);
  const todayCell = strip.locator('[aria-current="date"]');
  await expect(todayCell).toContainText(String(Number(me.today.slice(8, 10))));
  const warmth = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--warmth)";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  await expect(todayCell).toHaveCSS("background-color", warmth);

  const rows = page.getByRole("list", { name: "Days logged in October 2026" }).getByRole("link");
  const hrefs = await rows.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  // Newest first; the seeded rows are asserted by presence and order, never by count.
  const seeded = ["/log/2026-10-05", "/log/2026-10-04", "/log/2026-10-03", "/log/2026-10-01"];
  expect(hrefs.filter((href) => seeded.includes(href ?? ""))).toEqual(seeded);
  await expect(page.locator('a[href="/log/2026-10-04"]')).toContainText(
    "Heavy flow, cramps, fatigue, note",
  );
  await expect(page.locator(`a[href="/log/${me.today}"]`)).toContainText("Today");

  // A reload keeps the list.
  await page.reload();
  await expect(page.getByRole("radio", { name: "List" })).toBeChecked();
  await expect(page.getByRole("heading", { level: 2, name: "October 2026" })).toBeVisible();
});

test("a day's sheet over the calendar: focus moves in, Escape closes it and focus returns to the day", async ({
  page,
}) => {
  const session = await signInAs(page, "noor");
  await page.goto(NOOR_OCTOBER);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  // From the keyboard: Oct 5's button, one day back with the arrow key, Enter.
  await dayButton(page, "2026-10-05").focus();
  await page.keyboard.press("ArrowLeft");
  const trigger = dayButton(page, "2026-10-04");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog", { name: "Sunday, Oct 4" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" }).first()).toBeFocused();
  // The day as the API has it, loaded by the sheet.
  await expect(sheet.getByRole("radio", { name: "Heavy" })).toBeChecked();
  await expect(sheet.getByRole("button", { name: "Cramps" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(sheet.getByRole("textbox", { name: "Private note" })).toHaveValue(
    /^Slept badly; the cramps woke me twice\./,
  );
  await expect(page).toHaveURL(/\/calendar\?month=2026-10$/);

  // A dialog from 1024 px: centered and narrower than the page.
  const box = await sheet.boundingBox();
  expect(box && box.width <= 560 && box.y > 0 && box.y + box.height < 900).toBe(true);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  // On a phone the same day is a bottom sheet along the bottom edge.
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  const phone = await sheet.boundingBox();
  expect(phone && Math.round(phone.y + phone.height) === 844 && phone.width === 390).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("a list row opens its day in the sheet instead of leaving the calendar", async ({ page }) => {
  const session = await signInAs(page, "noor");
  await page.goto(`${NOOR_OCTOBER}&view=list`);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const row = page.locator('a[href="/log/2026-10-04"]');
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Sunday, Oct 4" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Heavy" })).toBeChecked();
  await expect(page).toHaveURL(/\/calendar\?month=2026-10&view=list$/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(row).toBeFocused();
});

test("a day that has not come opens no sheet and says why", async ({ page }) => {
  const session = await signInAs(page, "noor");
  await page.goto(NOOR_OCTOBER);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  await dayButton(page, "2026-10-30").click();
  await expect(page.getByText("You can log a day once it has come.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

/* ------------------------------------------------------------------------ */
/* A fresh account: the writes                                                */
/* ------------------------------------------------------------------------ */

test("a real save on a fresh account: Saved with Undo, the dot on the calendar, and Undo takes it back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const session = await freshSession(page);
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const { today } = session;
  const todayButton = dayButton(page, today);
  await expect(todayButton).toHaveAccessibleName(`Today, ${longDate(today)}`);
  const empty = page.getByRole("region", { name: "Nothing logged this month" });
  await expect(empty).toBeVisible();
  await empty.getByRole("button", { name: "Log today" }).click();

  const sheet = page.getByRole("dialog", { name: sheetDate(today) });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: "Low" }).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText(`Saved for ${sheetDate(today)}.`)).toBeVisible();
  // The calendar beneath read the day again: today now names what was saved, and the empty state went.
  await expect(todayButton).toHaveAccessibleName(`Today, ${longDate(today)}, low mood`);
  await expect(empty).toBeHidden();
  expect(await liveEntries(page, today)).toEqual([expect.objectContaining({ mood: "low" })]);

  await sheet.getByRole("button", { name: "Undo" }).click();
  await expect(sheet.getByText(`Changes undone for ${sheetDate(today)}.`)).toBeVisible();
  await expect(todayButton).toHaveAccessibleName(`Today, ${longDate(today)}`);
  expect(await liveEntries(page, today)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(empty).toBeVisible();
});

test("the sheet's load: Loading while the day arrives, and a failed load says so with Try again", async ({
  page,
}) => {
  const session = await freshSession(page);
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const day = addDays(session.today, -1);
  const entriesOfDay = `**/api/v1/cycle/entries?from=${day}&to=${day}`;
  const sheet = page.getByRole("dialog", { name: sheetDate(day) });

  const hold = holdRoute();
  await page.route(entriesOfDay, hold.handler);
  await dayButton(page, day).click();
  await expect(sheet.getByText("Loading")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save" })).toHaveCount(0);
  hold.release();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  await page.unroute(entriesOfDay);
  await page.keyboard.press("Escape");

  await page.route(entriesOfDay, (route) => route.fulfill(problem(500)));
  await dayButton(page, day).click();
  await expect(sheet.getByText(DAY_FAILED)).toBeVisible();
  await page.unroute(entriesOfDay);
  await sheet.getByRole("button", { name: "Try again" }).click();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a save: Saving at the same width, then a failure, a conflict and a note that failed, each under its part", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const session = await freshSession(page);
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const day = addDays(session.today, -2);
  const write = `**/api/v1/cycle/entries/${day}`;
  try {
    await dayButton(page, day).click();
    const sheet = page.getByRole("dialog", { name: sheetDate(day) });
    const save = sheet.getByRole("button", { name: "Save" });
    await expect(save).toBeVisible();
    await sheet.getByRole("radio", { name: "Bright" }).check();

    // Pending: the write is held, Save reads Saving where it stood and keeps focus; nothing
    // else changes until the answer (its width is the next test's).
    let answer: (status: number) => void = () => {};
    const answered = new Promise<number>((resolve) => {
      answer = resolve;
    });
    await page.route(write, async (route) => route.fulfill(problem(await answered)));
    // Measured where the press happens: a click first scrolls its target into view.
    await save.scrollIntoViewIfNeeded();
    const before = await save.boundingBox();
    await save.click();
    const saving = sheet.getByRole("button", { name: "Saving" });
    await expect(saving).toBeVisible();
    await expect(saving).toBeFocused();
    const during = await saving.boundingBox();
    expect(during?.x).toBe(before?.x);
    expect(during?.y).toBe(before?.y);
    await expect(sheet.getByRole("radio", { name: "Bright" })).toBeChecked();
    answer(500);
    await expect(sheet.getByText("We could not save this day. Try again.")).toBeVisible();
    // Her choice stays for Try again.
    await expect(sheet.getByRole("radio", { name: "Bright" })).toBeChecked();
    expect(await liveEntries(page, day)).toEqual([]);
    await page.unroute(write);

    // A version conflict reads the day again and says what to do.
    await page.route(write, (route) => route.fulfill(problem(409)));
    await sheet.getByRole("button", { name: "Try again" }).click();
    await expect(
      sheet.getByText("This day was changed somewhere else. Try again to save your version."),
    ).toBeVisible();
    await page.unroute(write);

    // The entry saves for real; the note's own write fails and is said under the note.
    await page.route("**/api/v1/notes", (route) =>
      route.request().method() === "POST" ? route.fulfill(problem(500)) : route.continue(),
    );
    await sheet.getByRole("textbox", { name: "Private note" }).fill("A line for the test.");
    await sheet.getByRole("button", { name: "Try again" }).first().click();
    await expect(sheet.getByText("We could not save your note. Try again.")).toBeVisible();
    await expect(sheet.getByText("We could not save this day. Try again.")).toHaveCount(0);
    await expect(sheet.getByRole("textbox", { name: "Private note" })).toHaveValue(
      "A line for the test.",
    );
    expect(await liveEntries(page, day)).toEqual([expect.objectContaining({ mood: "bright" })]);
    await page.unroute("**/api/v1/notes");
    await page.keyboard.press("Escape");
  } finally {
    await deleteDay(page, day);
  }
});

test("Save keeps its width while it reads Saving", async ({ page }) => {
  const session = await freshSession(page);
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  // DESIGN.md 5.1 step 6 and the voice table: a pending control keeps its width. The shared Button
  // (components/ui/button.tsx) renders its loading text only while loading, so the wider "Saving"
  // widens "Save" by the width of its last three letters. This records the defect until the Button
  // is fixed (a request to the lead in the H3 report); once it is, this test passes, Playwright
  // fails it for passing, and the line below goes. Nothing is written: the save is held, then refused.
  test.fail(true, "the shared Button grows from Save to Saving");
  const day = addDays(session.today, -2);
  const write = `**/api/v1/cycle/entries/${day}`;
  await dayButton(page, day).click();
  const sheet = page.getByRole("dialog", { name: sheetDate(day) });
  const save = sheet.getByRole("button", { name: "Save" });
  await expect(save).toBeVisible();
  await sheet.getByRole("radio", { name: "Steady" }).check();
  let refuse: () => void = () => {};
  const refused = new Promise<void>((resolve) => {
    refuse = resolve;
  });
  await page.route(write, async (route) => {
    await refused;
    await route.fulfill(problem(500));
  });
  await save.scrollIntoViewIfNeeded();
  const idle = (await save.boundingBox())?.width ?? 0;
  await save.click();
  const saving = sheet.getByRole("button", { name: "Saving" });
  await expect(saving).toBeVisible();
  const pending = (await saving.boundingBox())?.width ?? 0;
  refuse();
  await expect(sheet.getByText("We could not save this day. Try again.")).toBeVisible();
  await page.unroute(write);
  expect(await liveEntries(page, day)).toEqual([]);
  expect(Math.abs(pending - idle), `Save ${idle}px, Saving ${pending}px`).toBeLessThanOrEqual(1);
});

test("a first guess and then not enough regular cycles, each said honestly with the footer", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const session = await freshSession(page);
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const first = addDays(session.today, -10);
  const earlier = addDays(first, -12);
  try {
    // One period start: a first guess, give or take 4 days.
    await putDay(page, first, { flow: "light" });
    const guess = await apiGet<Prediction>(page, "/api/v1/cycle/predictions");
    expect(guess.basis).toBe("first_guess");
    const { nextPeriod, ovulation, fertileWindow } = guess;
    if (nextPeriod === null || ovulation === null || fertileWindow === null) {
      throw new Error("a first guess carries its dates");
    }
    await page.goto(`/calendar?month=${nextPeriod.start.slice(0, 7)}`);
    await expect(
      page.getByText(
        `Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around ${shortDay(nextPeriod.expected)}, give or take ${guess.uncertaintyDays} days.`,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Ovulation is estimated around ${shortDay(ovulation.expected)} (${span(ovulation.start, ovulation.end)}). ${span(fertileWindow.start, fertileWindow.end)} are the days pregnancy is most likely. ${CONTRACEPTION}`,
      ),
    ).toBeVisible();
    await expect(dayButton(page, nextPeriod.start)).toHaveAccessibleName(/period expected$/);
    await expect(dayButton(page, nextPeriod.end)).toHaveAccessibleName(/period expected$/);
    await expect(page.getByText(FOOTER)).toBeVisible();

    // A second start 12 days earlier: no cycle in the 21 to 45 day range, so no date at all.
    await putDay(page, earlier, { flow: "light" });
    const unsure = await apiGet<Prediction>(page, "/api/v1/cycle/predictions");
    expect(unsure.basis).toBe("not_enough_regular_cycles");
    await page.goto(`/calendar?month=${nextPeriod.start.slice(0, 7)}`);
    await expect(page.getByText(NOT_ENOUGH)).toBeVisible();
    await expect(page.getByText(/Ovulation is estimated/)).toHaveCount(0);
    await expect(
      page.getByRole("grid").getByRole("button", { name: /period expected|fertile window/ }),
    ).toHaveCount(0);
    await expect(page.getByText(FOOTER)).toBeVisible();
  } finally {
    await deleteDay(page, first);
    await deleteDay(page, earlier);
  }
});

/* ------------------------------------------------------------------------ */
/* The other stages, read only                                               */
/* ------------------------------------------------------------------------ */

test("the none stage is never asked a body question: Theo's calendar is empty, without a log action or a sheet", async ({
  page,
}) => {
  const session = await signInAs(page, "theo");
  await page.goto(NOOR_OCTOBER);
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const empty = page.getByRole("region", { name: "Nothing logged this month" });
  await expect(empty).toBeVisible();
  await expect(page.getByRole("button", { name: "Log today" })).toHaveCount(0);
  // None of Noor's days, though he reads her symptoms: the calendar is his own.
  await expect(
    page.getByRole("grid").getByRole("button", { name: /period|fertile|flow|mood|note/ }),
  ).toHaveCount(0);
  await dayButton(page, "2026-10-04").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(FOOTER)).toHaveCount(0);

  await page.getByRole("radio", { name: "List" }).check();
  await expect(page.getByText("Nothing logged yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log today" })).toHaveCount(0);

  // The day page is not his either.
  await page.goto("/log/2026-10-04");
  await expect(page.getByText("That page is not here.")).toBeVisible();
});

test("after a birth: Mira's calendar shows the child's age and the quiet card, and no prediction", async ({
  page,
}) => {
  const session = await signInAs(page, "mira");
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  const me = await apiGet<{ today: string }>(page, "/api/v1/me");
  const children = await apiGet<{ items: { displayName: string; dateOfBirth: string }[] }>(
    page,
    "/api/v1/children",
  );
  const ilo = children.items.find((child) => child.displayName === "Ilo");
  if (ilo === undefined) throw new Error("the seed's Ilo is missing");
  const age = formatChildAge(ilo.dateOfBirth, me.today);
  await expect(page.getByText(`Ilo, ${age.charAt(0).toLowerCase()}${age.slice(1)}`)).toBeVisible();

  const card = page.getByRole("region", { name: "When you are ready" });
  await expect(card).toContainText("Predictions are paused until a period is logged.");
  await expect(card.getByRole("button", { name: "Log a period when it comes" })).toBeVisible();
  await expect(page.getByText(FOOTER)).toHaveCount(0);
  await expect(
    page.getByRole("grid").getByRole("button", { name: /period expected|fertile window/ }),
  ).toHaveCount(0);
  // Her week starts on Sunday.
  await expect(page.getByRole("grid").locator("th").first()).toHaveText("Su");
});

test("during a pregnancy: Lena's calendar offers no prediction", async ({ page }) => {
  const session = await signInAs(page, "lena");
  await page.goto("/calendar");
  if (session === null) {
    await expectCalendarFailure(page);
    return;
  }
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.getByText(FOOTER)).toHaveCount(0);
  await expect(page.getByText(/your next period/)).toHaveCount(0);
  await expect(
    page.getByRole("grid").getByRole("button", { name: /period expected|fertile window/ }),
  ).toHaveCount(0);
});

/* ------------------------------------------------------------------------ */
/* The day page                                                              */
/* ------------------------------------------------------------------------ */

test("/log/<date> for a seeded day: its entry and its notes, the date only in the path, the days as links", async ({
  page,
}) => {
  const session = await signInAs(page, "noor");
  await page.goto("/log/2026-10-04");
  if (session === null) {
    await expect(page.getByRole("heading", { level: 1, name: "Sunday, Oct 4" })).toBeVisible();
    await expect(page.getByText(DAY_FAILED)).toBeVisible();
    return;
  }
  await expect(page).toHaveTitle("Log a day | Tidefern");
  for (const selector of ['link[rel="canonical"]', 'meta[property="og:url"]']) {
    const value = await page
      .locator(selector)
      .getAttribute(selector.startsWith("link") ? "href" : "content");
    expect(value, selector).toMatch(/\/log$/);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Sunday, Oct 4" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Heavy" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Fatigue" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "Private note" })).toHaveValue(
    /^Slept badly; the cramps woke me twice\./,
  );
  await expect(page.getByRole("link", { name: "Previous day" })).toHaveAttribute(
    "href",
    "/log/2026-10-03",
  );
  await expect(page.getByRole("link", { name: "Next day" })).toHaveAttribute(
    "href",
    "/log/2026-10-05",
  );
  // The shell marks Calendar: the day page belongs to it.
  await expect(
    page.locator("nav[aria-label='Main']").first().getByRole("link", { name: "Calendar" }),
  ).toHaveAttribute("aria-current", "page");

  // Oct 5 carries a shared note: read-only under who can read it, never under "Only you can read this."
  const me = await apiGet<{ today: string }>(page, "/api/v1/me");
  await page.goto("/log/2026-10-05");
  const shared = page.getByRole("list", { name: "Notes on this day" }).getByRole("listitem");
  await expect(shared).toContainText("Shared with people who can see your symptoms");
  await expect(shared).toContainText("Steadier today. Sharing this one.");
  await expect(shared).not.toContainText("Only you can read this.");
  if (me.today === "2026-10-05") {
    // Today: there is no next day yet.
    await expect(page.getByRole("link", { name: "Next day" })).toHaveCount(0);
  }
});

test("/log/<date> for a day with nothing logged opens empty", async ({ page }) => {
  const session = await signInAs(page, "noor");
  await page.goto("/log/2026-09-25");
  if (session === null) {
    await expect(page.getByText(DAY_FAILED)).toBeVisible();
    return;
  }
  await expect(page.getByRole("heading", { level: 1, name: "Friday, Sep 25" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Period" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  for (const name of ["None", "Spotting", "Light", "Medium", "Heavy", "Low", "Steady", "Bright"]) {
    await expect(page.getByRole("radio", { name })).not.toBeChecked();
  }
  await expect(page.getByRole("textbox", { name: "Private note" })).toHaveValue("");
  await expect(page.getByRole("link", { name: "Close" }).first()).toHaveAttribute(
    "href",
    "/calendar?month=2026-09",
  );
});

test("a path that is not a calendar date, or a day that has not come, is not a page: the not-found text inside the shell", async ({
  page,
}) => {
  await signInAs(page, "noor");
  for (const path of ["/log/not-a-date", "/log/2026-02-30", "/log/2026-12-31"]) {
    await page.goto(path);
    if (path === "/log/2026-12-31") {
      // A real date: on a server without a database the session read fails before today is known.
      const failed = page.getByText(DAY_FAILED);
      if (await failed.isVisible()) continue;
    }
    await expect(page.getByText("That page is not here."), path).toBeVisible();
    await expect(page.locator("nav[aria-label='Main']").first(), path).toBeVisible();
    await expect(page.getByRole("banner"), path).toHaveCount(0);
  }
});

test("without JavaScript /log/<date> still reads the day, and its form can never put a value in the address", async ({
  page,
  browser,
}) => {
  const session = await signInAs(page, "noor");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: test.info().project.use.baseURL,
  });
  try {
    await context.addCookies(await page.context().cookies());
    const plain = await context.newPage();
    await plain.goto("/log/2026-10-04");
    await expect(plain.getByRole("heading", { level: 1, name: "Sunday, Oct 4" })).toBeVisible();
    if (session === null) {
      await expect(plain.getByText(DAY_FAILED)).toBeVisible();
      return;
    }
    await expect(plain.locator('input[type="radio"][value="heavy"]')).toBeChecked();
    await expect(plain.locator("textarea")).toHaveValue(/^Slept badly; the cramps woke me twice\./);
    await expect(plain.getByText("Cramps", { exact: true })).toBeVisible();
    // The form posts to its own address and stays inert without scripts.
    const form = plain.locator("main form");
    await expect(form).toHaveAttribute("method", "post");
    await expect(form).toHaveAttribute("inert", "");
    await expect(plain.locator('a[href="/log/2026-10-03"]')).toBeVisible();
    await expect(plain.locator('a[href="/log/2026-10-05"]')).toBeVisible();
    expect(new URL(plain.url()).search).toBe("");
  } finally {
    await context.close();
  }
});

test("a visitor without a session is sent to sign in from the calendar and the day page", async ({
  request,
}) => {
  for (const path of ["/calendar", "/calendar?month=2026-10&view=list", "/log/2026-10-05"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toBe("/sign-in");
  }
});

/* ------------------------------------------------------------------------ */
/* Axe and reflow                                                            */
/* ------------------------------------------------------------------------ */

for (const theme of ["light", "dark"] as const) {
  test(`the month, the list, the open sheet and the day page have no axe violations in ${theme} at 1440 and 390`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const session = await signInAs(page, "noor");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(NOOR_OCTOBER);
      await expectAxeClean(page, theme, `month at ${width}`);
      if (session === null) continue;
      await page.getByRole("radio", { name: "List" }).check();
      await expect(page.getByRole("list", { name: "This week" })).toBeVisible();
      await expectAxeClean(page, theme, `list at ${width}`);
      await page.getByRole("radio", { name: "Month" }).check();
      await dayButton(page, "2026-10-04").click();
      await expect(
        page.getByRole("dialog", { name: "Sunday, Oct 4" }).getByRole("button", { name: "Save" }),
      ).toBeVisible();
      await expectAxeClean(page, theme, `open sheet at ${width}`);
      await page.goto("/log/2026-10-04");
      await expectAxeClean(page, theme, `day page at ${width}`);
    }
  });
}

test("no page state scrolls sideways at 390 or 320", async ({ page }) => {
  test.setTimeout(120_000);
  const session = await signInAs(page, "noor");
  await page.goto(NOOR_OCTOBER);
  await expectNoOverflow(page, "month");
  if (session === null) return;
  await page.goto("/calendar?month=2026-11");
  await expectNoOverflow(page, "a month with nothing logged");
  await page.goto(`${NOOR_OCTOBER}&view=list`);
  await expectNoOverflow(page, "list");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(NOOR_OCTOBER);
  await dayButton(page, "2026-10-04").click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save" })).toBeVisible();
  await expectNoOverflow(page, "open sheet");
  await page.goto("/log/2026-10-04");
  await expectNoOverflow(page, "day page");
  await page.goto("/log/2026-10-05");
  await expectNoOverflow(page, "day page with a shared note");
});

test("the none stage and the quiet card hold at 390 and 320, with no axe violations", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const persona of ["theo", "mira"] as const) {
    await page.context().clearCookies();
    const session = await signInAs(page, persona);
    await page.goto("/calendar");
    await expectNoOverflow(page, `${persona}'s calendar`);
    if (session === null) continue;
    for (const theme of ["light", "dark"] as const) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.goto("/calendar");
        await expectAxeClean(page, theme, `${persona}'s calendar at ${width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});
