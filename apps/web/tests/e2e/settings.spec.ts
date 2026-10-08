import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { expectNoAxeViolations, type Theme } from "./axe";
import { baseOrigin, freshAccount, onboard, signInAs } from "./session";

/**
 * /settings, its group screens and the locked /closing view against the
 * production build (task H7). Populated states come from the seeded cast,
 * signed in once per persona through the shared helper (session.ts); every
 * profile change made to a seeded persona is put back in a `finally`
 * through the API. The closing flows run only on fresh accounts made
 * through the mail capture endpoint, because a real close or withdrawal
 * revokes grants and sessions for good. Failures and pending states are
 * the browser's own calls answered by `page.route`, so they never reach
 * the server. Against a server without a database the helpers hand back
 * null and the canned cookie, and each test asserts the honest failure
 * state instead. Nothing here is tagged @smoke.
 */

const failedRead = "We could not load this just now. Reload the page to try again.";
const layoutNotice = /could not load your profile just now/;
const themes = ["light", "dark"] as const;

interface Fields {
  displayName: string | null;
  timeZone: string;
  stage: string;
  weekStart: number;
  units: string;
  notificationDetail: string;
}

interface ProfileAnswer extends Fields {
  version: number;
}

function fieldsOf(profile: ProfileAnswer): Fields {
  const { displayName, timeZone, stage, weekStart, units, notificationDetail } = profile;
  return { displayName, timeZone, stage, weekStart, units, notificationDetail };
}

/** GET /api/v1/me/profile with the page's session. */
async function readProfile(page: Page): Promise<ProfileAnswer> {
  const response = await page.request.get(`${baseOrigin()}/api/v1/me/profile`);
  expect(response.ok(), `reading the profile answered ${response.status()}`).toBe(true);
  return (await response.json()) as ProfileAnswer;
}

/** Puts a seeded persona's profile back as it was, with If-Match from a fresh read. */
async function restoreProfile(page: Page, original: Fields) {
  const current = await readProfile(page);
  if (JSON.stringify(fieldsOf(current)) === JSON.stringify(original)) return;
  const origin = baseOrigin();
  const response = await page.request.put(`${origin}/api/v1/me/profile`, {
    data: original,
    headers: { origin, "if-match": `"${current.version}"` },
  });
  expect(response.ok(), `restoring the profile answered ${response.status()}`).toBe(true);
}

/** The axe pass of ./axe on the page as it stands, for a state reached by the person's actions. */
async function expectNoAxeViolationsHere(page: Page, theme: Theme, label: string) {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, `${label} in ${theme}`).toEqual([]);
}

/**
 * The same pass for a route at phone width, taken at the foot of the page. Below the rail's width
 * the tab bar is sticky over the foot of the viewport, so at the top of a long page whichever
 * control straddles its edge is reported as partly covered (target size, 2.5.8), and which one
 * that is depends only on how tall the content above it is: the layout's failure notice moves
 * it. At the foot the bar rests in its own place after the content and covers nothing.
 */
async function expectNoAxeViolationsAtFoot(page: Page, path: string, theme: Theme) {
  await page.goto(path);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectNoAxeViolationsHere(page, theme, `${path} at its foot`);
}

async function expectNoOverflow(page: Page, label: string) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/**
 * The overflow check for an open dialog. A modal <dialog> sits in the top layer, outside the
 * document's scroll width, so expectNoOverflow cannot see it: this measures the dialog itself,
 * which must stay inside the viewport and must not scroll sideways, at 390 and 320.
 */
async function expectDialogFits(page: Page, name: string, label: string) {
  const dialog = page.getByRole("dialog", { name });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const fit = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        viewport: document.documentElement.clientWidth,
        inner: element.scrollWidth - element.clientWidth,
      };
    });
    expect(fit.left, `${label} at ${width}: left edge`).toBeGreaterThanOrEqual(0);
    expect(fit.right, `${label} at ${width}: right edge`).toBeLessThanOrEqual(fit.viewport);
    expect(fit.inner, `${label} at ${width}: sideways scroll inside`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

function group(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function problem(route: Route, status: number, code: string, detail?: string) {
  return route.fulfill({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: `urn:tidefern:problem:${code}`,
      title: "Refused",
      status,
      code,
      ...(detail === undefined ? {} : { detail }),
    }),
  });
}

