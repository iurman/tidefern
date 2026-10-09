import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { runDueJobs } from "../jobs";
import { MAIL_CAPTURE_PATH, baseOrigin, onboard } from "../session";
import {
  api,
  authAnswer,
  checkState,
  confirmEmail,
  expectLimiterUntouched,
  ownBrowser,
  signInThroughForm,
  signUpAndSignIn,
} from "./steps";

/**
 * Deleting an account, from the public page to removal (tasks J1 and J3d):
 * a person reaches /account/delete signed out, signs in from it, and
 * closes her account straight after that sign-in (closing needs one from
 * the last ten minutes); she lands on /closing, every page of the app
 * sends her back there, and she undoes it. Then she logs a day, closes
 * again and deletes now, which offers no undo, and the closure job runs
 * for real (architecture 11) through the cron route (jobs.ts) until the
 * processor notice says it finished. After that her session is gone, her
 * password signs nobody in, and her address makes a new account with
 * another id and nothing held, all read through the API. One fresh
 * account of the test's own, made through the forms; no seeded persona
 * changes. Against a server without a database the sign-up form says the
 * server had a problem, and the public page's signed-out state, which
 * needs no server, is asserted. Nothing here is tagged @smoke.
 */

const serverProblem = "Tidefern had a problem on our side. Wait a moment and try again.";
const wrongPassword = "That email and password do not match. Check both, or reset your password.";

/** The slices of the API's answers this flow reads. */
interface Me {
  id: string;
  today: string;
  profile: unknown;
}
interface Closure {
  request: unknown;
}
interface DataSummary {
  categories: { category: string; count: number }[];
}

/** The closure processor notices the mail capture holds; one lands as each closure finishes. */
async function processorNotices(page: Page): Promise<number> {
  const response = await page.request.get(`${baseOrigin()}${MAIL_CAPTURE_PATH}`);
  expect(response.ok(), "the mail capture answers").toBe(true);
  const { messages } = (await response.json()) as { messages: { subject: string }[] };
  return messages.filter(({ subject }) => subject === "Tidefern processor notice").length;
}

/** Rows the data summary counts under every category together. */
function heldRows(summary: DataSummary): number {
  return summary.categories.reduce((sum, { count }) => sum + count, 0);
}

