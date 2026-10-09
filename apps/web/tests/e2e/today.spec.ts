import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { formatChildAge } from "../../src/lib/child-age";
import { expectNoAxeViolations, type Theme } from "./axe";
import { baseOrigin, freshAccount, onboard, signInAs, type Persona } from "./session";

/**
 * Today against the production build (task H2): every stage on the seeded
 * cast (packages/db README, "The cast"), the empty state, a save and its
 * Undo through the open card and the after-loss quiet card on fresh
 * accounts of the spec's own, and a failed save through `page.route` (a
 * server render cannot be faked, the browser's own write can). Expected
 * dates, cycle days, weeks and ages are read from the API at run time, and
 * the 13.10 sentences are written out here word for word. No seeded
 * persona is changed: Noor's day sheet is opened and closed, never saved.
 *
 * Without a database the session read fails, so each test asserts the
 * honest failure state instead (the layout's notice and the page heading).
 * Nothing here is tagged @smoke.
 */

const NOTICE =
  "We could not load your profile just now, so only the places everyone has are listed. Reload the page to try again.";
const CONTRACEPTION_LINE = "An estimate from your logged dates. Not a form of contraception.";
const FOOTER =
  "Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis or treatment, and is not a form of birth control. Talk with your doctor or midwife before making health decisions.";
const CARE = "This is worth mentioning to your doctor or midwife.";

interface Band {
  expected: string;
  start: string;
  end: string;
}

interface Prediction {
  basis: "none" | "first_guess" | "estimate" | "not_enough_regular_cycles";
  sampleSize: number;
  nextPeriod: Band | null;
  ovulation: Band | null;
  fertileWindow: { start: string; end: string } | null;
  uncertaintyDays: number;
}

interface Status {
  date: string;
  cycleDay: number | null;
  periodDay: number | null;
  inFertileWindow: boolean;
}

/* ------------------------------------------------------------------ */
/* Wording, en-US and read as UTC days like the app's own formatters    */
/* ------------------------------------------------------------------ */

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const weekdayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const day = (date: string) => dayFormat.format(utc(date));
const weekday = (date: string) => weekdayFormat.format(utc(date));
const span = (start: string, end: string) =>
  start === end
    ? day(start)
    : start.slice(0, 7) === end.slice(0, 7)
      ? `${day(start)} to ${Number(end.slice(8, 10))}`
      : `${day(start)} to ${day(end)}`;
const plural = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