/** The canned-cookie page on a server without a database: the layout's notice and each group's line. */
async function expectFailedReads(page: Page, path = "/settings") {
  await page.goto(path);
  await expect(page.getByText(layoutNotice)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: failedRead }).first()).toBeVisible();
}

test("Noor's settings show her profile, this device's choices, her consent record and the way out", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  await page.goto("/settings");
  await expect(page).toHaveTitle("Settings | Tidefern");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(
    page.locator("nav[aria-label='Main']").first().getByRole("link", { name: "Settings" }),
  ).toHaveAttribute("aria-current", "page");
  // Whatever the server, the parts of Settings that need no API answer work and sign out is there.
  await expect(group(page, "Theme").getByRole("radio", { name: "Follow system" })).toBeChecked();
  const signOut = group(page, "Sign out").locator("form");
  await expect(signOut).toHaveAttribute("method", "post");
  await expect(signOut).toHaveAttribute("action", "/sign-out");
  if (cookies === null) {
    await expect(page.getByText(layoutNotice)).toBeVisible();
    await expect(group(page, "Profile").getByRole("status")).toHaveText(new RegExp(failedRead));
    await expect(group(page, "Consent record").getByRole("status")).toHaveText(
      new RegExp(failedRead),
    );
    return;
  }

  const profile = group(page, "Profile");
  await expect(profile.getByRole("textbox", { name: "Name" })).toHaveValue("Noor");
  await expect(profile.getByRole("radio", { name: "Tracking my cycle" })).toBeChecked();
  await expect(profile.getByRole("button", { name: "Save profile" })).toBeDisabled();
  await expect(
    group(page, "Time zone").getByRole("combobox", { name: "Your time zone" }),
  ).toHaveValue("Europe/Berlin");
  await expect(group(page, "Units").getByRole("radio", { name: "Metric" })).toBeChecked();
  const notifications = group(page, "Notifications");
  await expect(notifications.getByRole("radio", { name: "Generic" })).toBeChecked();
  await expect(notifications.getByRole("figure")).toContainText("You have a reminder in Tidefern.");
  await expect(notifications.getByText("Emails always stay generic.")).toBeVisible();

  for (const [name, label, href] of [
    ["Sound", "Sound and quiet hours", "/settings/sound"],
    ["Devices", "See your devices", "/settings/devices"],
    ["Two-step sign-in", "Set up two-step sign-in", "/settings/two-factor"],
    ["Activity", "See activity", "/activity"],
  ] as const) {
    await expect(group(page, name).getByRole("link", { name: label })).toHaveAttribute(
      "href",
      href,
    );
  }

  // Her consents span two days, so the record shows twice, each with its own day.
  const consent = group(page, "Consent record");
  await expect(
    consent.getByRole("heading", { level: 3, name: "What Tidefern collects, and why" }),
  ).toHaveCount(2);
  await expect(consent.getByText("Cycle history", { exact: true })).toBeVisible();
  await expect(consent.getByText("Cycle status", { exact: true })).toBeVisible();
  await expect(consent.getByText(/You agreed on .+\. Policy version /)).toHaveCount(2);
  await expect(consent.getByRole("checkbox")).toHaveCount(0);
  // Withdraw or close needs a sign-in from the last ten minutes: the action, or the step before it.
  for (const [name, action, why] of [
    ["Consent record", "Withdraw consent", /withdrawing your consent needs a sign-in/],
    ["Close account", "Close my account", /closing your account needs a sign-in/],
    ["Export", "Download my data", /downloading your data needs a sign-in/],
  ] as const) {
    await expect(
      group(page, name).getByRole("button", { name: action }).or(group(page, name).getByText(why)),
    ).toBeVisible();
  }
});

