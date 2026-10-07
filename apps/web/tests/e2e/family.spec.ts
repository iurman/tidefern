import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Cookie, type Locator, type Page } from "@playwright/test";
import type { Theme } from "./axe";
import { freshAccount, onboard, signInAs, type Persona } from "./session";

/**
 * /family and /family/[childId] (task H5) against the production build and
 * the seeded database (packages/db README, "The cast"): Mira and Lena guard
 * Ilo and Sol, Pia reaches Sol alone through a read grant, Noor and Theo
 * have no child. Server components read the API in process, so populated
 * and grantee states come from the seed; `page.route` only answers the
 * browser's own writes (pending and failure). Every write is made on a fresh
 * account's own child (the mail capture endpoint), never on a seeded
 * persona, so no seeded row changes. Dates and counts are read from the API
 * at run time (`me.today`, the day's events). Against a server without a
 * database the helpers hand back the canned cookie and each test asserts
 * the honest failed-read state instead. Nothing here is tagged @smoke.
 */

const ILO = "018f5e7a-5eed-7006-8000-000000000001";
const SOL = "018f5e7a-5eed-7006-8000-000000000002";
const NOWHERE = "018f5e7a-5eed-7006-8000-0000000000ff";
const CARE = "This is worth mentioning to your doctor or midwife.";
const NOT_FOUND = "That page is not here.";
const PROFILE_FAILED = /could not load your profile just now/;
const AGE =
  /^(Born today|\d+ (day|days|week|weeks|month|months|year|years)(, \d+ (day|days|month|months))?)$/;
const SINCE = /just now|\d+\s(min|h) ago|\d+ days? ago/;

interface Me {
  id: string;
  today: string;
  profile: { timeZone: string; units: "metric" | "imperial" } | null;
}

interface ApiEvent {
  kind: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  diaperContents: string | null;
}

/** Signs a persona in (cookies cached for the worker); false on a server without a database. */
async function as(page: Page, persona: Persona): Promise<boolean> {
  return (await signInAs(page, persona)) !== null;
}

async function meOf(page: Page): Promise<Me> {
  const response = await page.request.get("/api/v1/me");
  expect(response.status()).toBe(200);
  return (await response.json()) as Me;
}

/** The layout's one failure sentence and no child content: the database-free state. */
async function expectFailedRead(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText(PROFILE_FAILED)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
}

async function expectNoOverflow(page: Page, label: string) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/**
 * Below 1024 px the shell's tab bar sticks to the foot of the viewport, so
 * whichever target the scroll position leaves under it reads as obscured to
 * axe's target-size rule. That overlap belongs to the shell and to the scroll
 * position, not to the page, so a phone-width check lays the page out tall
 * enough to show all of it, the bar covering nothing. A sheet is checked as
 * it opened: the dialog is modal, and the bar behind it is inert.
 */
async function fitToPage(page: Page) {
  const size = page.viewportSize();
  if (size === null || size.width >= 1024) return;
  if ((await page.locator("dialog[open]").count()) > 0) return;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > size.height) await page.setViewportSize({ width: size.width, height });
}

/** Axe with the wcag22aa tag set, in a theme, on the page as it stands (a tab or a sheet open). */
async function expectAccessible(page: Page, theme: Theme, label: string) {
  await fitToPage(page);
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, `${label} in ${theme}`).toEqual([]);
}

