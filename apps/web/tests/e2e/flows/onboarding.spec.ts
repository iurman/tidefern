import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import {
  addDays,
  agreeToTerms,
  api,
  checkState,
  expectLimiterUntouched,
  longDate,
  nextStep,
  ownBrowser,
  shellNavigation,
  signUpAndSignIn,
  skipPasskey,
  stepHeading,
  typeDate,
  zoneAndStage,
} from "./steps";

/**
 * Onboarding as a new person walks it, across pages (task J1): the sign-up
 * form, the captured confirmation mail, the sign-in form, /welcome for
 * each stage, and her first Today, whose shell then shows the
 * destinations her stage brings and leads to the one that holds what she
 * just entered. One fresh account per stage in a browser of its own, so
 * no seeded persona is touched; the browser is in Berlin and every date is
 * read from the API's calendar at run time. Per-step pending, failure and
 * retry states are welcome.spec.ts's; this file proves the path joins up.
 * Against a server without a database the sign-up form says the server had
 * a problem, which each test asserts instead. Nothing here is tagged
 * @smoke.
 */

const ZONE = "Europe/Berlin";
const serverProblem = "Tidefern had a problem on our side. Wait a moment and try again.";

test.use({ timezoneId: ZONE });

interface Me {
  today: string;
  profile: { stage: string; timeZone: string } | null;
}

/** Signs a new person up and in through the forms; null (after asserting the failure) without a database. */
async function newcomer(page: Page, name: string, label: string): Promise<boolean> {
  const account = await signUpAndSignIn(page, name, label);
  if (account === null) {
    await expect(page.getByRole("status")).toContainText(serverProblem);
    return false;
  }
  // Today first, and the layout sends an account without a profile on to onboarding.
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Tidefern");
  return true;
}

/**
 * The calendar day in Berlin on the API's clock. A person without a profile
 * has no zone yet, so it is read from Noor, whose zone is Berlin, through
 * the worker's one sign-in for her (../fixtures.ts).
 */
async function berlinToday(noor: Page): Promise<string> {
  const me = await api<Me>(noor, "/api/v1/me");
  expect(me.profile?.timeZone, "Noor's calendar is Berlin's").toBe(ZONE);
  return me.today;
}

