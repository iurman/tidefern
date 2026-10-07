import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const route = "/design/components/patterns";

/** One state of one specimen, in one theme: the frame's `<li>` labelled by the state's name. */
function stage(page: Page, name: string, state = "default", theme: "light" | "dark" = "light") {
  return page
    .getByRole("region", { name, exact: true })
    .locator(`[data-theme="${theme}"] ol > li`)
    .filter({ has: page.locator("p", { hasText: new RegExp(`^${state}$`) }) });
}

for (const theme of ["light", "dark"] as const) {
  test(`the patterns chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, route, theme);
  });

  test(`the patterns chapter has no axe violations in ${theme} mode at phone width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoAxeViolations(page, route, theme);
  });
}

// This test used to show the flow scale appearing only once the switch was
// on. The lead's ruling for the day-logging contract (DESIGN.md 5.1) changed
// that on purpose: the scale is always shown, and the Period switch picks
// Medium on it, visibly, so one press still logs a period day.
test("the day sheet always shows the flow scale and the Period switch picks Medium on it", async ({
  page,
}) => {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const sheet = stage(page, "Day sheet", "empty").getByRole("dialog", { name: "Monday, Oct 5" });
  await expect(sheet).toBeVisible();
  const flow = sheet.getByRole("group", { name: "Flow" });
  await expect(flow).toBeVisible();
  await expect(flow.getByRole("radio", { checked: true })).toHaveCount(0);
  const toggle = sheet.getByRole("switch", { name: "Period" });
  // The form is inert until the page hydrates; retry the first press until it lands.
  await expect(async () => {
    await toggle.focus({ timeout: 1000 });
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(flow.getByRole("radio", { name: "Medium" })).toBeChecked();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(flow.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /private/i })).toHaveCount(0);
});

test("the chips carry the API's labels behind More", async ({ page }) => {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const sheet = stage(page, "Day sheet");
  await expect(sheet.getByRole("button", { name: "Cramps" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(async () => {
    await sheet.getByRole("button", { name: /^More/ }).click({ timeout: 1000 });
    await expect(sheet.getByRole("button", { name: "Trouble sleeping" })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  await expect(sheet.getByRole("button", { name: "Something else" })).toBeVisible();
});

test("a spotting day opens with Spotting chosen and the switch off", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, spotting day");
  await expect(sheet.getByRole("radio", { name: "Spotting" })).toBeChecked();
  await expect(sheet.getByRole("switch", { name: "Period" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("a shared note is read-only and labelled by who can read it, never as private", async ({
  page,
}) => {
  await page.goto(route);
  const note = stage(page, "Day sheet, shared note")
    .getByRole("list", { name: "Notes on this day" })
    .getByRole("listitem");
  await expect(note.getByText("Shared with people who can see your symptoms")).toBeVisible();
  await expect(note.getByText("Steadier today. Sharing this one.")).toBeVisible();
  await expect(note.getByRole("textbox")).toHaveCount(0);
  await expect(note.getByText("Only you can read this.")).toHaveCount(0);
  await expect(note.getByRole("button", { name: "Delete this note" })).toBeVisible();
});

test("sharing asks first and says a shared note cannot be made private again", async ({ page }) => {
  await page.goto(route);
  const confirm = stage(page, "Day sheet, sharing a note").getByRole("group", {
    name: "Share this note?",
  });
  await expect(
    confirm.getByText("A shared note cannot be made private again, only deleted.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Share note" })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Keep it private" })).toBeVisible();
});

test("each failure sits under the part that failed, each with Try again", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, a part failed");
  await expect(sheet.getByRole("button", { name: "Try again" })).toHaveCount(2);
  const top = async (text: string) => (await sheet.getByText(text).boundingBox())?.y ?? Number.NaN;
  const field = (await sheet.getByRole("textbox", { name: "Private note" }).boundingBox())?.y;
  expect(field).toBeDefined();
  expect(
    await top("This day was changed somewhere else. Try again to save your version."),
  ).toBeLessThan(field ?? 0);
  expect(await top("We could not save your note. Try again.")).toBeGreaterThan(field ?? 0);
});

test("a save in flight says Saving and keeps everything else as it was", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, saving");
  await expect(sheet.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true");
  await expect(sheet.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Private note" })).toBeEditable();
});

test("the saved line carries Undo", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, saved");
  await expect(sheet.getByText("Saved for Monday, Oct 5.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("the pregnancy sheet has no Period switch and no flow scale", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, pregnancy");
  await expect(sheet.getByRole("group", { name: "Symptoms" })).toBeVisible();
  await expect(sheet.getByRole("switch", { name: "Period" })).toHaveCount(0);
  await expect(sheet.getByRole("group", { name: "Flow" })).toHaveCount(0);
});

test("the page mode is a page: the date as its heading, the days and Close as links", async ({
  page,
}) => {
  await page.goto(route);
  const day = stage(page, "Day sheet, as a page");
  await expect(day.getByRole("dialog")).toHaveCount(0);
  await expect(day.getByRole("heading", { name: "Sunday, Oct 4" })).toBeVisible();
  await expect(day.getByRole("link", { name: "Previous day" })).toHaveAttribute(
    "href",
    "/log/2026-10-03",
  );
  await expect(day.getByRole("link", { name: "Next day" })).toHaveAttribute(
    "href",
    "/log/2026-10-05",
  );
  for (const close of await day.getByRole("link", { name: "Close" }).all()) {
    await expect(close).toHaveAttribute("href", "/calendar");
  }
});

test("without scripts the day form posts to itself and its controls stay inert", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(route);
  const form = stage(page, "Day sheet").locator("form");
  await expect(form).toHaveAttribute("method", "post");
  await expect(form).toHaveAttribute("inert", "");
  await context.close();
});

test("the components index links every group page", async ({ page }) => {
  await page.goto("/design/components");
  for (const slug of ["actions", "forms", "structure", "calendar", "marks", "patterns"]) {
    const link = page.locator(`a[href="/design/components/${slug}"]`).first();
    await expect(link).toBeVisible();
  }
});

for (const path of ["/design/components/structure", "/design/components/patterns"]) {
  test(`${path} does not widen the page at phone width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test("the patterns chapter does not widen the page at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(route);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