/** Runs `check` at 1440 and 390 in both themes; `prepare` puts the page in the state first. */
async function everyWidthAndTheme(
  page: Page,
  label: string,
  prepare: () => Promise<void>,
  check: (theme: Theme) => Promise<void> = (theme) => expectAccessible(page, theme, label),
) {
  for (const width of [1440, 390]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await prepare();
      await check(theme);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Opens a page and waits for the scripts, so a control's own handler is attached. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** Chooses a tab, retrying until its panel shows (a press before hydration checks the radio only). */
async function chooseTab(page: Page, name: "Timeline" | "Growth" | "Milestones") {
  const panel = page.locator(`[data-panel="${name.toLowerCase()}"]`);
  await expect(async () => {
    await page.getByRole("radio", { name, exact: true }).click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

/** Presses a control that opens a sheet, retrying until the dialog is open. */
async function openSheet(page: Page, control: Locator, title: string | RegExp) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(async () => {
    await control.click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return dialog;
}

/** The seeded child's events on a day, as the API answers the persona signed in. */
async function eventsOn(page: Page, childId: string, day: string): Promise<ApiEvent[]> {
  const response = await page.request.get(
    `/api/v1/children/${childId}/events?from=${day}&to=${day}&limit=200`,
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: ApiEvent[] };
  return body.items.filter((item) => "kind" in item);
}

function sleptMinutes(events: ApiEvent[]): string {
  const minutes = events
    .filter((event) => event.kind === "sleep" && event.startedAt && event.endedAt)
    .reduce(
      (sum, event) =>
        sum +
        Math.round(
          (Date.parse(event.endedAt as string) - Date.parse(event.startedAt as string)) / 60_000,
        ),
      0,
    );
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0
    ? `${minutes / 60} h`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

test("a visitor without a session is sent to sign in from both routes", async ({ request }) => {
  for (const path of ["/family", `/family/${ILO}`]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toBe("/sign-in");
  }
});

test("Mira sees both children with their guardians, today's counts and the one warm card", async ({
  page,
}) => {
  if (!(await as(page, "mira"))) return expectFailedRead(page, "/family");
  const me = await meOf(page);
  await open(page, "/family");
  await expect(page).toHaveTitle("Family | Tidefern");
  await expect(page.getByRole("heading", { level: 1, name: "Family" })).toBeVisible();
  const rail = page.locator("nav[aria-label='Main']").first();
  await expect(rail.getByRole("link", { name: "Family", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  for (const name of ["Ilo", "Sol"]) {
    const card = page.getByRole("article", { name });
    await expect(card.getByRole("heading", { level: 2, name })).toBeVisible();
    await expect(card.locator("header p")).toHaveText(AGE);
    await expect(card.getByText("Guardians: you and Lena")).toBeVisible();
    for (const control of ["Feed", "Sleep", "Diaper"]) {
      await expect(
        card.getByRole("button", { name: new RegExp(`^(${control}|End sleep) for ${name}$`) }),
      ).toBeVisible();
    }
    await expect(
      card.getByRole("link", { name: `Timeline, growth and milestones for ${name}` }),
    ).toHaveAttribute("href", `/family/${name === "Ilo" ? ILO : SOL}`);
  }

  // Ilo is the youngest, so hers is the one summary on warmth.
  await expect(page.locator("[data-warmth]")).toHaveCount(1);
  const ilo = page.getByRole("article", { name: "Ilo" });
  await expect(ilo.locator("[data-warmth]")).toHaveCount(1);

  // Today's counts as the API has today's events, and the time since the last of each kind.
  const today = await eventsOn(page, ILO, me.today);
  const rows = ilo.locator("dl > div");
  await expect(rows.filter({ hasText: "Last feed" })).toContainText(
    `Today: ${today.filter((event) => event.kind === "feed").length}`,
  );
  await expect(rows.filter({ hasText: "Last feed" })).toContainText(SINCE);
  await expect(rows.filter({ hasText: /Last sleep|Sleep/ })).toContainText(
    `Today: ${sleptMinutes(today)}`,
  );
  const diapers = today.filter((event) => event.kind === "diaper");
  const wet = diapers.filter((event) =>
    ["wet", "mixed"].includes(event.diaperContents ?? ""),
  ).length;
  const dirty = diapers.filter((event) =>
    ["dirty", "mixed"].includes(event.diaperContents ?? ""),
  ).length;
  await expect(rows.filter({ hasText: "Last diaper" })).toContainText(
    `Today: ${diapers.length} (${wet} wet, ${dirty} dirty)`,
  );
  await expect(page.getByText(/\[OWNER\]/)).toHaveCount(0);
  await expectNoOverflow(page, "/family as Mira");
});

test("Mira's children: the timeline, Sol's care sentence, Ilo's approximate caption and milestones", async ({
  page,
}) => {
  if (!(await as(page, "mira"))) return expectFailedRead(page, `/family/${ILO}`);
  await open(page, `/family/${ILO}`);
  await expect(page).toHaveTitle("Family | Tidefern");
  await expect(page.getByRole("heading", { level: 1, name: "Ilo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Family" })).toHaveAttribute(
    "href",
    "/family",
  );

  // Timeline: newest first, the newest row alone on warmth.
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline).toBeVisible();
  await expect(
    timeline.getByText("Milestone: Calms down when spoken to or picked up"),
  ).toBeVisible();
  await expect(timeline.getByText("Bottle feed, 90 ml")).toBeVisible();
  await expect(timeline.getByText(/Note: Settled quickly after the feed\./)).toBeVisible();
  const backgrounds = await timeline
    .getByRole("listitem")
    .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).backgroundColor));
  expect(backgrounds[0]).not.toBe("rgba(0, 0, 0, 0)");
  expect(backgrounds.slice(1).every((color) => color === "rgba(0, 0, 0, 0)")).toBe(true);

  // Growth: WHO under eight weeks, so the caption says approximate; nothing far outside.
  const growth = await chooseTab(page, "Growth");
  await expect(growth.getByRole("img", { name: /^Weight for age, since birth:/ })).toBeVisible();
  await expect(growth.getByText(/Approximate in the first eight weeks\./)).toBeVisible();
  await expect(growth.getByText(CARE)).toHaveCount(0);
  await expect(growth.getByText(/^Source: CDC\. Reference to CDC materials/)).toBeVisible();
  await expect(growth.getByText(/Used with acknowledgment of WHO as the source/)).toBeVisible();
  await expect(growth.getByRole("button", { name: "Add a measurement" })).toBeVisible();

  // Milestones: the API's list with the 13.10 template and the attribution, once each.
  const checklist = (await (
    await page.request.get(`/api/v1/children/${ILO}/milestones`)
  ).json()) as {
    label: string;
    framing: string;
    notScreeningLine: string;
    attribution: string;
    items: { text: string; checked: boolean }[];
  };
  const milestones = await chooseTab(page, "Milestones");
  await expect(
    milestones.getByRole("heading", { name: `Checklist for ${checklist.label}` }),
  ).toBeVisible();
  await expect(
    milestones.getByText(`${checklist.framing} ${checklist.notScreeningLine}`),
  ).toBeVisible();
  await expect(milestones.getByText(checklist.attribution)).toHaveCount(1);
  for (const item of checklist.items) {
    const box = milestones.getByRole("checkbox", { name: item.text });
    await expect(box).toBeEnabled();
    if (item.checked) await expect(box).toBeChecked();
    else await expect(box).not.toBeChecked();
  }

  // Sol: the newest weight is beyond two standard deviations, and Mira is a guardian.
  await open(page, `/family/${SOL}`);
  const solGrowth = await chooseTab(page, "Growth");
  await expect(solGrowth.getByText(CARE)).toBeVisible();
  await expect(solGrowth.getByText(/Approximate in the first eight weeks/)).toHaveCount(0);
  await expectNoOverflow(page, `/family/${SOL} growth as Mira`);
});

test("Lena, a guardian too, sees both children and the care sentence on Sol", async ({ page }) => {
  if (!(await as(page, "lena"))) return expectFailedRead(page, "/family");
  await open(page, "/family");
  for (const name of ["Ilo", "Sol"]) {
    const card = page.getByRole("article", { name });
    await expect(card.getByText("Guardians: you and Mira")).toBeVisible();
    await expect(card.getByRole("button", { name: `Diaper for ${name}` })).toBeVisible();
  }
  await open(page, `/family/${SOL}`);
  const growth = await chooseTab(page, "Growth");
  await expect(growth.getByText(CARE)).toBeVisible();
});

test("Pia reaches Sol alone, read-only, in her imperial units and without the care sentence", async ({
  page,
}) => {
  if (!(await as(page, "pia"))) return expectFailedRead(page, "/family");
  await open(page, "/family");
  // Her child grant gives her the Family destination.
  const rail = page.locator("nav[aria-label='Main']").first();
  await expect(rail.getByRole("link", { name: "Family", exact: true })).toBeVisible();
  const sol = page.getByRole("article", { name: "Sol" });
  await expect(sol.getByRole("heading", { level: 2, name: "Sol" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Ilo" })).toHaveCount(0);
  await expect(page.getByText(/Guardians?:/)).toHaveCount(0);
  for (const control of ["Feed", "Sleep", "End sleep", "Diaper"]) {
    await expect(page.getByRole("button", { name: `${control} for Sol` })).toHaveCount(0);
  }
  await expect(sol.locator("dl")).toBeVisible();
  await expectNoOverflow(page, "/family as Pia");

  await open(page, `/family/${SOL}`);
  await expect(page.getByRole("heading", { level: 1, name: "Sol" })).toBeVisible();
  const growth = await chooseTab(page, "Growth");
  await expect(growth.getByRole("img", { name: /^Weight for age, since birth:/ })).toBeVisible();
  await expect(growth.getByRole("list", { name: "Readings" })).toContainText(" lb");
  await expect(growth.getByRole("radio", { name: "lb" })).toBeChecked();
  await expect(growth.getByText(CARE)).toHaveCount(0);
  await expect(growth.getByRole("button", { name: "Add a measurement" })).toHaveCount(0);
  // The unit toggle converts at the edge: the same stored grams in kilograms.
  await expect(async () => {
    await growth.getByRole("radio", { name: "kg" }).click();
    await expect(growth.getByRole("list", { name: "Readings" })).toContainText(" kg", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  const milestones = await chooseTab(page, "Milestones");
  const boxes = milestones.getByRole("checkbox");
  expect(await boxes.count()).toBeGreaterThan(0);
  for (const box of await boxes.all()) await expect(box).toBeDisabled();
  await chooseTab(page, "Timeline");
  await expect(page.getByRole("link", { name: "Log on the Family page" })).toHaveCount(0);

  // Ilo is not hers to see: the not-found page inside the shell.
  await page.goto(`/family/${ILO}`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.locator("nav[aria-label='Main']").first()).toBeVisible();
});

for (const persona of ["noor", "theo"] as const) {
  test(`${persona} has no child: the empty state and no Family destination`, async ({ page }) => {
    if (!(await as(page, persona))) return expectFailedRead(page, "/family");
    await open(page, "/family");
    const empty = page.getByRole("region", { name: "No child added yet" });
    await expect(empty).toBeVisible();
    await expect(
      empty.getByText("Add a child to keep feeds, sleep, growth and milestones in one place."),
    ).toBeVisible();
    await expect(empty.getByRole("button", { name: "Add a child" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a child" })).toHaveCount(1);
    const navigation = page.locator("nav[aria-label='Main']");
    await expect(navigation.getByRole("link", { name: "Family", exact: true })).toHaveCount(0);
    await expectNoOverflow(page, `/family as ${persona}`);
  });
}

test("an unknown or malformed child id shows the not-found page inside the shell", async ({
  page,
}) => {
  if (!(await as(page, "mira"))) return expectFailedRead(page, `/family/${NOWHERE}`);
  for (const path of [`/family/${NOWHERE}`, "/family/child"]) {
    await page.goto(path);
    await expect(page.getByText(NOT_FOUND), path).toBeVisible();
    await expect(page.getByRole("banner"), path).toHaveCount(0);
    await expect(page.locator("nav[aria-label='Main']").first(), path).toBeVisible();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`the family pages have no axe violations in ${theme} mode at 1440 and 390`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    if (!(await as(page, "mira"))) return expectFailedRead(page, "/family");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await open(page, "/family");
      await expectAccessible(page, theme, `/family as Mira at ${width}`);
      for (const child of [ILO, SOL]) {
        await open(page, `/family/${child}`);
        for (const tab of ["Timeline", "Growth", "Milestones"] as const) {
          await chooseTab(page, tab);
          await expectAccessible(page, theme, `/family/${child} ${tab} as Mira at ${width}`);
        }
      }
      await page.goto(`/family/${NOWHERE}`);
      await expectAccessible(page, theme, `not found at ${width}`);
    }
    for (const persona of ["pia", "noor"] as const) {
      await as(page, persona);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await open(page, "/family");
        await expectAccessible(page, theme, `/family as ${persona} at ${width}`);
        if (persona === "pia") {
          await open(page, `/family/${SOL}`);
          for (const tab of ["Timeline", "Growth", "Milestones"] as const) {
            await chooseTab(page, tab);
            await expectAccessible(page, theme, `/family/${SOL} ${tab} as Pia at ${width}`);
          }
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
}

/* ------------------------------------------------------------------------ */
/* Writes, on a fresh account's own child                                    */
/* ------------------------------------------------------------------------ */

interface Shared {
  cookies: Cookie[];
  me: Me;
  /** The child the fresh account adds, once added. */
  childId?: string;
  dateOfBirth: string;
}

let shared: Shared | null | undefined;

/** The fresh account the write tests share: verified, onboarded, signed in; null without a database. */
async function freshFamily(page: Page): Promise<Shared | null> {
  if (shared !== undefined) {
    if (shared !== null) await page.context().addCookies(shared.cookies);
    return shared;
  }
  const made = await freshAccount(page, { label: "family", name: "Sam" });
  if (made === null) {
    shared = null;
    return null;
  }
  await onboard(page, { stage: "postpartum", timeZone: "America/Vancouver", displayName: "Sam" });
  const me = await meOf(page);
  const birth = new Date(`${me.today}T00:00:00Z`);
  birth.setUTCDate(birth.getUTCDate() - 10);
  shared = { cookies: made.cookies, me, dateOfBirth: birth.toISOString().slice(0, 10) };
  return shared;
}

/** Types a YYYY-MM-DD date into a segmented date input (month, day, year). */
async function typeDate(scope: Locator, date: string) {
  const [year, month, day] = date.split("-") as [string, string, string];
  await scope.getByRole("textbox", { name: "Month" }).fill(month);
  await scope.getByRole("textbox", { name: "Day" }).fill(day);
  await scope.getByRole("textbox", { name: "Year" }).fill(year);
}

test("adding a child: the consent in full, the checks, a failure, then the child", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const family = await freshFamily(page);
  if (family === null) return expectFailedRead(page, "/family");
  await open(page, "/family");
  await expect(page.getByRole("region", { name: "No child added yet" })).toBeVisible();
  const sheet = await openSheet(
    page,
    page.getByRole("button", { name: "Add a child" }),
    "Add a child",
  );
  await expect(
    sheet.getByText(/^You are adding this child as their parent or guardian\./),
  ).toBeVisible();
  const consent = sheet.getByRole("checkbox", { name: /I agree to this on the child's behalf/ });
  await expect(consent).not.toBeChecked();

  // Nothing filled: each field says what it needs, and nothing is sent.
  await sheet.getByRole("button", { name: "Add the child" }).click();
  await expect(sheet.getByText("Enter the child's name.")).toBeVisible();
  await expect(sheet.getByText("Enter the date of birth.")).toBeVisible();
  await expect(sheet.getByText("Tick the box to add the child.")).toBeVisible();

  await sheet.getByRole("textbox", { name: /^Name/ }).fill("Ada");
  await typeDate(sheet, family.dateOfBirth);
  await sheet.getByRole("radio", { name: "Female" }).check();
  await consent.check();

  // A slow answer: the control says what is happening and keeps its width. Located by its type,
  // because its accessible name changes to the pending words while the request runs.
  const submit = sheet.locator("button[type='submit']");
  const width = (await submit.boundingBox())?.width ?? 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/children", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    return route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:tidefern:problem:internal",
        title: "Internal",
        status: 500,
      }),
    });
  });
  await submit.click();
  await expect(sheet.getByRole("button", { name: "Adding", exact: true })).toBeVisible();
  expect(Math.abs(((await submit.boundingBox())?.width ?? 0) - width)).toBeLessThanOrEqual(1);
  release();
  await expect(sheet.getByText("We could not add the child. Try again.")).toBeVisible();
  await expect(sheet).toBeVisible();
  await page.unroute("**/api/v1/children");

  // Try again: the API adds the child with the consent, and the page reads it back.
  await submit.click();
  await expect(page.getByText("Ada was added.")).toBeVisible();
  await expect(sheet).toBeHidden();
  const card = page.getByRole("article", { name: "Ada" });
  await expect(card.getByRole("heading", { level: 2, name: "Ada" })).toBeVisible();
  await expect(card.locator("header p")).toHaveText("10 days");
  await expect(card.getByText("Guardian: you")).toBeVisible();
  await expect(card.locator("[data-warmth]")).toHaveCount(1);
  const href = await card
    .getByRole("link", { name: "Timeline, growth and milestones for Ada" })
    .getAttribute("href");
  family.childId = href?.split("/").pop();
  expect(family.childId).toMatch(/^[0-9a-f-]{36}$/);
  await expectNoOverflow(page, "/family with a new child");
});

test("quick logging: a diaper with Undo, a bottle, a timed breast feed and a sleep", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const family = await freshFamily(page);
  if (family === null) return expectFailedRead(page, "/family");
  expect(family.childId, "the add-a-child test runs first").toBeDefined();
  await page.clock.install({ time: new Date() });
  await open(page, "/family");
  const card = page.getByRole("article", { name: "Ada" });
  const rows = card.locator("dl > div");

  // A diaper, then its Undo.
  let sheet = await openSheet(
    page,
    card.getByRole("button", { name: "Diaper for Ada" }),
    "Log a diaper for Ada",
  );
  await sheet.getByRole("radio", { name: "Wet", exact: true }).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Diaper saved.")).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(rows.filter({ hasText: "Last diaper" })).toContainText("just now");
  await expect(rows.filter({ hasText: "Last diaper" })).toContainText("Today: 1 (1 wet, 0 dirty)");
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByText("That entry was removed.")).toBeVisible();
  await expect(rows.filter({ hasText: "Last diaper" })).toContainText("None logged yet");

  // A bottle of 90 ml.
  sheet = await openSheet(
    page,
    card.getByRole("button", { name: "Feed for Ada" }),
    "Log a feed for Ada",
  );
  await sheet.getByRole("radio", { name: "Bottle" }).check();
  await sheet.getByRole("textbox", { name: "Amount" }).fill("90");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Feed saved.")).toBeVisible();
  await expect(rows.filter({ hasText: "Last feed" })).toContainText("Today: 1");

  // A breast feed timed on the client and posted once, at Stop, with both instants.
  sheet = await openSheet(
    page,
    card.getByRole("button", { name: "Feed for Ada" }),
    "Log a feed for Ada",
  );
  await sheet.getByRole("radio", { name: "Breast" }).check();
  await sheet.getByRole("radio", { name: "Left" }).check();
  await sheet.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward("05:00");
  await expect(sheet.getByRole("timer")).toHaveText(/^05:0\d$/);
  const posted = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("/events"),
  );
  await sheet.getByRole("button", { name: "Stop and save" }).click();
  const body = (await posted).postDataJSON() as Record<string, string>;
  expect(body).toMatchObject({ kind: "feed", feedMethod: "breast", side: "left" });
  const minutes =
    (Date.parse(body.endedAt as string) - Date.parse(body.startedAt as string)) / 60_000;
  expect(minutes).toBeGreaterThanOrEqual(5);
  expect(minutes).toBeLessThan(6);
  await expect(card.getByText("Feed saved.")).toBeVisible();
  await expect(rows.filter({ hasText: "Last feed" })).toContainText("Today: 2");

  // A sleep started now, then ended.
  sheet = await openSheet(
    page,
    card.getByRole("button", { name: "Sleep for Ada" }),
    "Log a sleep for Ada",
  );
  await sheet.getByRole("button", { name: "Start sleep" }).click();
  await expect(card.getByText("Sleep started.")).toBeVisible();
  await expect(rows.filter({ hasText: "Sleep" })).toContainText("Asleep since");
  sheet = await openSheet(
    page,
    card.getByRole("button", { name: "End sleep for Ada" }),
    "End Ada's sleep",
  );
  await sheet.getByRole("button", { name: "End sleep" }).click();
  await expect(card.getByText("Sleep ended.")).toBeVisible();
  await expect(rows.filter({ hasText: "Last sleep" })).toContainText("Ended just now");

  // The timeline on the child's page has them, newest first.
  await open(page, `/family/${family.childId}`);
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByRole("listitem").first()).toContainText("Sleep");
  await expect(timeline.getByText("Breast feed, left side")).toBeVisible();
  await expect(timeline.getByText("Bottle feed, 90 ml")).toBeVisible();
  await expect(timeline.getByText(/^Diaper/)).toHaveCount(0);
});

test("quick logging says what is happening, what failed and that the browser is offline", async ({
  page,
}) => {
  const family = await freshFamily(page);
  if (family === null) return expectFailedRead(page, "/family");
  await open(page, "/family");
  const card = page.getByRole("article", { name: "Ada" });
  const sheet = await openSheet(
    page,
    card.getByRole("button", { name: "Diaper for Ada" }),
    "Log a diaper for Ada",
  );
  // By its type: its accessible name changes to "Saving" while the request runs.
  const save = sheet.locator("button[type='submit']");
  await expect(save).toHaveText("Save");
  const width = (await save.boundingBox())?.width ?? 0;

  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/children/*/events", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    return route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:tidefern:problem:internal",
        title: "Internal",
        status: 500,
      }),
    });
  });
  await save.click();
  await expect(sheet.getByRole("button", { name: /Saving/ })).toBeVisible();
  expect(Math.abs(((await save.boundingBox())?.width ?? 0) - width)).toBeLessThanOrEqual(1);
  release();
  await expect(sheet.getByText("We could not save this diaper. Try again.")).toBeVisible();
  await expect(sheet).toBeVisible();
  await page.unroute("**/api/v1/children/*/events");

  await page.context().setOffline(true);
  await save.click();
  await expect(sheet.getByText("You are offline. Connect, then try again.")).toBeVisible();
  await page.context().setOffline(false);

  for (const theme of ["light", "dark"] as const) {
    await expectAccessible(page, theme, "the diaper sheet with a failure");
  }
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(card.locator("dl > div").filter({ hasText: "Last diaper" })).toContainText(
    "None logged yet",
  );
});

test("growth on a fresh child: a measurement refused before birth, one added, the unit toggle", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const family = await freshFamily(page);
  if (family === null) return expectFailedRead(page, "/family");
  await open(page, `/family/${family.childId}`);
  const growth = await chooseTab(page, "Growth");
  const empty = growth.getByRole("region", { name: "No measurements yet" });
  await expect(empty).toBeVisible();
  let sheet = await openSheet(
    page,
    empty.getByRole("button", { name: "Add a measurement" }),
    "Add a measurement for Ada",
  );

  // The API refuses a date before the birth; the field says so.
  const before = new Date(`${family.dateOfBirth}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  await typeDate(sheet, before.toISOString().slice(0, 10));
  await sheet.getByRole("textbox", { name: "Weight", exact: true }).fill("3.6");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("That date is before Ada was born. Check the date.")).toBeVisible();

  await typeDate(sheet, family.me.today);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Measurement added.")).toBeVisible();
  await expect(sheet).toBeHidden();
  const readings = growth.getByRole("list", { name: "Readings" });
  await expect(readings).toContainText("3.6 kg");
  await expect(growth.getByText(/Approximate in the first eight weeks\./)).toBeVisible();

  // The toggle converts the stored grams at the edge; the sheet's fields follow it.
  await growth.getByRole("radio", { name: "lb" }).check();
  await expect(readings).toContainText("7.9 lb");
  sheet = await openSheet(
    page,
    growth.getByRole("button", { name: "Add a measurement" }),
    "Add a measurement for Ada",
  );
  await expect(sheet.getByRole("textbox", { name: "Weight, ounces" })).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "lb and in" })).toBeChecked();
  for (const theme of ["light", "dark"] as const) {
    await expectAccessible(page, theme, "the measurement sheet");
  }
  await sheet.getByRole("button", { name: "Close" }).click();
  await expectNoOverflow(page, "the growth tab with one measurement");
});

test("milestones on a fresh child: a check saved, a failure said beside its item", async ({
  page,
}) => {
  const family = await freshFamily(page);
  if (family === null) return expectFailedRead(page, "/family");
  await open(page, `/family/${family.childId}`);
  const milestones = await chooseTab(page, "Milestones");
  await expect(milestones.getByRole("region", { name: "Nothing marked yet" })).toBeVisible();
  const box = milestones.getByRole("checkbox", { name: "Looks at your face" });

  await page.route("**/api/v1/children/*/milestones", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          body: JSON.stringify({
            type: "urn:tidefern:problem:internal",
            title: "Internal",
            status: 500,
          }),
        })
      : route.continue(),
  );
  // A click, not check(): the box changes only once the API answers, and here it never agrees.
  await box.click();
  await expect(milestones.getByText("We could not save this. Try again.")).toBeVisible();
  await expect(box).not.toBeChecked();
  await page.unroute("**/api/v1/children/*/milestones");

  await box.click();
  await expect(box).toBeChecked();
  await expect(milestones.getByText(/^Marked on /)).toBeVisible();
  await expect(milestones.getByRole("region", { name: "Nothing marked yet" })).toHaveCount(0);
  await chooseTab(page, "Timeline");
  await expect(page.getByText("Milestone: Looks at your face")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await expectAccessible(page, theme, "a fresh child's timeline");
  }
});

test("the quick-log and add-a-child sheets have no axe violations at 390", async ({ page }) => {
  const family = await freshFamily(page);
  if (family === null) return expectFailedRead(page, "/family");
  await everyWidthAndTheme(page, "the feed sheet", async () => {
    await open(page, "/family");
    const sheet = await openSheet(
      page,
      page.getByRole("button", { name: "Feed for Ada" }),
      "Log a feed for Ada",
    );
    await sheet.getByRole("radio", { name: "Breast" }).check();
  });
  await everyWidthAndTheme(page, "the add-a-child sheet", async () => {
    await open(page, "/family");
    await openSheet(page, page.getByRole("button", { name: "Add a child" }), "Add a child");
  });
});
