import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { addDays, diffDays } from "@tidefern/core";
import { formatChildAge } from "../../src/lib/child-age";
import {
  MAIL_CAPTURE_PATH,
  baseOrigin,
  freshAccount,
  onboard,
  signInAccount,
  signInAs,
  type Persona,
} from "./session";

/**
 * /journey against the production build (task H4). The page renders on the
 * server through the in-process client, so its reads come from the seeded
 * database: Lena's open pregnancy with her redated history and Mira's
 * ended one shared with her as the paused card; Mira's postpartum view with
 * Ilo's age and Lena's pregnancy through her contributor grant; Noor and
 * Theo without one. Expected dates and numbers are read from the API at run
 * time. Writes happen only on fresh accounts made through the mail capture
 * endpoint (add, edit and delete an event; a day that has not come refused;
 * the ending itself); the seeded personas' failures and pending states are
 * the browser's own calls answered by `page.route`, which never reach the
 * server. Without a database each test asserts the honest failed read
 * instead. Nothing here is tagged @smoke.
 */

const profileFailed =
  "We could not load your profile just now, so only the places everyone has are listed. Reload the page to try again.";
const freshAuthSentence =
  "For safety, this needs a sign-in from the last ten minutes. Sign in again, then come back here.";

const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const day = (date: string) => monthDay.format(new Date(`${date}T00:00:00Z`));
const dayWithYear = (date: string) => monthDayYear.format(new Date(`${date}T00:00:00Z`));

/** The week a day falls in, counted from the due date as the page counts it. */
function weekOf(dueDate: string, date: string): number {
  return Math.floor(diffDays(addDays(dueDate, -280), date) / 7);
}

interface Me {
  id: string;
  today: string;
  profile: { stage: string } | null;
  grants: { ownerId: string; category: string }[];
}

/** A read of the API with the page's own cookies; `page.route` never answers these. */
async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${baseOrigin()}${path}`);
  expect(response.status(), path).toBe(200);
  return (await response.json()) as T;
}

/** A write of the API as the signed-in account, with the Origin and key the API wants. */
function apiPost(page: Page, path: string, data: unknown) {
  const origin = baseOrigin();
  return page.request.post(`${origin}${path}`, {
    data,
    headers: { origin, "idempotency-key": randomUUID() },
  });
}

/** Without a database the session read fails: the layout says so and the page shows only its heading. */
async function expectFailedRead(page: Page) {
  await page.goto("/journey");
  await expect(page.getByText(profileFailed)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Journey" })).toBeVisible();
  await expect(page.getByRole("region", { name: "This week" })).toHaveCount(0);
}

async function signedIn(page: Page, persona: Persona): Promise<boolean> {
  return (await signInAs(page, persona)) !== null;
}

/**
 * axe in both themes at 1440 and 390, then no sideways scroll at 390 and
 * 320, for the state on screen. For axe the viewport is as tall as the
 * page, so every element is on screen for the contrast check and the
 * shell's sticky tab bar rests at the foot of the page instead of over
 * whichever control the scroll position happens to leave under its top
 * edge, which axe's target-size rule would flag (that overlap belongs to
 * the shell and is recorded as a follow-up for it).
 */
async function audit(page: Page, label: string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height: Math.max(height, 844) });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${label} at ${width} in ${theme}`).toEqual([]);
    }
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Opens the page and waits until its scripts run, so a press reaches React. */
async function openJourney(page: Page) {
  await page.goto("/journey");
  await page.waitForLoadState("networkidle");
}

async function typeDate(dialog: Locator, date: string) {
  const [year, month, dayOfMonth] = date.split("-") as [string, string, string];
  await dialog.getByRole("textbox", { name: "Month" }).fill(month);
  await dialog.getByRole("textbox", { name: "Day" }).fill(dayOfMonth);
  await dialog.getByRole("textbox", { name: "Year" }).fill(year);
}

function problem(route: Route, status: number, code: string, extra: Record<string, unknown> = {}) {
  return route.fulfill({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: `urn:tidefern:problem:${code}`,
      title: code,
      status,
      code,
      ...extra,
    }),
  });
}