test("a profile change is one whole PUT with If-Match, saved, shown again after a reload and put back", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  if (cookies === null) {
    await expectFailedReads(page);
    return;
  }
  const original = fieldsOf(await readProfile(page));
  try {
    await page.goto("/settings");
    const profile = group(page, "Profile");
    await profile.getByRole("textbox", { name: "Name" }).fill("  Noor Settings  ");
    const sent = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/api/v1/me/profile"),
    );
    await profile.getByRole("button", { name: "Save profile" }).click();
    const request = await sent;
    // Every field goes with the change, so nothing the group did not touch falls back to a default.
    expect(request.postDataJSON()).toEqual({ ...original, displayName: "Noor Settings" });
    expect(request.headers()["if-match"]).toMatch(/^"\d+"$/);
    await expect(profile.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(group(page, "Profile").getByRole("textbox", { name: "Name" })).toHaveValue(
      "Noor Settings",
    );
  } finally {
    await restoreProfile(page, original);
  }
});

test("units save at once and come back after a reload; the theme follows the system, light or dark on this device", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  const original = cookies === null ? null : fieldsOf(await readProfile(page));
  try {
    await page.goto("/settings");
    const theme = group(page, "Theme");
    await theme.getByRole("radio", { name: "Dark" }).click();
    const root = () =>
      page.evaluate(() => [
        document.documentElement.dataset.theme,
        document.documentElement.dataset.themeSource,
        localStorage.getItem("tidefern-theme-v1"),
      ]);
    expect(await root()).toEqual(["dark", "user", "dark"]);
    await page.reload();
    expect(await root()).toEqual(["dark", "user", "dark"]);
    await expect(group(page, "Theme").getByRole("radio", { name: "Dark" })).toBeChecked();
    // Follow system stores nothing, and the page shows the system's own theme again.
    await group(page, "Theme").getByRole("radio", { name: "Follow system" }).click();
    expect(await root()).toEqual(["light", "system", null]);

    if (original === null) {
      await expect(group(page, "Units").getByRole("status")).toHaveText(new RegExp(failedRead));
      return;
    }
    const units = group(page, "Units");
    await units.getByRole("radio", { name: "Imperial" }).click();
    await expect(units.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(group(page, "Units").getByRole("radio", { name: "Imperial" })).toBeChecked();
  } finally {
    if (original !== null) await restoreProfile(page, original);
  }
});

test("the lock-screen preview follows each notification level and email stays generic", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  if (cookies === null) {
    await expectFailedReads(page);
    return;
  }
  const original = fieldsOf(await readProfile(page));
  try {
    await page.goto("/settings");
    const notifications = group(page, "Notifications");
    for (const [level, text] of [
      ["Gentle", "[OWNER] The gentle reminder wording"],
      ["Detailed", "[OWNER] The detailed reminder wording"],
      ["Generic", "You have a reminder in Tidefern."],
    ] as const) {
      await notifications.getByRole("radio", { name: level }).click();
      await expect(notifications.getByRole("figure")).toContainText(text);
      await expect(notifications.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
      await expect(notifications.getByText("Emails always stay generic.")).toBeVisible();
    }
    expect((await readProfile(page)).notificationDetail).toBe("generic");
  } finally {
    await restoreProfile(page, original);
  }
});

