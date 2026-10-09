import { expect, test } from "@playwright/test";
import { onboard } from "../session";
import {
  checkState,
  expectLimiterUntouched,
  ownBrowser,
  signInThroughForm,
  signUpAndSignIn,
} from "./steps";

/**
 * Deleting an account, from the public page to the locked view and back
 * (task J1): a person reaches /account/delete signed out, signs in from
 * it, and closes her account straight after that sign-in (closing needs
 * one from the last ten minutes); she lands on /closing, every page of the
 * app sends her back there, and she undoes it. Then she closes again and
 * deletes now, which offers no undo, and after signing out she cannot get
 * back into the app: a sign-in lands on the locked view. One fresh account of the test's own, made through the
 * forms; no seeded persona changes. Against a server without a database
 * the sign-up form says the server had a problem, and the public page's
 * signed-out state, which needs no server, is asserted. Nothing here is
 * tagged @smoke.
 */

const serverProblem = "Tidefern had a problem on our side. Wait a moment and try again.";

test("from /account/delete signed out: sign in, close, the locked view, undo, close again and delete now, then no way back in", async ({
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

    // Close again and delete now: its own words, and no undo.
    await page.goto("/settings/close-account");
    await page.getByRole("button", { name: "Close my account" }).click();
    await dialog.getByRole("radio", { name: "Now, with no undo" }).click();
    await expect(dialog).toContainText("There is no undo.");
    await dialog.getByRole("button", { name: "Delete my account now" }).click();
    await page.waitForURL(/\/closing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your account is being deleted",
    );
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    await checkState(page, "the locked view while deleting");

    // Signed out, a sign-in never reaches the app again: it lands on the locked view, and every
    // page of the app sends her back to it. The deletion itself is a job (architecture 11, task
    // I2) that runs only where the host has its owner connection; the browser suite's server has
    // none (DATABASE_URL_UNPOOLED is unset there, as in CI), so the account still exists here and
    // the password still matches. Once the job has run, Better Auth has no such user to sign in.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get("/api/v1/me")).status(), "signed out").toBe(401);
    await page.goto("/sign-in");
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/closing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your account is being deleted",
    );
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    for (const path of ["/today", "/settings/close-account"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/closing$/);
    }
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});
