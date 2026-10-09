import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  MAIL_CAPTURE_PATH,
  baseOrigin,
  paceBrowserAuth,
  rateLimited,
  type Account,
} from "../session";

/**
 * Steps the per-flow suites share (task J1): opening a person's own
 * browser, reading the mail capture, the onboarding steps, and the checks
 * every state a flow reaches gets (axe with the `wcag22aa` tag set in both
 * themes at 1440 and 390, no sideways scroll at 390 and 320).
 */

export type Theme = "light" | "dark";
export const THEMES = ["light", "dark"] as const;

/** The tag set of ./axe.ts. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** Phone and desktop sizes every check uses. */
export const DESKTOP = { width: 1440, height: 900 } as const;
export const PHONE = { width: 390, height: 844 } as const;

/** The test-only password every account a flow signs up shares. */
export const FLOW_PASSWORD = "tidefern-flow-account";

/**
 * The context options a page made by hand would otherwise lose, from the
 * running test's project; `extra` wins.
 */
export function projectOptions(info: TestInfo, extra: BrowserContextOptions = {}) {
  const use = info.project.use;
  return {
    baseURL: baseOrigin(),
    viewport: DESKTOP,
    colorScheme: use.colorScheme ?? "light",
    reducedMotion: use.reducedMotion ?? "reduce",
    extraHTTPHeaders: use.extraHTTPHeaders,
    ...extra,
  } satisfies BrowserContextOptions;
}

/**
 * A browser of one person's own: a new context with the project's options,
 * signed out, whose sign-in and sign-up requests are paced against the
 * limiter (session.ts `paceBrowserAuth`). The caller closes it.
 */
export async function ownBrowser(
  browser: Browser,
  info: TestInfo,
  extra: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext(projectOptions(info, extra));
  await paceBrowserAuth(context);
  return context.newPage();
}

/** A unique `@example.test` address for a flow's own account. */
let addresses = 0;
export function flowAddress(label: string): string {
  addresses += 1;
  return `flow-${label}-${Date.now()}-${addresses}@example.test`;
}

interface CapturedMessage {
  to: string;
  subject: string;
  link?: string;
}

/** The newest captured mail to `email` with this subject, waiting for it to land. */
export async function capturedMail(
  page: Page,
  email: string,
  subject: string | RegExp,
): Promise<CapturedMessage & { link: string }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await page.request.get(`${baseOrigin()}${MAIL_CAPTURE_PATH}`);
    expect(response.ok(), "the mail capture answers").toBe(true);
    const { messages } = (await response.json()) as { messages: CapturedMessage[] };
    const found = messages
      .filter(
        (message) =>
          message.to === email &&
          (typeof subject === "string"
            ? message.subject === subject
            : subject.test(message.subject)),
      )
      .at(-1);
    if (found?.link !== undefined) return { ...found, link: found.link };
    await page.waitForTimeout(250);
  }
  throw new Error(`no mail "${String(subject)}" reached ${email}`);
}

/** Every captured message to `email`, oldest first. */
export async function mailTo(page: Page, email: string): Promise<CapturedMessage[]> {
  const response = await page.request.get(`${baseOrigin()}${MAIL_CAPTURE_PATH}`);
  expect(response.ok(), "the mail capture answers").toBe(true);
  const { messages } = (await response.json()) as { messages: CapturedMessage[] };
  return messages.filter((message) => message.to === email);
}

/**
 * Signs up through the form on /sign-up, as a person would: name, email and
 * password, then the inbox sentence. Returns the account; the session is
 * not signed in yet, because the email must be confirmed first. Null when
 * the server has no database: the form then says the server had a problem.
 */
export async function signUpThroughForm(
  page: Page,
  name: string,
  label: string,
): Promise<Account | null> {
  const account = { email: flowAddress(label), password: FLOW_PASSWORD };
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  const answered = authAnswer(page, "/api/auth/sign-up/email");
  await page.getByRole("button", { name: "Create account" }).click();
  await answered;
  const status = page.getByRole("status");
  await expect(status).toContainText(/Check your inbox|problem on our side/);
  return (await status.textContent())?.includes("Check your inbox") ? account : null;
}