test("a stage the API refuses keeps the choice and points to Journey, and nothing is written", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  if (cookies === null) {
    await expectFailedReads(page);
    return;
  }
  const before = await readProfile(page);
  await page.goto("/settings");
  const profile = group(page, "Profile");
  await profile.getByRole("radio", { name: "Pregnant" }).click();
  await profile.getByRole("button", { name: "Save profile" }).click();
  await expect(profile.getByRole("status")).toContainText(
    "A pregnancy starts in Journey, with a due date or your last period.",
  );
  await expect(profile.getByRole("link", { name: "Open Journey" })).toHaveAttribute(
    "href",
    "/journey",
  );
  await expect(profile.getByRole("radio", { name: "Pregnant" })).toBeChecked();
  expect(await readProfile(page)).toEqual(before);
  await page.reload();
  await expect(
    group(page, "Profile").getByRole("radio", { name: "Tracking my cycle" }),
  ).toBeChecked();

  // Lena's pregnancy is recorded, so Journey decides her stage (the real PUT is refused, writing nothing).
  await signInAs(page, "lena");
  const lena = await readProfile(page);
  await page.goto("/settings/profile");
  await expect(page.getByRole("radio", { name: "Pregnant" })).toBeChecked();
  await page.getByRole("radio", { name: "Tracking my cycle" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText(
    "While a pregnancy is recorded, Journey sets your stage.",
  );
  expect(await readProfile(page)).toEqual(lena);
});

test("a profile save shows Saving, then says what to do next when it is refused or cannot be sent", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  if (cookies === null) {
    await expectFailedReads(page);
    return;
  }
  const answers: ((route: Route) => Promise<void>)[] = [];
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  answers.push(async (route) => {
    await held;
    await problem(route, 500, "internal");
  });
  answers.push((route) => problem(route, 409, "conflict", "stale_version"));
  answers.push((route) => route.abort("internetdisconnected"));
  await page.route("**/api/v1/me/profile", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const answer = answers.shift();
    if (answer === undefined) throw new Error("a fourth save was not expected");
    await answer(route);
  });
  await page.goto("/settings");
  const profile = group(page, "Profile");
  await profile.getByRole("textbox", { name: "Name" }).fill("Noor Pending");
  // By its type: while pending, the button's name is its pending label.
  const save = profile.locator('button[type="submit"]');
  await expect(save).toHaveAccessibleName("Save profile");
  await save.click();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(save).toHaveAccessibleName("Saving");
  await expect(profile.getByRole("status").filter({ hasText: "Saving" })).toBeVisible();
  release?.();
  await expect(profile.getByRole("status")).toContainText("problem on our side");
  await expect(save).not.toHaveAttribute("aria-busy", "true");
  // Her draft stays after each refusal, so the next press tries it again.
  await save.click();
  await expect(profile.getByRole("status")).toContainText("changed somewhere else");
  await save.click();
  await expect(profile.getByRole("status")).toContainText("Check your connection");
  await expect(profile.getByRole("textbox", { name: "Name" })).toHaveValue("Noor Pending");
  expect((await readProfile(page)).displayName).toBe("Noor");
});

test("export downloads the whole file after a fresh sign-in, and says each other outcome", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cookies = await signInAs(page, "noor", { fresh: true });
  await page.goto("/settings");
  const exportGroup = group(page, "Export");
  const button = exportGroup.getByRole("button", { name: "Download my data" });
  if (cookies === null) {
    // No database: the read behind the export fails on the server, and the page says so.
    await button.click();
    await expect(exportGroup.getByRole("status")).toContainText("problem on our side");
    return;
  }
  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("tidefern-export.ndjson");
  const lines = (await readFile(await file.path(), "utf8")).trim().split("\n");
  expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ kind: "export", format: 1 });
  const end = JSON.parse(lines.at(-1) ?? "{}") as { kind: string; records: number };
  expect(end).toEqual({ kind: "end", records: lines.length - 2 });
  await expect(
    exportGroup.getByRole("status").filter({ hasText: "Your file is ready" }),
  ).toContainText(`${end.records} records`);

  // A file cut off partway is never offered.
  await page.route("**/api/v1/me/export", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: `${lines[0]}\n${lines[1] ?? ""}\n`,
    }),
  );
  await page.goto("/settings");
  await group(page, "Export").getByRole("button", { name: "Download my data" }).click();
  await expect(group(page, "Export").getByRole("status")).toContainText(
    "The download stopped partway, so the file is incomplete. Download it again.",
  );

  // A refusal for an old sign-in is the step to sign in again, returning here; the pending state first.
  await page.unroute("**/api/v1/me/export");
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/me/export", async (route) => {
    await held;
    await problem(route, 401, "unauthenticated", "fresh_authentication_required");
  });
  await page.goto("/settings");
  // The group's one button, found by role alone: while pending, its name is its pending label.
  const pending = group(page, "Export").getByRole("button");
  await expect(pending).toHaveAccessibleName("Download my data");
  await pending.click();
  await expect(pending).toHaveAttribute("aria-busy", "true");
  await expect(pending).toHaveAccessibleName("Preparing your file");
  release?.();
  const notice = group(page, "Export").getByRole("status");
  await expect(notice).toContainText(
    "downloading your data needs a sign-in from the last ten minutes",
  );
  await expect(notice).toHaveAttribute("data-tone", "error");
  await expect(group(page, "Export").getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Fsettings",
  );
});