test("from /account/delete signed out: sign in, close, the locked view, undo, close again and delete now, then the job removes her", async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const page = await ownBrowser(browser, info);
  try {
    // The public page, signed out: what closing does, and the sign-in it needs.
    await page.goto("/account/delete");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delete your account");
    await expect(page.getByText("locks it now and deletes it in 7 days")).toBeVisible();
    const signInLink = page.getByRole("link", { name: "Sign in to continue" });
    await expect(signInLink).toHaveAttribute("href", "/sign-in");

    const account = await signUpAndSignIn(page, "Eli", "deletion");
    if (account === null) {
      await expect(page.getByRole("status")).toContainText(serverProblem);
      return;
    }
    await expect(page).toHaveURL(/\/welcome$/);
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Eli" });
    await page.context().clearCookies();

    // From the public page: sign in, back to it, and on to the close action in Settings.
    await page.goto("/account/delete");
    await page.getByRole("link", { name: "Sign in to continue" }).click();
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/today$/);
    await page.goto("/account/delete");
    await page.getByRole("link", { name: "Close my account" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Close with the undo window, a minute after that sign-in.
    await page
      .getByRole("region", { name: "Close account", exact: true })
      .getByRole("button", { name: "Close my account" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Close your account?" });
    await expect(dialog.getByRole("radio", { name: "In 7 days, with time to undo" })).toBeChecked();
    await dialog.getByRole("button", { name: "Close my account" }).click();
    await page.waitForURL(/\/closing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is closing");
    await expect(page.getByText("days left to undo")).toBeVisible();
    await checkState(page, "the locked view while closing");

    // Every way into the app leads back to the locked view; the public page points there too.
    for (const path of ["/today", "/settings", "/sharing", "/calendar"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/closing$/);
    }
    await page.goto("/account/delete");
    await expect(page.getByText("Your account is already closing.")).toBeVisible();
    await page.getByRole("link", { name: "See your account" }).click();
    await expect(page).toHaveURL(/\/closing$/);

    // Undo opens the account again, and Settings is hers once more.
    await page.getByRole("button", { name: "Undo and keep my account" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is open again");
    await page.getByRole("link", { name: "Back to Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // What she holds before she deletes: her id, and a logged day on top of her consent and
    // profile, so the data summary counts rows of hers.
    const before = await api<Me>(page, "/api/v1/me");
    const logged = await page.request.put(`${baseOrigin()}/api/v1/cycle/entries/${before.today}`, {
      data: { flow: "medium", symptoms: [], mood: null },
      headers: { origin: baseOrigin() },
    });
    expect(logged.status(), "her logged day").toBe(200);
    expect(heldRows(await api<DataSummary>(page, "/api/v1/me/data-summary"))).toBeGreaterThan(0);

    // Anything an earlier spec left due runs now, so the run after her close finishes hers alone
    // (one worker), and the processor notice it sends is hers.
    expect((await runDueJobs(page.request)).failed, "jobs left by earlier specs").toBe(0);
    const noticesBefore = await processorNotices(page);

    // Close again and delete now: its own words, and no undo.
    await page.goto("/settings/close-account");
    await page.getByRole("button", { name: "Close my account" }).click();
    await dialog.getByRole("radio", { name: "Now, with no undo" }).click();
    await expect(dialog).toContainText("There is no undo.");
    await dialog.getByRole("button", { name: "Delete my account now" }).click();

    // The suite's server keeps the closure job for the scheduled run (E2E_JOBS_SCHEDULED_ONLY, never
    // on Vercel, where the inline drain starts it straight after the answer), so the view between
    // the close and the deletion is stable here and gets the same checks as every other state.
    await page.waitForURL(/\/closing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your account is being deleted",
    );
    await expect(page.getByText("You chose to delete it now, so there is no undo.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    await checkState(page, "the locked view while deleting");

    // The scheduled run, as Vercel Cron sends it, until the closure has finished: the closure
    // sends the processor notice only once it is completed (architecture 11), after her rows, her
    // key and her user are gone. A large closure can take more than one run.
    let runs = 0;
    while ((await processorNotices(page)) === noticesBefore) {
      expect(runs, "scheduled runs before her closure finished").toBeLessThan(5);
      const run = await runDueJobs(page.request);
      expect(run.failed, "jobs that failed in the run").toBe(0);
      expect(run.dead, "jobs that died in the run").toBe(0);
      runs += 1;
    }
    expect(await processorNotices(page), "processor notices after her closure").toBe(
      noticesBefore + 1,
    );

    // Her session is gone and no page of the app is hers.
    expect((await page.request.get("/api/v1/me")).status(), "her old session").toBe(401);
    for (const path of ["/closing", "/today", "/settings/close-account"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in$/);
    }

    // She cannot sign in at all: Better Auth has no such user, so her own password is refused
    // the way a wrong one is, and the browser stays signed out.
    await signInThroughForm(page, account);
    const feedback = page.getByRole("status");
    await expect(feedback).toContainText(wrongPassword);
    await expect(feedback).toHaveAttribute("data-tone", "error");
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await page.request.get("/api/v1/me")).status(), "after the refused sign-in").toBe(401);

    // Her rows are gone: the address is free again, and the account made with it is a new person
    // (another id) with no profile, no closure and nothing held under any category.
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Eli");
    await page.getByLabel("Email").fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    const signedUp = authAnswer(page, "/api/auth/sign-up/email");
    await page.getByRole("button", { name: "Create account" }).click();
    await signedUp;
    await expect(page.getByRole("status")).toContainText("Check your inbox");
    await confirmEmail(page, account.email);
    await page.goto("/sign-in");
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/welcome$/);
    const after = await api<Me>(page, "/api/v1/me");
    expect(after.id, "the new account's id").not.toBe(before.id);
    expect(after.profile, "the new account's profile").toBeNull();
    expect((await api<Closure>(page, "/api/v1/me/close")).request, "her closure").toBeNull();
    expect(heldRows(await api<DataSummary>(page, "/api/v1/me/data-summary"))).toBe(0);
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});