/** Opens the verification link the capture holds for `email` and lands on the confirmed page. */
export async function confirmEmail(page: Page, email: string): Promise<void> {
  const mail = await capturedMail(page, email, /confirm|verify/i);
  await page.goto(mail.link);
  await expect(page).toHaveURL(/\/verify\?done=1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your email is confirmed");
}

/** Fills the sign-in form and submits it; the context's pacing keeps the limiter from tripping. */
export async function signInThroughForm(page: Page, account: Account): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  const answered = authAnswer(page, "/api/auth/sign-in/email");
  await page.locator('form button[type="submit"]').click();
  await answered;
}

/**
 * The server's answer to a form's sign-in or sign-up. The context holds the
 * request back while the limiter's window runs out (`paceBrowserAuth`), up
 * to about eleven seconds, so this waits longer than an expectation would.
 */
export function authAnswer(page: Page, path: string) {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path, {
    timeout: 30_000,
  });
}

/** A fresh account made through the real forms: sign-up, the captured mail, sign-in; null without a database. */
export async function signUpAndSignIn(
  page: Page,
  name: string,
  label: string,
): Promise<Account | null> {
  const account = await signUpThroughForm(page, name, label);
  if (account === null) return null;
  await confirmEmail(page, account.email);
  await page.goto("/sign-in");
  await signInThroughForm(page, account);
  return account;
}

/** Axe on the page as it stands, in one theme. */
export async function expectAxeClean(page: Page, theme: Theme, label: string): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations, `${label} in ${theme}`).toEqual([]);
}

/** Sideways scroll of the document, in pixels; 0 when the page fits. */
export async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * The checks every state a flow reaches gets: axe in both themes at 1440
 * and 390, then no sideways scroll at 390 and 320. Leaves the page at the
 * size and theme it had.
 */
export async function checkState(page: Page, label: string): Promise<void> {
  const restore = page.viewportSize() ?? DESKTOP;
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
  for (const size of [DESKTOP, PHONE]) {
    await page.setViewportSize(size);
    for (const value of THEMES) await expectAxeClean(page, value, `${label} at ${size.width}`);
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await sidewaysScroll(page), `${label} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize(restore);
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

/** The limiter never answered 429 in this worker (architecture 15). */
export function expectLimiterUntouched(): void {
  expect(rateLimited, "requests the limiter refused in this worker").toEqual([]);
}

/** GET a JSON read from the API with the page's session, asserting 200. */
export async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${baseOrigin()}${path}`);
  expect(response.status(), path).toBe(200);
  return (await response.json()) as T;
}

/** A calendar date some days from another, both `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "Monday, Oct 5": the day sheet's title and its saved line. */
export function sheetDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Monday, October 5, 2026": the month grid's day names. */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/* Onboarding at /welcome (task H1), as welcome.spec.ts walks it. */

export async function nextStep(page: Page, name: RegExp | string = /^(Continue|Finish)$/) {
  await page.getByRole("button", { name }).click();
}

export async function stepHeading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

export async function typeDate(page: Page, legend: RegExp, iso: string) {
  const group = page.getByRole("group", { name: legend });
  const [year, month, day] = iso.split("-") as [string, string, string];
  await group.getByLabel("Month").fill(month);
  await group.getByLabel("Day").fill(day);
  await group.getByLabel("Year").fill(year);
}

/** Steps 1 and 2: the browser's zone from the suggestion, then a stage card. */
export async function zoneAndStage(page: Page, zone: string, stage: string) {
  await stepHeading(page, "Where are you?");
  await page.getByRole("button", { name: `Use ${zone}` }).click();
  await expect(page.getByRole("combobox", { name: /Time zone/ })).toHaveValue(zone);
  await nextStep(page);
  await stepHeading(page, "What brings you to Tidefern?");
  await page.getByRole("radio", { name: stage, exact: true }).check();
  await nextStep(page);
}

export async function agreeToTerms(page: Page, { consent = true } = {}) {
  if (consent) await page.getByRole("checkbox", { name: /I agree to Tidefern collecting/ }).check();
  await page.getByRole("checkbox", { name: /I accept the terms of use/ }).check();
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
}

/** The passkey step every path ends on where the browser has WebAuthn: Not now. */
export async function skipPasskey(page: Page) {
  await stepHeading(page, "Add a passkey");
  await page.getByRole("button", { name: "Not now" }).click();
}

/** The navigation landmark the shell shows at this width: the rail from 1024 px, the tab bar below. */
export function shellNavigation(page: Page) {
  const main = page.locator("nav[aria-label='Main']");
  return { rail: main.first(), bar: main.last() };
}
