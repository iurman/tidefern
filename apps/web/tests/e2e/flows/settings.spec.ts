import { expect, test, type Page } from "@playwright/test";
import { onboard } from "../session";
import {
  api,
  checkState,
  expectLimiterUntouched,
  ownBrowser,
  projectOptions,
  signInThroughForm,
  signUpAndSignIn,
} from "./steps";

/**
 * Settings across reloads, browsers and pages (task J1): the theme and the
 * sound level stay on the device through a reload and into a new browser
 * session that carries the device's storage, and stay off a device that
 * never chose them; units are saved to the profile and follow the account
 * into that new session; the lock-screen preview follows each notification
 * level; and the devices list shows the browser it is opened in, marked as
 * this browser, beside a second one. One fresh account made through the
 * forms, so its sessions carry a real browser's user agent and no seeded
 * persona changes. Against a server without a database the sign-up form
 * says the server had a problem, and the test asserts that and the theme,
 * which needs no server. Nothing here is tagged @smoke.
 */

const serverProblem = "Tidefern had a problem on our side. Wait a moment and try again.";

function group(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

/** The theme as the root element and the device's storage hold it. */
function themeOf(page: Page) {
  return page.evaluate(() => [
    document.documentElement.dataset.theme,
    document.documentElement.dataset.themeSource,
    localStorage.getItem("tidefern-theme-v1"),
  ]);
}

test("theme and sound stay on the device across a reload and a new session, units follow the account, the preview follows the level, and devices shows this browser", async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const page = await ownBrowser(browser, info);
  const opened: Page[] = [page];
  try {
    const account = await signUpAndSignIn(page, "Noa", "settings");
    if (account === null) {
      await expect(page.getByRole("status")).toContainText(serverProblem);
      return;
    }
    await expect(page).toHaveURL(/\/welcome$/);
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Noa" });

    // The theme: dark on this device, kept through a reload.
    await page.goto("/settings");
    await expect(group(page, "Theme").getByRole("radio", { name: "Follow system" })).toBeChecked();
    await group(page, "Theme").getByRole("radio", { name: "Dark" }).click();
    expect(await themeOf(page)).toEqual(["dark", "user", "dark"]);
    await page.reload();
    expect(await themeOf(page)).toEqual(["dark", "user", "dark"]);
    await expect(group(page, "Theme").getByRole("radio", { name: "Dark" })).toBeChecked();

    // The sound level: off on this device, kept through a reload.
    await page.goto("/settings/sound");
    await page.getByRole("radio", { name: "Off" }).check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
    await expect(page.getByRole("radio", { name: "Off" })).toBeChecked();

    // Units are the profile's: saved at once, shown again after a reload.
    await page.goto("/settings");
    const units = group(page, "Units");
    await expect(units.getByRole("radio", { name: "Metric" })).toBeChecked();
    await units.getByRole("radio", { name: "Imperial" }).click();
    await expect(units.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(group(page, "Units").getByRole("radio", { name: "Imperial" })).toBeChecked();
    expect((await api<{ units: string }>(page, "/api/v1/me/profile")).units).toBe("imperial");

    // The lock-screen preview follows each level; email never changes.
    const notifications = group(page, "Notifications");
    for (const [level, text, stored] of [
      ["Gentle", "[OWNER] The gentle reminder wording", "gentle"],
      ["Detailed", "[OWNER] The detailed reminder wording", "detailed"],
      ["Generic", "You have a reminder in Tidefern.", "generic"],
    ] as const) {
      await notifications.getByRole("radio", { name: level }).click();
      await expect(notifications.getByRole("figure")).toContainText(text);
      await expect(notifications.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
      await expect(notifications.getByText("Emails always stay generic.")).toBeVisible();
      expect(
        (await api<{ notificationDetail: string }>(page, "/api/v1/me/profile")).notificationDetail,
      ).toBe(stored);
    }
    await checkState(page, "Settings in the dark theme with imperial units");

    // A new session of the same device: its storage comes along, so the theme, the sound and the
    // account's units are all there without choosing them again.
    const again = await browser.newContext({
      ...projectOptions(info),
      storageState: await page.context().storageState(),
    });
    const later = await again.newPage();
    opened.push(later);
    await later.goto("/settings");
    expect(await themeOf(later)).toEqual(["dark", "user", "dark"]);
    await expect(later.locator("html")).toHaveAttribute("data-sound", "off");
    await expect(group(later, "Units").getByRole("radio", { name: "Imperial" })).toBeChecked();

    // Another device signs in: the choices made on the first stay there, the units follow her.
    const other = await ownBrowser(browser, info);
    opened.push(other);
    await other.goto("/sign-in");
    await signInThroughForm(other, account);
    await expect(other).toHaveURL(/\/today$/);
    await other.goto("/settings");
    expect(await themeOf(other)).toEqual(["light", "system", null]);
    await expect(group(other, "Theme").getByRole("radio", { name: "Follow system" })).toBeChecked();
    await expect(other.locator("html")).not.toHaveAttribute("data-sound", "off");
    await expect(group(other, "Units").getByRole("radio", { name: "Imperial" })).toBeChecked();

    // Devices, opened in the first browser: both sessions, this one marked and first.
    await page.goto("/settings/devices");
    await expect(page.getByRole("heading", { level: 1, name: "Devices" })).toBeVisible();
    await expect(page.getByText("This browser")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Sign out this device" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Sign out the other device" })).toBeVisible();
    const thisBrowser = page
      .locator("div")
      .filter({ has: page.getByText("This browser", { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Sign out this device" }) })
      .last();
    await expect(thisBrowser).toContainText(/Chrome/);
    // This browser's row comes first: its badge before either row's "Last seen" line.
    const rowOrder = await page
      .getByText("This browser", { exact: true })
      .or(page.getByText(/^Last seen /))
      .allInnerTexts();
    expect(rowOrder).toHaveLength(3);
    expect(rowOrder[0]).toBe("This browser");
    await checkState(page, "the devices list with two sessions");
    expectLimiterUntouched();
  } finally {
    for (const opened_page of opened) await opened_page.context().close();
  }
});
