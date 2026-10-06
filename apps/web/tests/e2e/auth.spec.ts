import { expect, test, type Page, type Route } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

/**
 * The auth routes against the production build without a database: every
 * request to /api/auth is answered by page.route with a canned body, so
 * nothing here authenticates and nothing is tagged @smoke.
 */

const routes = [
  { path: "/sign-up", title: "Create an account | Tidefern", heading: "Create your account" },
  { path: "/sign-in", title: "Sign in | Tidefern", heading: "Sign in" },
  { path: "/verify", title: "Verify your email | Tidefern", heading: "Confirm your email" },
  {
    path: "/verify?done=1",
    title: "Verify your email | Tidefern",
    heading: "Your email is confirmed",
  },
  {
    // What Better Auth sends when the token fails: the callback's own query, then the error.
    path: "/verify?done=1&error=INVALID_TOKEN",
    title: "Verify your email | Tidefern",
    heading: "This link no longer works",
  },
  {
    path: "/verify?error=INVALID_TOKEN",
    title: "Verify your email | Tidefern",
    heading: "This link no longer works",
  },
  { path: "/reset", title: "Reset your password | Tidefern", heading: "Reset your password" },
  {
    path: "/reset?error=INVALID_TOKEN",
    title: "Reset your password | Tidefern",
    heading: "Reset your password",
  },
  {
    path: "/reset/sample-token",
    title: "Choose a new password | Tidefern",
    heading: "Choose a new password",
  },
] as const;

function problem(route: Route, status: number, code: string, message: string) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ code, message }),
  });
}

/** The passkey autofill offer on /sign-in must never reach a server in this suite. */
async function silencePasskeys(page: Page) {
  await page.route("**/api/auth/passkey/**", (route) =>
    problem(route, 500, "INTERNAL", "No passkeys in this suite"),
  );
}

async function fillSignIn(page: Page) {
  await silencePasskeys(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("person@example.com");
  await page.locator('input[name="password"]').fill("correct horse battery");
}

for (const theme of ["light", "dark"] as const) {
  test(`every auth route renders with no axe violations in ${theme} mode`, async ({ page }) => {
    await silencePasskeys(page);
    for (const route of routes) {
      await expectNoAxeViolations(page, route.path, theme);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
    }
  });
}

test("every auth route carries its title, one H1, a form where one belongs, and noindex", async ({
  page,
}) => {
  await silencePasskeys(page);
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page).toHaveTitle(route.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    if (route.path.startsWith("/verify")) {
      await expect(page.locator("form")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    } else {
      await expect(page.locator("form")).toHaveCount(1);
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    }
  }
});

test("the sign-out route refuses GET", async ({ request }) => {
  const response = await request.get("/sign-out", { maxRedirects: 0 });
  expect(response.status()).toBe(405);
});

test("the sign-out route redirects with a path, never the server's own host", async ({
  request,
}) => {
  // Without a database the auth server cannot clear a session, so the route sends
  // the person back to /today; with a database and no session the sign-out
  // succeeds and the route sends them home. The point here is the shape of the
  // Location: a path, never the server's own host.
  const response = await request.post("/sign-out", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers()["location"]).toMatch(/^\/(today)?$/);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
});

test("today sends a visitor without a session to sign in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
});

test("sign-in shows the next step when the server refuses the password", async ({ page }) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    problem(route, 401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password"),
  );
  await fillSignIn(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const feedback = page.getByRole("status");
  await expect(feedback).toContainText(
    "That email and password do not match. Check both, or reset your password.",
  );
  await expect(feedback).toHaveAttribute("data-tone", "error");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("sign-in shows its pending state while the request is in flight", async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/sign-in/email", async (route) => {
    await held;
    await problem(route, 401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password");
  });
  await fillSignIn(page);
  // By type, because the accessible name changes to the pending text while it loads.
  const button = page.locator('form button[type="submit"]');
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toContainText("Signing in");
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeDisabled();
  release?.();
  await expect(page.getByRole("status")).toContainText("do not match");
  await expect(button).not.toHaveAttribute("aria-busy", "true");
});