test("closing, its failures and withdrawing are answered in place when the browser's calls are refused", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor", { fresh: true });
  if (cookies === null) {
    await expectFailedReads(page);
    return;
  }
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const closeAnswers: ((route: Route) => Promise<void>)[] = [
    async (route) => {
      await held;
      await problem(route, 500, "internal");
    },
    (route) => problem(route, 401, "unauthenticated", "fresh_authentication_required"),
  ];
  await page.route("**/api/v1/me/close", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const answer = closeAnswers.shift();
    if (answer === undefined) throw new Error("a third close was not expected");
    await answer(route);
  });
  await page.route("**/api/v1/me/consents/*/withdraw", (route) =>
    problem(route, 409, "conflict", "consent_already_withdrawn"),
  );
  await page.goto("/settings");

  const close = group(page, "Close account");
  await close.getByRole("button", { name: "Close my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Close your account?" });
  // By position: while pending, the confirm's name is its pending label.
  const confirm = dialog.locator("button").last();
  await expect(confirm).toHaveAccessibleName("Close my account");
  await confirm.click();
  await expect(confirm).toHaveAttribute("aria-busy", "true");
  await expect(confirm).toHaveAccessibleName("Closing your account");
  release?.();
  await expect(dialog.locator('[aria-live="polite"]')).toContainText("problem on our side");
  await expect(dialog).toBeVisible();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(close.getByRole("status")).toContainText("closing your account needs a sign-in");
  await expect(close.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Fsettings",
  );
  await expect(close.getByRole("button", { name: "Close my account" })).toHaveCount(0);

  const consent = group(page, "Consent record");
  await consent.getByRole("button", { name: "Withdraw consent" }).click();
  const withdraw = page.getByRole("dialog", { name: "Withdraw your consent?" });
  await withdraw.getByRole("button", { name: "Withdraw and close my account" }).click();
  await expect(withdraw.locator('[aria-live="polite"]')).toContainText("already withdrawn");
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
});