/** A fresh account with an open pregnancy started through the API, ten weeks along. */
async function freshPregnancy(page: Page, label: string) {
  const account = await freshAccount(page, { label, name: "Sam" });
  if (account === null) return null;
  await onboard(page, { stage: "pregnancy", timeZone: "America/Vancouver", displayName: "Sam" });
  const me = await api<Me>(page, "/api/v1/me");
  const started = await apiPost(page, "/api/v1/pregnancies", {
    dating: { method: "lmp", lastPeriodStart: addDays(me.today, -70) },
  });
  expect(started.status()).toBe(201);
  const pregnancy = (await started.json()) as { id: string };
  return { account, today: me.today, pregnancyId: pregnancy.id };
}

test.describe("Lena, owner of an open pregnancy", () => {
  test("her week card leads on warmth with this week marked, her redated history and Mira's pregnancy paused", async ({
    page,
  }) => {
    if (!(await signedIn(page, "lena"))) return expectFailedRead(page);
    const me = await api<Me>(page, "/api/v1/me");
    const current = await api<{
      id: string;
      dueDate: string;
      datingMethod: string;
      gestation: { weeks: number; days: number };
    }>(page, "/api/v1/pregnancies/current");
    const history = await api<{ items: { previousDueDate: string; nextDueDate: string }[] }>(
      page,
      `/api/v1/pregnancies/${current.id}/dating-history`,
    );
    const events = await api<{ items: { date: string; detail?: string | null }[] }>(
      page,
      `/api/v1/pregnancies/${current.id}/events`,
    );
    const glucoseDate =
      events.items.find((item) => item.detail === "Glucose screening")?.date ?? "";
    await openJourney(page);

    const own = page.getByRole("region", { name: "Your pregnancy" });
    const card = own.getByRole("region", { name: "This week" });
    await expect(card).toContainText(`Week${current.gestation.weeks}`);
    await expect(card).toContainText(dayWithYear(current.dueDate));
    await expect(card.getByText("Dated from an ultrasound.")).toBeVisible();
    await expect(card.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "#dating-history",
    );
    // The card is the one warm surface on the screen.
    expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.background = "var(--warmth)";
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      }),
    );

    // The tide line marks this week in words, and this week leads the weeks ahead.
    await expect(own.locator("span", { hasText: /^This week$/ })).toBeVisible();
    const thisWeek = own.locator("li").filter({
      has: page.getByRole("heading", {
        level: 4,
        name: `Week ${current.gestation.weeks}`,
        exact: true,
      }),
    });
    await expect(thisWeek).toHaveCount(1);
    const weekStart = addDays(current.dueDate, current.gestation.weeks * 7 - 280);
    expect(diffDays(weekStart, me.today)).toBe(current.gestation.days);
    await expect(thisWeek).toContainText(`${day(weekStart)} to`);

    // The appointment Mira added is ahead, so it is expected, and it says who added it.
    const glucose = own.getByRole("list", {
      name: `Week ${weekOf(current.dueDate, glucoseDate)}`,
    });
    await expect(glucose).toContainText("Glucose screening");
    await expect(glucose).toContainText("Appointment, added by Mira");
    await expect(glucose).toContainText("Expected");
    await expect(glucose.getByRole("button", { name: /^Edit Glucose screening/ })).toBeVisible();

    // Earlier weeks wait behind a disclosure; opening it shows what already happened.
    await own.getByText("Earlier weeks").click();
    await expect(own.getByText("Anatomy scan")).toBeVisible();

    const historySection = page.locator("#dating-history");
    await expect(historySection.getByRole("heading", { name: "Due date history" })).toBeVisible();
    for (const change of history.items) {
      await expect(historySection).toContainText(
        `From ${dayWithYear(change.previousDueDate)} to ${dayWithYear(change.nextDueDate)}`,
      );
    }
    await expect(own.getByRole("button", { name: "My pregnancy ended" })).toBeVisible();

    const mira = page.getByRole("region", { name: "Mira's pregnancy" });
    await expect(mira.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect(mira).toContainText("Weekly updates are paused.");
    const pausedText = await mira.innerText();
    expect(pausedText).not.toMatch(/\d/);
    expect(pausedText).not.toMatch(/birth|ended|loss/i);

    await audit(page, "Lena's journey");
  });

  test("the ending dialog asks the day, a reason that stays hers, her word after a loss, and says nobody is notified", async ({
    page,
  }) => {
    if (!(await signedIn(page, "lena"))) return expectFailedRead(page);
    let ended = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/end")) ended += 1;
    });
    const me = await api<Me>(page, "/api/v1/me");
    await openJourney(page);
    await page.getByRole("button", { name: "My pregnancy ended" }).click();
    const dialog = page.getByRole("dialog", { name: "My pregnancy ended" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Only you can see this. Nobody you share with ever does."),
    ).toBeVisible();
    await expect(
      dialog.getByText(
        "Mira will see it as paused, with no week or dates. Tidefern does not notify anyone.",
      ),
    ).toBeVisible();
    await expect(dialog.getByText(/\[OWNER\] one resources link/)).toBeVisible();
    await expect(
      dialog.getByRole("group", { name: "The word you want Tidefern to use" }),
    ).toHaveCount(0);
    await dialog.getByRole("radio", { name: "Loss" }).click();
    await expect(
      dialog.getByRole("group", { name: "The word you want Tidefern to use" }),
    ).toBeVisible();
    await dialog.getByRole("radio", { name: "Baby" }).click();
    await expect(dialog.getByText(/^Support after losing a baby:/)).toBeVisible();

    // A day that has not happened is refused before anything is sent.
    await typeDate(dialog, addDays(me.today, 1));
    await dialog.getByRole("button", { name: "Record the ending" }).click();
    await expect(
      dialog.getByText("That day has not happened yet. Enter today or an earlier day."),
    ).toBeVisible();
    expect(ended).toBe(0);

    await audit(page, "the ending dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(ended).toBe(0);
  });

  test("a stale sign-in is shown as the next step, with the way back here", async ({ page }) => {
    if (!(await signedIn(page, "lena"))) return expectFailedRead(page);
    const me = await api<Me>(page, "/api/v1/me");
    await page.route("**/api/v1/pregnancies/*/end", (route) =>
      problem(route, 401, "unauthenticated", { detail: "fresh_authentication_required" }),
    );
    await openJourney(page);
    await page.getByRole("button", { name: "My pregnancy ended" }).click();
    const dialog = page.getByRole("dialog", { name: "My pregnancy ended" });
    await typeDate(dialog, me.today);
    await dialog.getByRole("radio", { name: "Birth" }).click();
    await dialog.getByRole("button", { name: "Record the ending" }).click();
    await expect(page.getByText(freshAuthSentence)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in?next=/journey",
    );
    await expect(dialog).toBeHidden();
    await audit(page, "the fresh sign-in step");
  });

  test("adding says Saving while it runs and keeps her input when it fails", async ({ page }) => {
    if (!(await signedIn(page, "lena"))) return expectFailedRead(page);
    const me = await api<Me>(page, "/api/v1/me");
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/v1/pregnancies/*/events", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held;
      await problem(route, 500, "internal");
    });
    await openJourney(page);
    await page.getByRole("button", { name: "Add an appointment" }).click();
    const dialog = page.getByRole("dialog", { name: "Add an appointment" });
    await typeDate(dialog, addDays(me.today, 9));
    await dialog.getByRole("textbox", { name: "Details" }).fill("Midwife visit");
    // The button's name becomes its pending words while the request runs.
    const save = dialog.getByRole("button", { name: /^(Save|Saving)$/ });
    const width = (await save.boundingBox())?.width;
    await save.click();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(save).toContainText("Saving");
    expect((await save.boundingBox())?.width).toBe(width);
    await audit(page, "the add form while saving");
    release();
    await expect(dialog.getByText("We could not save this. Try again.")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Details" })).toHaveValue("Midwife visit");
    await audit(page, "the add form after a failure");
  });
});

test.describe("Mira, after a birth and with Lena's pregnancy shared", () => {
  test("she sees Ilo's age with no week, and Lena's journey as a contributor without its history", async ({
    page,
  }) => {
    if (!(await signedIn(page, "mira"))) return expectFailedRead(page);
    const me = await api<Me>(page, "/api/v1/me");
    const children = await api<{ items: { displayName: string; dateOfBirth: string }[] }>(
      page,
      "/api/v1/children",
    );
    const ilo = children.items.find((child) => child.displayName === "Ilo");
    expect(ilo).toBeDefined();
    const owner = me.grants.find((grant) => grant.category === "pregnancy.overview")?.ownerId;
    const shared = await api<{ id: string; dueDate: string }>(
      page,
      `/api/v1/pregnancies/current?subject=${owner ?? ""}`,
    );
    const sharedEvents = await api<{ items: { date: string; detail?: string | null }[] }>(
      page,
      `/api/v1/pregnancies/${shared.id}/events`,
    );
    const glucoseDate =
      sharedEvents.items.find((item) => item.detail === "Glucose screening")?.date ?? "";
    await openJourney(page);

    const own = page.getByRole("region", { name: "After the birth" });
    await expect(own).toContainText(`Ilo ${formatChildAge(ilo?.dateOfBirth ?? "", me.today)}`);
    await expect(
      own.getByRole("heading", { name: "Predictions are paused after birth" }),
    ).toBeVisible();
    await expect(own.getByRole("link", { name: "Log a period" })).toHaveAttribute(
      "href",
      `/log/${me.today}`,
    );
    await expect(own).not.toContainText(/Week \d/);

    const lena = page.getByRole("region", { name: "Lena's pregnancy" });
    const card = lena.getByRole("region", { name: "This week" });
    await expect(card).toContainText("Countdown");
    await expect(card).not.toContainText("Dating");
    await expect(card.getByRole("link")).toHaveCount(0);
    await expect(
      lena.getByRole("list", { name: `Week ${weekOf(shared.dueDate, glucoseDate)}` }),
    ).toContainText("Appointment, added by you");
    await expect(lena.getByRole("button", { name: "Add an appointment" })).toBeVisible();
    await expect(page.getByText("Due date history")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "My pregnancy ended" })).toHaveCount(0);
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/ultrasound|reason|ended/i);

    // A contributor edits but never deletes: the API refuses her, so the form does not offer it.
    await lena.getByRole("button", { name: /^Edit Glucose screening/ }).click();
    const dialog = page.getByRole("dialog", { name: "Edit the appointment" });
    await expect(dialog.getByRole("textbox", { name: "Details" })).toHaveValue("Glucose screening");
    await expect(dialog.getByRole("button", { name: /Delete/ })).toHaveCount(0);
    await audit(page, "a contributor's edit form");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await audit(page, "Mira's journey");
  });

  test("a write refused because the pregnancy is paused says only that it is paused", async ({
    page,
  }) => {
    if (!(await signedIn(page, "mira"))) return expectFailedRead(page);
    const me = await api<Me>(page, "/api/v1/me");
    await page.route("**/api/v1/pregnancies/*/events", (route) =>
      route.request().method() === "POST"
        ? problem(route, 409, "conflict", { detail: "pregnancy_paused" })
        : route.fallback(),
    );
    await openJourney(page);
    await page
      .getByRole("region", { name: "Lena's pregnancy" })
      .getByRole("button", { name: "Add a milestone" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add a milestone" });
    await typeDate(dialog, me.today);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      dialog.getByText("Updates to this pregnancy are paused, so this was not saved."),
    ).toBeVisible();
    await expect(dialog).not.toContainText(/ended/);
    await audit(page, "a paused refusal");
  });
});

test.describe("without a pregnancy of her own", () => {
  test("Noor sees the empty state without a start action", async ({ page }) => {
    if (!(await signedIn(page, "noor"))) return expectFailedRead(page);
    await openJourney(page);
    await expect(page.getByRole("heading", { name: "No pregnancy recorded" })).toBeVisible();
    await expect(
      page.getByText(
        "Start one with a due date or your last period and this becomes week by week.",
      ),
    ).toBeVisible();
    await expect(page.locator("main").getByRole("link")).toHaveCount(0);
    await audit(page, "the empty state");
  });

  test("Theo, here for someone else, is asked nothing about his own body", async ({ page }) => {
    if (!(await signedIn(page, "theo"))) return expectFailedRead(page);
    await openJourney(page);
    await expect(page.getByRole("heading", { name: "Nothing shared with you yet" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/your last period|due date/i);
    await audit(page, "the none stage");
  });
});

test.describe("on a fresh account", () => {
  test("she adds, edits and deletes an appointment, and the list shows only what the API returned", async ({
    page,
  }) => {
    const made = await freshPregnancy(page, "journey-events");
    if (made === null) return expectFailedRead(page);
    const date = addDays(made.today, 7);
    const week = Math.floor(diffDays(addDays(made.today, -70), date) / 7);
    await openJourney(page);
    await expect(page.locator("#dating-history")).toContainText(
      "The due date has not changed since it was set.",
    );
    await expect(page.getByText(/^Nothing is added for the weeks ahead yet\./)).toBeVisible();
    await audit(page, "a pregnancy with nothing added yet");

    await page.getByRole("button", { name: "Add an appointment" }).click();
    let dialog = page.getByRole("dialog", { name: "Add an appointment" });
    await typeDate(dialog, date);
    await dialog.getByRole("textbox", { name: "Details" }).fill("Midwife visit");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`Saved for ${day(date)}.`)).toBeVisible();
    const list = page.getByRole("list", { name: `Week ${week}` });
    await expect(list).toContainText("Midwife visit");
    await expect(list).toContainText("Expected");
    const events = await api<{ items: { detail: string; date: string }[] }>(
      page,
      `/api/v1/pregnancies/${made.pregnancyId}/events`,
    );
    expect(events.items.map((item) => [item.date, item.detail])).toEqual([[date, "Midwife visit"]]);

    await list.getByRole("button", { name: /^Edit Midwife visit/ }).click();
    dialog = page.getByRole("dialog", { name: "Edit the appointment" });
    await dialog
      .getByRole("textbox", { name: "Details" })
      .fill("Midwife visit, moved to the afternoon");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(list).toContainText("Midwife visit, moved to the afternoon");

    await list.getByRole("button", { name: /^Edit Midwife visit/ }).click();
    dialog = page.getByRole("dialog", { name: "Edit the appointment" });
    await audit(page, "her edit form");
    await dialog.getByRole("button", { name: "Delete this appointment" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this appointment?" });
    await audit(page, "the delete confirmation");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Deleted.")).toBeVisible();
    await expect(list).toHaveCount(0);
    const after = await api<{ items: unknown[] }>(
      page,
      `/api/v1/pregnancies/${made.pregnancyId}/events`,
    );
    expect(after.items).toEqual([]);
  });

  test("the API refuses a day that has not come, then the ending runs end to end to a quiet Today", async ({
    page,
  }) => {
    const made = await freshPregnancy(page, "journey-ending");
    if (made === null) return expectFailedRead(page);

    const tomorrow = await apiPost(page, `/api/v1/pregnancies/${made.pregnancyId}/end`, {
      endedAt: addDays(made.today, 1),
      reason: "loss",
    });
    expect(tomorrow.status()).toBe(422);
    expect(((await tomorrow.json()) as { errors: unknown[] }).errors).toEqual([
      { path: "endedAt", message: "Not a day that has happened yet." },
    ]);

    // Ending wants a sign-in from the last ten minutes: sign in again right before it.
    expect(await signInAccount(page, made.account)).not.toBeNull();
    const mailBefore = await page.request.get(`${baseOrigin()}${MAIL_CAPTURE_PATH}`);
    const before = ((await mailBefore.json()) as { messages: unknown[] }).messages;

    await openJourney(page);
    await page.getByRole("button", { name: "My pregnancy ended" }).click();
    const dialog = page.getByRole("dialog", { name: "My pregnancy ended" });
    await typeDate(dialog, made.today);
    await dialog.getByRole("radio", { name: "Loss" }).click();
    await dialog.getByRole("radio", { name: "Baby" }).click();
    await dialog.getByRole("button", { name: "Record the ending" }).click();
    await expect(page).toHaveURL(/\/today$/);
    // Today is quiet after an ending (architecture 8.4 rule 5): no fertile window,
    // no estimate, no week and none of the words of the ending. Task H2 builds the
    // quiet card itself; this guard holds before and after it lands.
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(
      /fertile|ovulation|contraception|most likely|\bWeek \d|loss|baby/i,
    );

    const current = await api<{ status: string; endedAt: string; endedReason: string }>(
      page,
      "/api/v1/pregnancies/current",
    );
    expect(current).toMatchObject({ status: "ended", endedAt: made.today, endedReason: "loss" });
    expect((await api<Me>(page, "/api/v1/me")).profile?.stage).toBe("cycle");
    const mailAfter = await page.request.get(`${baseOrigin()}${MAIL_CAPTURE_PATH}`);
    expect(((await mailAfter.json()) as { messages: unknown[] }).messages).toEqual(before);

    await openJourney(page);
    await expect(page.getByRole("heading", { name: "When you are ready" })).toBeVisible();
    await expect(page.getByText("Predictions are paused until a period is logged.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Log a period when it comes" })).toHaveAttribute(
      "href",
      `/log/${made.today}`,
    );
    expect(await page.locator("main").innerText()).not.toMatch(/Week|loss|baby/i);
    await expect(
      page.locator("nav[aria-label='Main']").first().getByRole("link", { name: "Journey" }),
    ).toHaveCount(0);
    await audit(page, "the quiet state after an ending");
  });
});