test("sign-in asks for the code when the server wants a second factor", async ({ page }) => {
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ twoFactorRedirect: true, twoFactorMethods: ["totp"] }),
    }),
  );
  await page.route("**/api/auth/two-factor/verify-totp", (route) =>
    problem(route, 401, "INVALID_CODE", "Invalid code"),
  );
  await fillSignIn(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Enter your code");
  const code = page.locator('input[name="code"]');
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");
  // The password form is gone, so focus moves to the new step's field instead of the body,
  // and the field is a fresh one: nothing typed on the previous step carries over.
  await expect(code).toBeFocused();
  await expect(code).toHaveValue("");
  await code.fill("123 456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("status")).toContainText("That code did not match");
  await page.getByRole("button", { name: "Use a backup code instead" }).click();
  await expect(page.getByLabel("Backup code")).toBeVisible();
  await expect(page.getByLabel("Backup code")).toBeFocused();
  await expect(page.getByLabel("Backup code")).toHaveValue("");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("sign-in offers a passkey where the browser has WebAuthn", async ({ page }) => {
  await silencePasskeys(page);
  await page.goto("/sign-in");
  const supported = await page.evaluate(() => "PublicKeyCredential" in window);
  const button = page.getByRole("button", { name: "Sign in with a passkey" });
  if (supported) {
    await expect(button).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "email webauthn");
  } else {
    await expect(button).toHaveCount(0);
  }
});

test("sign-up points an existing email at sign in", async ({ page }) => {
  await page.route("**/api/auth/sign-up/email", (route) =>
    problem(route, 422, "USER_ALREADY_EXISTS", "User already exists."),
  );
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Email").fill("person@example.com");
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText(
    "That email is already in use. Sign in instead.",
  );
});

test("sign-up reports the inbox when the server accepts", async ({ page }) => {
  const bodies: string[] = [];
  await page.route("**/api/auth/sign-up/email", (route) => {
    bodies.push(route.request().postData() ?? "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: null, user: { id: "x", email: "person@example.com" } }),
    });
  });
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Email").fill("person@example.com");
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  await expect(page.locator("form")).toHaveCount(0);
  // The button that was pressed has gone, so the sentence that replaced the form holds focus.
  await expect(page.locator(":focus")).toContainText("Check your inbox");
  expect(bodies).toHaveLength(1);
  // The verification link lands on /verify with the marker the page reads as a result.
  expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ callbackURL: "/verify?done=1" });
});

test("the reset request answers the same sentence whether or not the email exists", async ({
  page,
}) => {
  const bodies: string[] = [];
  await page.route("**/api/auth/request-password-reset", (route) => {
    bodies.push(route.request().postData() ?? "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: true }),
    });
  });
  await page.goto("/reset?error=INVALID_TOKEN");
  await expect(page.getByRole("status")).toContainText("That link has expired");
  await page.getByLabel("Email").fill("person@example.com");
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByRole("status")).toContainText("If that email has an account");
  await expect(page.locator(":focus")).toContainText("If that email has an account");
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ redirectTo: "/reset" });
});

test("a valid reset token moves from the query string onto its own route", async ({ page }) => {
  await page.goto("/reset?token=sample-token");
  await expect(page).toHaveURL(/\/reset\/sample-token$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose a new password");
});

test("the new password form catches a mismatch itself and an expired token from the server", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/auth/reset-password", (route) => {
    requests += 1;
    return problem(route, 400, "INVALID_TOKEN", "Invalid token");
  });
  await page.goto("/reset/sample-token");
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.locator('input[name="confirm"]').fill("correct horse staple");
  await page.getByRole("button", { name: "Set the new password" }).click();
  await expect(page.locator('input[name="confirm"]')).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("The two passwords differ")).toBeVisible();
  expect(requests).toBe(0);
  await page.locator('input[name="confirm"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Set the new password" }).click();
  await expect(page.getByRole("status")).toContainText("This link has expired. Request a new one.");
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
    "href",
    "/reset",
  );
  expect(requests).toBe(1);
});

test("the new password form reports success and hands focus to the sentence", async ({ page }) => {
  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: true }),
    }),
  );
  await page.goto("/reset/sample-token");
  await page.locator('input[name="password"]').fill("correct horse battery");
  await page.locator('input[name="confirm"]').fill("correct horse battery");
  await page.getByRole("button", { name: "Set the new password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password is set");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator(":focus")).toContainText("Your password is set");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
});

test("the auth routes reflow at 320 px without a horizontal scroll", async ({ page }) => {
  await silencePasskeys(page);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of routes) {
    await page.goto(route.path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, route.path).toBeLessThanOrEqual(0);
  }
});