test("closing with the undo window on a fresh account locks it, the locked view undoes it, and sign out works", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, { label: "settings-close" });
  if (account === null) {
    await expectFailedReads(page);
    // The close is the browser's own call; without a database the server cannot answer it.
    await group(page, "Close account").getByRole("button", { name: "Close my account" }).click();
    const dialog = page.getByRole("dialog", { name: "Close your account?" });
    await dialog.getByRole("button", { name: "Close my account" }).click();
    await expect(dialog.locator('[aria-live="polite"]')).toContainText("problem on our side");
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Sam" });

  // The dialog on the phone's own screen, then on the desktop index, axe in both themes at both widths.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/close-account");
  await page.getByRole("button", { name: "Close my account" }).click();
  for (const theme of themes) {
    await expectNoAxeViolationsHere(page, theme, "the close dialog at 390");
  }
  await expectDialogFits(page, "Close your account?", "the close dialog");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await group(page, "Close account").getByRole("button", { name: "Close my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Close your account?" });
  await expect(dialog).toContainText(
    "Closing your account locks it now and deletes it in 7 days. Until then, you can sign in and undo it.",
  );
  await expect(dialog).toContainText("Undoing does not bring those back.");
  await expect(dialog.getByRole("radio", { name: "In 7 days, with time to undo" })).toBeChecked();
  for (const theme of themes) {
    await expectNoAxeViolationsHere(page, theme, "the close dialog at 1440");
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await dialog.getByRole("button", { name: "Close my account" }).click();
  await page.waitForURL(/\/closing$/);

  await expect(page).toHaveTitle("Your account | Tidefern");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is closing");
  await expect(page.getByText("days left to undo")).toBeVisible();
  await expect(page.getByText("7", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download my data" })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const theme of themes) await expectNoAxeViolations(page, "/closing", theme);
  }
  await expectNoOverflow(page, "/closing while closing");

  // Locked: the shell sends her to the locked view, and the public deletion page points there.
  await page.goto("/today");
  await expect(page).toHaveURL(/\/closing$/);
  await page.goto("/account/delete");
  await expect(page.getByText("Your account is already closing.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See your account" })).toHaveAttribute(
    "href",
    "/closing",
  );

  // An undo the API refuses for its window (canned) turns the view into the deletion and keeps the
  // export; the real undo, after a reload, opens the account again.
  await page.route(
    "**/api/v1/me/close/undo",
    (route) => problem(route, 409, "conflict", "undo_window_closed"),
    { times: 1 },
  );
  await page.goto("/closing");
  await page.getByRole("button", { name: "Undo and keep my account" }).click();
  await expect(page.getByRole("status")).toContainText("It is too late to undo this.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is being deleted");
  await expect(page.getByRole("button", { name: "Download my data" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Undo and keep my account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is open again");
  await expect(page.getByRole("status")).toContainText(
    "The closure is undone, so nothing will be deleted.",
  );
  await expect(page.getByText(/Devices that were signed out stay signed out/)).toBeVisible();
  for (const theme of themes) {
    await expectNoAxeViolationsHere(page, theme, "the undone locked view");
  }
  await page.getByRole("link", { name: "Back to Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(group(page, "Profile").getByRole("textbox", { name: "Name" })).toHaveValue("Sam");

  // Sign out is the last group: a POST, and the session is gone.
  await group(page, "Sign out").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("delete now on another fresh account is confirmed in its own words and offers no undo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const account = await freshAccount(page, { label: "settings-delete" });
  await page.setViewportSize({ width: 390, height: 844 });
  if (account === null) {
    // No database: the screen needs no read of its own, so it offers the close; the server cannot
    // answer it, and the dialog says so.
    await page.goto("/settings/close-account");
    await expect(page.getByText(layoutNotice)).toBeVisible();
    await page.getByRole("button", { name: "Close my account" }).click();
    const dialog = page.getByRole("dialog", { name: "Close your account?" });
    await dialog.getByRole("radio", { name: "Now, with no undo" }).click();
    await dialog.getByRole("button", { name: "Delete my account now" }).click();
    await expect(dialog.locator('[aria-live="polite"]')).toContainText("problem on our side");
    return;
  }
  await onboard(page, { stage: "none", timeZone: "America/New_York" });
  await page.goto("/settings");
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("link", { name: "Close account" })
    .click();
  await expect(page).toHaveURL(/\/settings\/close-account$/);
  await page.getByRole("button", { name: "Close my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Close your account?" });
  await dialog.getByRole("radio", { name: "Now, with no undo" }).click();
  await expect(dialog).toContainText(
    "Deleting your account now locks it and deletes it as soon as the deletion runs. There is no undo.",
  );
  await dialog.getByRole("button", { name: "Delete my account now" }).click();
  await page.waitForURL(/\/closing$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is being deleted");
  await expect(page.getByText("You chose to delete it now, so there is no undo.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download my data" })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const theme of themes) await expectNoAxeViolations(page, "/closing", theme);
  }
  await expectNoOverflow(page, "/closing while deleting");
});

test("withdrawing consent on a fresh account closes it; after the undo the record says it was withdrawn", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const account = await freshAccount(page, { label: "settings-withdraw" });
  if (account === null) {
    await expectFailedReads(page, "/settings/consent");
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "America/Vancouver" });
  await page.goto("/settings/consent");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Consent record");
  await expect(page.getByText("Cycle history", { exact: true })).toBeVisible();
  await expect(page.getByText(/You agreed on .+\. Policy version 2026-10\./)).toBeVisible();
  await expect(
    page.getByText("Tidefern cannot keep your records without this consent", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Withdraw consent" }).click();
  const dialog = page.getByRole("dialog", { name: "Withdraw your consent?" });
  await expect(dialog).toContainText("withdrawing also closes your account");
  for (const theme of themes) {
    await expectNoAxeViolationsHere(page, theme, "the withdraw dialog at 1440");
  }
  await expectDialogFits(page, "Withdraw your consent?", "the withdraw dialog");
  await dialog.getByRole("button", { name: "Withdraw and close my account" }).click();
  await page.waitForURL(/\/closing$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is closing");

  await page.getByRole("button", { name: "Undo and keep my account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is open again");
  await page.goto("/settings/consent");
  await expect(page.getByRole("heading", { level: 2, name: "Withdrawn" })).toBeVisible();
  await expect(
    page.getByText(/You withdrew your consent to cycle history, symptoms and private notes on /),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw consent" })).toHaveCount(0);
});

test("on phones each group opens its own screen with the way back, and every screen passes axe at both widths without overflow", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const cookies = await signInAs(page, "noor");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await expect(page.getByRole("region", { name: "Profile", exact: true })).toHaveCount(0);
  for (const [label, href] of [
    ["Sound", "/settings/sound"],
    ["Devices", "/settings/devices"],
    ["Two-step sign-in", "/settings/two-factor"],
    ["Activity", "/activity"],
  ] as const) {
    await expect(sections.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "href",
      href,
    );
  }
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const screens = [
    ["Profile", "/settings/profile"],
    ["Time zone", "/settings/time-zone"],
    ["Units", "/settings/units"],
    ["Theme", "/settings/theme"],
    ["Notifications", "/settings/notifications"],
    ["Export", "/settings/export"],
    ["Consent record", "/settings/consent"],
    ["Close account", "/settings/close-account"],
  ] as const;
  for (const [label, path] of screens) {
    await page.goto("/settings");
    await sections.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
    if (cookies !== null) {
      await expect(page.getByRole("status").filter({ hasText: failedRead })).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Back to Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  }

  for (const path of ["/settings", ...screens.map(([, screen]) => screen)]) {
    for (const theme of themes) await expectNoAxeViolationsAtFoot(page, path, theme);
    await expectNoOverflow(page, path);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ["/settings", ...screens.map(([, screen]) => screen)]) {
    for (const theme of themes) await expectNoAxeViolations(page, path, theme);
  }
});

test("Pia's imperial units, her empty consent record, and Mira's children's consents without an action", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pia = await signInAs(page, "pia");
  if (pia === null) {
    await expectFailedReads(page, "/settings/consent");
    return;
  }
  await page.goto("/settings/units");
  await expect(page.getByRole("radio", { name: "Imperial" })).toBeChecked();
  await page.goto("/settings/consent");
  await expect(page.getByRole("heading", { level: 2, name: "No consent recorded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw consent" })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const theme of themes) await expectNoAxeViolations(page, "/settings/consent", theme);
  }
  await expectNoOverflow(page, "/settings/consent, empty");

  await signInAs(page, "mira");
  await page.goto("/settings/consent");
  const children = page.getByRole("region", { name: "Given for a child" });
  await expect(children.getByText("Ilo", { exact: true })).toBeVisible();
  await expect(children.getByText("Sol", { exact: true })).toBeVisible();
  await expect(children.getByText(/Given by you on /)).toHaveCount(2);
  await expect(children.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/You agreed on .+\. Policy version /)).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.goto("/settings/notifications");
  await expect(page.getByRole("radio", { name: "Gentle" })).toBeChecked();
  await expect(page.getByRole("figure")).toContainText("[OWNER] The gentle reminder wording");
  for (const theme of themes) {
    await expectNoAxeViolations(page, "/settings/consent", theme);
    await expectNoAxeViolations(page, "/settings/notifications", theme);
  }
});