function addDays(date: string, days: number): string {
  const moved = utc(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Architecture 13.10, word for word. */
function estimateSentence(prediction: Prediction): string {
  const next = prediction.nextPeriod as Band;
  if (prediction.basis === "first_guess") {
    return `Log 3 periods and Tidefern can start estimating. For now this is a rough guess: around ${day(next.expected)}, give or take ${plural(prediction.uncertaintyDays)}.`;
  }
  const cycles =
    prediction.sampleSize === 1 ? "your last cycle" : `your last ${prediction.sampleSize} cycles`;
  return `Based on ${cycles}, your next period will likely start between ${day(next.start)} and ${day(next.end)}.`;
}

function ovulationSentence(prediction: Prediction): string {
  const ovulation = prediction.ovulation as Band;
  const fertile = prediction.fertileWindow as { start: string; end: string };
  return `Ovulation is estimated around ${day(ovulation.expected)} (${span(ovulation.start, ovulation.end)}). ${span(fertile.start, fertile.end)} are the days pregnancy is most likely. ${CONTRACEPTION_LINE}`;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${baseOrigin()}${path}`);
  expect(response.ok(), `${path} answered ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

async function meToday(page: Page): Promise<string> {
  const me = await api<{ today: string }>(page, "/api/v1/me");
  return me.today;
}

/** The honest state of a server without a database: the layout's notice and the page heading. */
async function expectFailedRead(page: Page) {
  await page.goto("/today");
  await expect(page.getByText(NOTICE)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
}

/** Signs a persona in, or asserts the failure state and answers false on a server without a database. */
async function signedIn(page: Page, persona: Persona): Promise<boolean> {
  const cookies = await signInAs(page, persona);
  if (cookies !== null) return true;
  await expectFailedRead(page);
  return false;
}

const widths = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** Axe in both themes at 1440 and 390, then no sideways scroll at 390 and 320. */
async function expectAccessibleAtEveryWidth(page: Page) {
  for (const size of widths) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"] as Theme[]) {
      await expectNoAxeViolations(page, "/today", theme);
    }
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/today");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `/today at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** The shell's two navigations: the rail from 1024 px, the tab bar below it. */
function shell(page: Page) {
  const main = page.locator("nav[aria-label='Main']");
  return { rail: main.first(), bar: main.last() };
}

/** The hero: the section the page's one heading names. */
function hero(page: Page, today: string) {
  return page.getByRole("region", { name: `Today, ${weekday(today)}` });
}

/* ------------------------------------------------------------------ */
/* The seeded cast                                                      */
/* ------------------------------------------------------------------ */

test("Noor's Today: cycle day, the estimate and ovulation band, the footer and the partner card", async ({
  page,
}) => {
  if (!(await signedIn(page, "noor"))) return;
  const today = await meToday(page);
  const prediction = await api<Prediction>(page, "/api/v1/cycle/predictions");
  const status = await api<Status>(page, "/api/v1/cycle/status");
  expect(prediction.basis, "the seed gives Noor an estimate").toBe("estimate");

  await page.goto("/today");
  await expect(page).toHaveTitle("Today | Tidefern");
  await expect(
    page.getByRole("heading", { level: 1, name: `Today, ${weekday(today)}` }),
  ).toBeVisible();
  const top = hero(page, today);
  // The numeral beside its label; the ring's own numeral in the dial is hidden in this composition.
  await expect(
    top.getByText(`${status.cycleDay}`, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(top.getByText("day of your cycle", { exact: true })).toBeVisible();
  await expect(
    top.getByRole("img", { name: `Cycle day ${status.cycleDay} of about 28` }),
  ).toBeVisible();

  // Each sentence shows once in the hero: the ring's own caption is hidden beside the column.
  const estimate = top.getByText(estimateSentence(prediction), { exact: true });
  await expect(estimate.filter({ visible: true })).toHaveCount(1);
  await expect(estimate.filter({ visible: true })).toHaveClass(/estimate/);
  await expect(page.locator("figure figcaption")).toBeHidden();
  const ovulation = top
    .locator("p", { hasText: /^Ovulation is estimated/ })
    .filter({ visible: true });
  await expect(ovulation).toHaveCount(1);
  await expect(ovulation).toHaveText(ovulationSentence(prediction));
  await expect(page.getByText(CARE)).toHaveCount(0);

  // How this is estimated is a native disclosure; its wording is the owner's to write.
  const disclosure = top.locator("details");
  await expect(disclosure.locator("summary")).toHaveText("How this is estimated");
  await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
  // The placeholder names what is missing and nothing of how the page is built.
  await expect(disclosure).toContainText("[OWNER] the explanation of the estimate");
  await expect(disclosure).not.toContainText(/packages\/|architecture/);

  const partner = page.getByRole("region", { name: "What Theo can see right now" });
  await expect(partner.getByText("Cycle status", { exact: true })).toBeVisible();
  await expect(partner.getByText("Symptoms", { exact: true })).toBeVisible();
  await expect(partner.getByText("Private notes are never shared.")).toBeVisible();
  await expect(partner.getByRole("link", { name: "Change sharing" })).toHaveAttribute(
    "href",
    "/sharing",
  );

  const week = page.getByRole("region", { name: "This week" });
  await expect(week).toBeVisible();
  // This week never words the next period its own way: only the hero's 13.10 sentence may repeat there.
  await expect(week.getByText(/^Your next period/)).toHaveCount(0);
  await expect(page.getByText(FOOTER)).toBeVisible();

  // The open card holds the form from 1024 px, with today's logged values.
  const card = page.getByRole("region", { name: "Log today" });
  await expect(card.getByText(weekday(today), { exact: true })).toBeVisible();
  await expect(card.getByRole("switch", { name: "Period" })).toBeVisible();

  await expectAccessibleAtEveryWidth(page);
});

test("Noor's quick log opens the day sheet on a phone and moves to the open card on a desktop", async ({
  page,
}) => {
  if (!(await signedIn(page, "noor"))) return;
  const today = await meToday(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  const card = page.getByRole("region", { name: "Log today" });
  // Below 1024 px the card shows a summary and one button; the form lives in the sheet.
  await expect(card.getByRole("switch", { name: "Period" })).toBeHidden();
  await expect(card.getByText(/^Logged for today: /)).toBeVisible();
  const quickLog = shell(page).bar.getByRole("button", { name: "Log today" });
  await expect(quickLog).toBeEnabled();
  await quickLog.click();
  const sheet = page.getByRole("dialog", { name: weekday(today) });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("switch", { name: "Period" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  // Closed without saving: Noor's seeded day stays as it is.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(quickLog).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/today");
  const railLog = shell(page).rail.getByRole("button", { name: "Log today" });
  await railLog.click();
  await expect(card).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Lena's Today puts the pregnancy week card where the ring goes", async ({ page }) => {
  if (!(await signedIn(page, "lena"))) return;
  const today = await meToday(page);
  const pregnancy = await api<{ dueDate: string; gestation: { weeks: number } }>(
    page,
    "/api/v1/pregnancies/current",
  );

  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: `Today, ${weekday(today)}` }),
  ).toBeVisible();
  const week = hero(page, today).getByRole("region", { name: "This week" });
  await expect(week).toContainText(new RegExp(`Week\\s*${pregnancy.gestation.weeks}(?!\\d)`));
  await expect(week.getByRole("link", { name: "History" })).toHaveAttribute("href", "/journey");
  // No prediction in pregnancy (architecture 8.4), so no ring, no estimate and no footer.
  await expect(page.getByRole("img", { name: /Cycle day/ })).toHaveCount(0);
  await expect(page.getByText(/next period|Ovulation is estimated/)).toHaveCount(0);
  await expect(page.getByText(FOOTER)).toHaveCount(0);
  // Logging in pregnancy is symptoms, mood and a note: no Period switch.
  const card = page.getByRole("region", { name: "Log today" });
  await expect(card.getByRole("group", { name: "Symptoms" })).toBeVisible();
  await expect(card.getByRole("switch", { name: "Period" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What Mira can see right now" })).toBeVisible();

  await expectAccessibleAtEveryWidth(page);
});

test("Mira's postpartum Today shows Ilo's age and the quiet card, never a fertile window", async ({
  page,
}) => {
  if (!(await signedIn(page, "mira"))) return;
  const today = await meToday(page);
  const children = await api<{ items: Array<{ displayName: string; dateOfBirth: string }> }>(
    page,
    "/api/v1/children",
  );
  const ilo = children.items.find((child) => child.displayName === "Ilo");
  expect(ilo, "the seed gives Mira a newborn, Ilo").toBeDefined();

  await page.goto("/today");
  const top = hero(page, today);
  await expect(top.locator("p", { hasText: /^Ilo/ })).toHaveText(
    new RegExp(
      `^Ilo\\s*${formatChildAge(ilo?.dateOfBirth as string, today).replace(/\s+/g, "\\s*")}$`,
    ),
  );
  await expect(top.getByRole("heading", { name: "When you are ready" })).toBeVisible();
  await expect(top.getByText("Predictions are paused until a period is logged.")).toBeVisible();
  await expect(top.getByRole("button", { name: "Log a period when it comes" })).toBeVisible();
  await expect(top.getByText(/\[OWNER\] the line about cycles while feeding/)).toBeVisible();
  await expect(page.getByText(/architecture|packages\//)).toHaveCount(0);
  await expect(page.getByText(/fertile|Ovulation|next period/i)).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Cycle day/ })).toHaveCount(0);
  await expect(page.getByText(CARE)).toHaveCount(0);
  // Her pregnancy ended, so Lena's overview of it is paused.
  const lena = page.getByRole("region", { name: "What Lena can see right now" });
  await expect(
    lena.getByText("Weekly updates are paused. No week, due date or dates show."),
  ).toBeVisible();

  await expectAccessibleAtEveryWidth(page);
});

test("Theo sees Noor's status through his summary grant and is asked nothing", async ({ page }) => {
  if (!(await signedIn(page, "theo"))) return;
  const today = await meToday(page);
  const me = await api<{ grants: Array<{ ownerId: string; category: string }> }>(
    page,
    "/api/v1/me",
  );
  const noor = me.grants.find((grant) => grant.category === "cycle.status")?.ownerId;
  expect(noor, "the seed gives Theo a status grant from Noor").toBeDefined();
  const status = await api<Status>(page, `/api/v1/cycle/status?subject=${noor}`);

  await page.goto("/today");
  const card = hero(page, today).getByRole("region", { name: "Noor" });
  await expect(card.getByText("Cycle status", { exact: true })).toBeVisible();
  if (status.cycleDay !== null) {
    await expect(card.getByText(`Cycle day ${status.cycleDay}`, { exact: true })).toBeVisible();
  }
  if (status.periodDay !== null) {
    await expect(card.getByText(`Period day ${status.periodDay}`, { exact: true })).toBeVisible();
  }
  // A summary grant shows the status card and nothing more: no estimate, no symptoms, no care line.
  await expect(page.getByText(/next period|Ovulation is estimated|Cramps/)).toHaveCount(0);
  await expect(page.getByText(CARE)).toHaveCount(0);
  // The fertile-window line is a prediction, so the screen then ends with the 13.10 footer.
  const fertile = card.getByText(/^In the estimated fertile window today\./);
  if (status.inFertileWindow) {
    await expect(fertile).toBeVisible();
    await expect(page.getByText(FOOTER)).toBeVisible();
  } else {
    await expect(fertile).toHaveCount(0);
    await expect(page.getByText(FOOTER)).toHaveCount(0);
  }
  // Never a body question: no open card, no quick log at either width.
  await expect(page.getByRole("region", { name: "Log today" })).toHaveCount(0);
  await expect(shell(page).rail.getByRole("button", { name: "Log today" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  await expect(shell(page).bar.getByRole("button", { name: "Log today" })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });

  await expectAccessibleAtEveryWidth(page);
});

test("Pia sees Sol's summary through her child grant", async ({ page }) => {
  if (!(await signedIn(page, "pia"))) return;
  const today = await meToday(page);
  const children = await api<{ items: Array<{ displayName: string; dateOfBirth: string }> }>(
    page,
    "/api/v1/children",
  );
  const sol = children.items.find((child) => child.displayName === "Sol");
  expect(sol, "the seed gives Pia Sol through a child grant").toBeDefined();

  await page.goto("/today");
  const card = hero(page, today).getByRole("region", { name: "Sol" });
  await expect(
    card.getByText(formatChildAge(sol?.dateOfBirth as string, today), { exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("link", { name: "Open Family" })).toHaveAttribute("href", "/family");
  await expect(page.getByRole("region", { name: "Log today" })).toHaveCount(0);
  await expect(page.getByText(/Ilo/)).toHaveCount(0);

  await expectAccessibleAtEveryWidth(page);
});

/* ------------------------------------------------------------------ */
/* Fresh accounts of the spec's own                                     */
/* ------------------------------------------------------------------ */

test("a fresh cycle account: the empty state, a failed save, then a day logged through the open card and undone", async ({
  page,
}) => {
  const account = await freshAccount(page, { name: "Sam", label: "today" });
  if (account === null) {
    await expectFailedRead(page);
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Sam" });
  const today = await meToday(page);

  // Before the first log: the ring's bare track, CONTENT.md's copy and its one action.
  await page.goto("/today");
  const top = hero(page, today);
  await expect(top.getByRole("heading", { name: "Nothing logged yet" })).toBeVisible();
  await expect(
    top
      .getByText("Log your last period start and Tidefern can place you in your cycle.")
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(top.getByRole("img", { name: "Nothing logged yet" })).toBeVisible();
  await expect(top.getByRole("button", { name: "Log a period" })).toBeVisible();
  await expect(page.getByText(FOOTER)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "You are the only one who can see this" }),
  ).toBeVisible();
  await expectAccessibleAtEveryWidth(page);

  // The empty state's action brings the open card to her on a desktop.
  await page.goto("/today");
  const card = page.getByRole("region", { name: "Log today" });
  await top.getByRole("button", { name: "Log a period" }).click();
  await expect(card).toBeFocused();

  // A save the server refuses keeps her values and says what to do next.
  await page.route("**/api/v1/cycle/entries/*", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          body: JSON.stringify({ type: "about:blank", title: "Server error", status: 500 }),
        })
      : route.fallback(),
  );
  await card.getByRole("switch", { name: "Period" }).click();
  await expect(card.getByRole("radio", { name: "Medium" })).toBeChecked();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("We could not save this day. Try again.")).toBeVisible();
  await expect(card.getByRole("radio", { name: "Medium" })).toBeChecked();
  await page.unroute("**/api/v1/cycle/entries/*");
  const untouched = await api<{ items: unknown[] }>(
    page,
    `/api/v1/cycle/entries?from=${today}&to=${today}`,
  );
  expect(untouched.items, "the refused save wrote nothing").toHaveLength(0);

  // A real save: the page reads the API again and becomes a first guess.
  await page.goto("/today");
  await card.getByRole("switch", { name: "Period" }).click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText(`Saved for ${weekday(today)}.`)).toBeVisible();
  const guess = await api<Prediction>(page, "/api/v1/cycle/predictions");
  expect(guess.basis).toBe("first_guess");
  await expect(
    top.getByText(estimateSentence(guess), { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  // The ring's logged days are said beside it too, since its caption is hidden here.
  await expect(
    top.getByText(`Period logged ${day(today)}.`, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(top.getByText("1", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "This week" })).toContainText(
    `Period logged ${day(today)}.`,
  );

  // Undo returns the day to nothing logged, and the page to the empty state.
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByText(`Changes undone for ${weekday(today)}.`)).toBeVisible();
  await expect(top.getByRole("heading", { name: "Nothing logged yet" })).toBeVisible();
  const after = await api<{ items: Array<{ deletedAt: string | null }> }>(
    page,
    `/api/v1/cycle/entries?from=${today}&to=${today}`,
  );
  expect(after.items.filter((entry) => entry.deletedAt === null)).toHaveLength(0);
});

test("a pregnancy that ended in a loss leaves the quiet card and no prediction", async ({
  page,
}) => {
  const account = await freshAccount(page, { name: "Ana", label: "today-quiet" });
  if (account === null) {
    await expectFailedRead(page);
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "America/New_York", displayName: "Ana" });
  const today = await meToday(page);
  const origin = baseOrigin();
  const started = await page.request.post(`${origin}/api/v1/pregnancies`, {
    data: { dating: { method: "lmp", lastPeriodStart: addDays(today, -70) } },
    headers: { origin, "idempotency-key": randomUUID() },
  });
  expect(started.status(), await started.text()).toBe(201);
  const { id } = (await started.json()) as { id: string };
  // The sign-in a moment ago is fresh enough for the ending (architecture 6.1).
  const ended = await page.request.post(`${origin}/api/v1/pregnancies/${id}/end`, {
    data: { endedAt: addDays(today, -1), reason: "loss" },
    headers: { origin, "idempotency-key": randomUUID() },
  });
  expect(ended.status(), await ended.text()).toBe(200);

  await page.goto("/today");
  const top = hero(page, today);
  await expect(top.getByRole("heading", { name: "When you are ready" })).toBeVisible();
  await expect(top.getByText("Predictions are paused until a period is logged.")).toBeVisible();
  await expect(top.getByRole("button", { name: "Log a period when it comes" })).toBeVisible();
  // Nothing week by week, no cycle day, no fertile window, no feeding line after a loss.
  await expect(page.getByRole("img", { name: /Cycle day/ })).toHaveCount(0);
  await expect(page.getByText(/fertile|Ovulation|next period|Week \d/i)).toHaveCount(0);
  await expect(page.getByText(/\[OWNER\]/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Log today" })).toBeVisible();

  await expectAccessibleAtEveryWidth(page);
});
