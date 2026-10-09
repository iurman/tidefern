import { expect, test, type Locator, type Page } from "@playwright/test";
import { freshAccount, onboard } from "../session";
import {
  addDays,
  api,
  checkState,
  expectLimiterUntouched,
  longDate,
  sheetDate,
  shellNavigation,
} from "./steps";

/**
 * Logging a day across the pages that show it (task J1): from Today's
 * quick log on a phone and from the day page on a desktop, then the same
 * days on the calendar and on Today; an edit through the calendar's sheet,
 * and clearing a day back to nothing. Everything happens on a fresh cycle
 * account made through the mail capture endpoint, so no seeded persona
 * changes. Against a server without a database the helper hands back the
 * canned cookie and the test asserts Today's honest failed read instead.
 * Nothing here is tagged @smoke.
 */

const NOTICE = /could not load your profile just now/;

interface Entry {
  date: string;
  flow: string | null;
  mood: string | null;
  deletedAt: string | null;
}

async function liveEntries(page: Page, from: string, to: string): Promise<Entry[]> {
  const list = await api<{ items: Entry[] }>(page, `/api/v1/cycle/entries?from=${from}&to=${to}`);
  return list.items.filter((entry) => entry.deletedAt === null);
}

/** A day's button in the month grid, today's included. */
function dayButton(page: Page, date: string): Locator {
  const name = longDate(date).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page
    .getByRole("grid")
    .getByRole("button", { name: new RegExp(`^(Today, )?${name}(,|$)`) });
}

/** The calendar on the month that holds `date`. */
async function openMonth(page: Page, date: string) {
  await page.goto(`/calendar?month=${date.slice(0, 7)}`);
  await expect(page.getByRole("grid")).toBeVisible();
}

test("a day logged from Today's quick log and another from its own page show on the calendar and Today, then an edit and a clear", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const account = await freshAccount(page, { label: "flow-logging", name: "Lin" });
  if (account === null) {
    await page.goto("/today");
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Lin" });
  const { today } = await api<{ today: string }>(page, "/api/v1/me");
  const earlier = addDays(today, -2);

  // On a phone the quick log in the tab bar opens the day sheet for today.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  const quickLog = shellNavigation(page).bar.getByRole("button", { name: "Log today" });
  await expect(quickLog).toBeEnabled();
  await quickLog.click();
  const sheet = page.getByRole("dialog", { name: sheetDate(today) });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("switch", { name: "Period" }).click();
  await expect(sheet.getByRole("radio", { name: "Medium" })).toBeChecked();
  await checkState(page, "the quick log's sheet with a period on");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText(`Saved for ${sheetDate(today)}.`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(quickLog).toBeFocused();
  expect(await liveEntries(page, today, today)).toEqual([
    expect.objectContaining({ date: today, flow: "medium" }),
  ]);

  // Today read the day again: the week names it, and the ring has a first guess.
  const week = page.getByRole("region", { name: "This week" });
  await expect(week).toContainText(/Period logged/);

  // On a desktop, an earlier day from its own page: a mood, saved.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/log/${earlier}`);
  await expect(page.getByRole("heading", { level: 1, name: sheetDate(earlier) })).toBeVisible();
  await page.getByRole("radio", { name: "Low" }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Saved for ${sheetDate(earlier)}.`)).toBeVisible();
  await checkState(page, "the day page after a save");

  // The calendar shows both days by what was logged.
  await openMonth(page, today);
  const todayButton = dayButton(page, today);
  await expect(todayButton).toHaveAccessibleName(/medium/i);
  if (earlier.slice(0, 7) !== today.slice(0, 7)) await openMonth(page, earlier);
  await expect(dayButton(page, earlier)).toHaveAccessibleName(`${longDate(earlier)}, low mood`);

  // An edit through the calendar's sheet: the flow goes from medium to heavy.
  await openMonth(page, today);
  await dayButton(page, today).click();
  const daySheet = page.getByRole("dialog", { name: sheetDate(today) });
  await expect(daySheet.getByRole("radio", { name: "Medium" })).toBeChecked();
  await daySheet.getByRole("radio", { name: "Heavy" }).check();
  await daySheet.getByRole("button", { name: "Save" }).click();
  await expect(daySheet.getByText(`Saved for ${sheetDate(today)}.`)).toBeVisible();
  await expect(dayButton(page, today)).toHaveAccessibleName(/heavy/i);
  await page.keyboard.press("Escape");
  await expect(daySheet).toBeHidden();
  await expect(dayButton(page, today)).toBeFocused();
  expect(await liveEntries(page, today, today)).toEqual([
    expect.objectContaining({ flow: "heavy" }),
  ]);

  // Clearing: the period switch off on the day page leaves nothing, so the day is deleted.
  await page.goto(`/log/${today}`);
  await expect(page.getByRole("radio", { name: "Heavy" })).toBeChecked();
  await page.getByRole("switch", { name: "Period" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Saved for ${sheetDate(today)}.`)).toBeVisible();
  expect(await liveEntries(page, today, today)).toEqual([]);
  await openMonth(page, today);
  await expect(dayButton(page, today)).toHaveAccessibleName(`Today, ${longDate(today)}`);

  // Today follows: with no period logged it is back to its empty state.
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Nothing logged yet" })).toBeVisible();
  await expect(page.getByText(/Period logged/)).toHaveCount(0);
  expect(await liveEntries(page, earlier, today)).toEqual([
    expect.objectContaining({ date: earlier, mood: "low" }),
  ]);
  expectLimiterUntouched();
});