/** Today's heading, the shell's destinations in order, and Today marked as the current one. */
async function expectFirstToday(page: Page, destinations: readonly string[]) {
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Today, / })).toBeVisible();
  const { rail } = shellNavigation(page);
  await expect(rail.getByRole("list").getByRole("link")).toHaveText([...destinations]);
  await expect(rail.getByRole("link", { name: "Today", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText(/could not load/)).toHaveCount(0);
}

test("cycle: from the sign-up form through /welcome to Today, and the period start is on the calendar", async ({
  browser,
  noor,
}, info) => {
  test.setTimeout(180_000);
  const page = await ownBrowser(browser, info, { timezoneId: ZONE });
  try {
    if (!(await newcomer(page, "Ines", "onboard-cycle"))) return;
    const today = await berlinToday(noor);
    const start = addDays(today, -12);
    await checkState(page, "/welcome, step 1");

    await zoneAndStage(page, ZONE, "Cycle");
    await stepHeading(page, "Your dates");
    await typeDate(page, /When did your last period start/, start);
    await nextStep(page);
    await stepHeading(page, "Your consent");
    await agreeToTerms(page);
    await nextStep(page);
    await skipPasskey(page);

    await expectFirstToday(page, ["Today", "Calendar", "Sharing", "Settings"]);
    // Twelve days after the start she logged is cycle day 13, on the API's calendar and on the page.
    await expect(page.getByText("day of your cycle", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Cycle day 13 of about / })).toBeVisible();
    await checkState(page, "her first Today");

    // The shell leads to the calendar, which shows the start she entered in onboarding.
    await shellNavigation(page).rail.getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(page).toHaveURL(/\/calendar/);
    const month = start.slice(0, 7);
    if (!page.url().includes(month)) await page.goto(`/calendar?month=${month}`);
    await expect(
      page
        .getByRole("grid")
        .getByRole("button", { name: new RegExp(`^${longDate(start)}, .*period`) }),
    ).toBeVisible();
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});

test("pregnancy: through /welcome dated from the last period, to Today and the journey it opens", async ({
  browser,
  noor,
}, info) => {
  test.setTimeout(180_000);
  const page = await ownBrowser(browser, info, { timezoneId: ZONE });
  try {
    if (!(await newcomer(page, "Oda", "onboard-pregnancy"))) return;
    const today = await berlinToday(noor);
    await zoneAndStage(page, ZONE, "Pregnancy");
    await stepHeading(page, "Your dates");
    await page.getByRole("radio", { name: "From my last period" }).check();
    await typeDate(page, /First day of your last period/, addDays(today, -70));
    await nextStep(page);
    await stepHeading(page, "Your consent");
    await agreeToTerms(page);
    await nextStep(page);
    await skipPasskey(page);

    await expectFirstToday(page, ["Today", "Calendar", "Journey", "Sharing", "Settings"]);
    // Seventy days since the last period is ten weeks.
    const pregnancy = await api<{ dueDate: string; status: string }>(
      page,
      "/api/v1/pregnancies/current",
    );
    expect(pregnancy).toMatchObject({ status: "active", dueDate: addDays(today, 210) });
    await expect(page.getByRole("main")).toContainText(/Week\s*10(?!\d)/);
    await expect(page.getByRole("main")).toContainText("210 days to go");
    await checkState(page, "her first Today in a pregnancy");

    await shellNavigation(page).rail.getByRole("link", { name: "Journey", exact: true }).click();
    await expect(page).toHaveURL(/\/journey$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText(/Week\s*10(?!\d)|10 weeks/);
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});

test("postpartum: through /welcome with the baby and the guardian's consent, to Today and Family", async ({
  browser,
  noor,
}, info) => {
  test.setTimeout(180_000);
  const page = await ownBrowser(browser, info, { timezoneId: ZONE });
  try {
    if (!(await newcomer(page, "Uma", "onboard-postpartum"))) return;
    const today = await berlinToday(noor);
    await zoneAndStage(page, ZONE, "Postpartum");
    await stepHeading(page, "Your dates");
    await page.getByRole("textbox", { name: /Your baby's name/ }).fill("Ari");
    await typeDate(page, /When was the birth/, addDays(today, -45));
    await page.getByRole("checkbox", { name: /I agree on my baby's behalf/ }).check();
    await nextStep(page);
    await stepHeading(page, "Your consent");
    await agreeToTerms(page);
    await nextStep(page);
    await skipPasskey(page);

    await expectFirstToday(page, ["Today", "Calendar", "Journey", "Family", "Sharing", "Settings"]);
    // Forty-five days is six weeks and three days.
    await expect(page.getByRole("main")).toContainText("Ari");
    await expect(page.getByRole("main")).toContainText("6 weeks, 3 days");
    await checkState(page, "her first Today after a birth");

    await shellNavigation(page).rail.getByRole("link", { name: "Family", exact: true }).click();
    await expect(page).toHaveURL(/\/family$/);
    await expect(page.getByRole("main")).toContainText("Ari");
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});

test("here for someone else: through /welcome with no dates and no consent, to a Today that asks nothing", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const page = await ownBrowser(browser, info, { timezoneId: ZONE });
  try {
    if (!(await newcomer(page, "Kai", "onboard-none"))) return;
    await zoneAndStage(page, ZONE, "Here for someone else");
    await stepHeading(page, "Before you start");
    await agreeToTerms(page, { consent: false });
    await nextStep(page);
    await skipPasskey(page);

    await expectFirstToday(page, ["Today", "Calendar", "Sharing", "Settings"]);
    // Never a body question: no open card and no quick log at either width.
    await expect(page.getByRole("region", { name: "Log today" })).toHaveCount(0);
    await expect(shellNavigation(page).rail.getByRole("button", { name: "Log today" })).toHaveCount(
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(shellNavigation(page).bar.getByRole("button", { name: "Log today" })).toHaveCount(
      0,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const consents = await api<{ items: unknown[] }>(page, "/api/v1/me/consents");
    expect(consents.items).toEqual([]);
    await checkState(page, "a Today with nothing to log");
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});
