import { expect, test } from "@playwright/test";
import { onboard } from "../session";
import {
  authAnswer,
  capturedMail,
  checkState,
  expectLimiterUntouched,
  ownBrowser,
  signInThroughForm,
  signUpThroughForm,
} from "./steps";

/**
 * The auth flow across its pages against the production build (task J1):
 * a person signs up through the form, confirms her email from the captured
 * mail, is refused a wrong password, signs in, signs out, and a protected
 * route sends her to sign in and back into the app. Everything runs in a
 * browser of her own whose sign-in and sign-up requests are paced against
 * the limiter, on an account nobody else uses; no seeded persona is
 * touched. Against a server without a database the forms say the server
 * had a problem, which the test asserts instead. Nothing here is tagged
 * @smoke.
 */

const serverProblem = "Tidefern had a problem on our side. Wait a moment and try again.";
const wrongPassword = "That email and password do not match. Check both, or reset your password.";

test("sign up, confirm the captured mail, a wrong password, sign in, sign out, and a protected route there and back", async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const page = await ownBrowser(browser, info);
  try {
    // A signed-out person asking for a page in the app is sent to sign in before anything renders.
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

    const account = await signUpThroughForm(page, "Rae", "auth");
    if (account === null) {
      await expect(page.getByRole("status")).toContainText(serverProblem);
      await page.goto("/sign-in");
      await signInThroughForm(page, { email: "person@example.test", password: "not-checked" });
      await expect(page.getByRole("status")).toContainText(serverProblem);
      await expect(page).toHaveURL(/\/sign-in$/);
      return;
    }
    // The sentence that replaced the form holds focus, and the address names nobody.
    await expect(page.locator(":focus")).toContainText("Check your inbox");
    expect(page.url()).not.toContain(account.email);

    // The captured mail: one confirmation, its link back to this origin's verify page.
    const mail = await capturedMail(page, account.email, "Confirm your email");
    expect(new URL(mail.link).origin).toBe(new URL(page.url()).origin);
    await page.goto(mail.link);
    await expect(page).toHaveURL(/\/verify\?done=1$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your email is confirmed");
    await checkState(page, "the confirmed page");
    await page.getByRole("link", { name: "Sign in" }).click();

    // A wrong password keeps her on sign-in and says what to do next.
    await signInThroughForm(page, { email: account.email, password: `${account.password}-wrong` });
    const feedback = page.getByRole("status");
    await expect(feedback).toContainText(wrongPassword);
    await expect(feedback).toHaveAttribute("data-tone", "error");
    await expect(page).toHaveURL(/\/sign-in$/);
    await checkState(page, "sign-in after a wrong password");

    // The right one: Today first, which sends an account without a profile on to onboarding.
    await page.locator('input[name="password"]').fill(account.password);
    const answered = authAnswer(page, "/api/auth/sign-in/email");
    await page.locator('form button[type="submit"]').click();
    expect((await answered).status()).toBe(200);
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Tidefern");

    // With a profile the app keeps her. Signing out is the button in Settings' Sign out section, and home.
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Rae" });
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await page
      .getByRole("region", { name: "Sign out", exact: true })
      .getByRole("button", { name: "Sign out" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get("/api/v1/me")).status(), "the session is gone").toBe(401);

    // The protected route again: sign in, and she is back in the app, on Today.
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in$/);
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator("nav[aria-label='Main']").first()).toBeVisible();

    // The way back the app offers after a fresh sign-in: `?next=` returns to the page it names.
    await page.context().clearCookies();
    await page.goto("/sign-in?next=%2Fsettings");
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    // A `next` that leaves the origin is refused, and she lands on Today instead.
    await page.context().clearCookies();
    await page.goto("/sign-in?next=%2F%2Felsewhere.example");
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/\/today$/);
    expectLimiterUntouched();
  } finally {
    await page.context().close();
  }
});
