import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const route = "/design/components/forms";

/** The default-state stage of one specimen in the light theme. */
function defaultStage(page: Page, name: string) {
  return page.getByRole("region", { name }).locator('[data-theme="light"] ol > li').first();
}

for (const theme of ["light", "dark"] as const) {
  test(`the forms chapter has no axe violations in ${theme} mode`, async ({ page }) => {
    await expectNoAxeViolations(page, route, theme);
  });
}

test("the forms chapter has one H1 and is not indexable", async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page).toHaveTitle("Forms | Tidefern");
});

test("the forms chapter renders every specimen in both themes", async ({ page }) => {
  await page.goto(route);
  // Ten specimens from G5, and the checkbox field the lead added before the page routes (G10).
  await expect(page.locator('main [data-theme="light"]')).toHaveCount(11);
  await expect(page.locator('main [data-theme="dark"]')).toHaveCount(11);
});

test("the checkbox field ticks from its label and Space, and its target is 44 px tall", async ({
  page,
}) => {
  await page.goto(route);
  const empty = page
    .getByRole("region", { name: "Checkbox field" })
    .locator('[data-theme="light"] ol > li')
    .nth(7);
  // The specimen is the age attestation since G10's review (it showed half of the 13.10 milestone
  // template), so the name and the description follow it.
  const box = empty.getByRole("checkbox", { name: "I am 18 or older" });
  await expect(box).not.toBeChecked();
  await expect(box).toHaveAccessibleDescription(
    "Tidefern is for adults. No date of birth is stored.",
  );
  // A real pointer at the middle of the label's words: the input covering the field takes it.
  const label = empty.getByText("I am 18 or older");
  await label.scrollIntoViewIfNeeded();
  const words = await label.boundingBox();
  expect(words).not.toBeNull();
  await page.mouse.click(words!.x + words!.width / 2, words!.y + words!.height / 2);
  await expect(box).toBeChecked();
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).not.toBeChecked();
  const target = await box.boundingBox();
  expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
  // The ring sits just inside the full-width field, here and in the frame's forced state, so the
  // stage that clips sideways (or a card) never cuts its sides (G10's review).
  await expect(box).toHaveCSS("outline-offset", "-2px");
  await expect(box).toHaveCSS("outline-style", "solid");
  const forced = page
    .getByRole("region", { name: "Checkbox field" })
    .locator('[data-theme="light"] [data-specimen-state="focus-visible"] > *');
  await expect(forced).toHaveCSS("outline-offset", "-2px");
  const error = page
    .getByRole("region", { name: "Checkbox field" })
    .locator('[data-theme="light"] ol > li')
    .nth(6)
    .getByRole("checkbox");
  await expect(error).toHaveAttribute("aria-invalid", "true");
  await expect(error).toHaveAccessibleDescription(/Confirm you are 18 or older to continue\./);
});

test("the time zone combobox filters, chooses with the keyboard and prints the offset", async ({
  page,
}) => {
  await page.goto(route);
  const stage = defaultStage(page, "Time zone combobox");
  const input = stage.getByRole("combobox", { name: "Where are you?" });
  await expect(stage.getByText("Europe/Berlin is at GMT+02:00 right now.")).toBeVisible();
  await input.click();
  await input.fill("tokyo");
  const option = stage.getByRole("option", { name: /Asia\/Tokyo/ });
  await expect(option).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("Asia/Tokyo");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(stage.getByText("Asia/Tokyo is at GMT+09:00 right now.")).toBeVisible();
});

test("the segmented date input moves on when a part is full and rejects a day that does not exist", async ({
  page,
}) => {
  await page.goto(route);
  const stage = page
    .getByRole("region", { name: "Segmented date input" })
    .locator('[data-theme="light"] ol > li')
    .nth(7);
  const day = stage.getByRole("textbox", { name: "Day" });
  await day.click();
  await page.keyboard.type("31");
  await expect(stage.getByRole("textbox", { name: "Month" })).toBeFocused();
  await page.keyboard.type("02");
  await expect(stage.getByRole("textbox", { name: "Year" })).toBeFocused();
  await page.keyboard.type("2027");
  await expect(
    stage.getByText("That date does not exist. Check the day and the month."),
  ).toBeVisible();
});

test("the measurement input redraws the stored grams when the unit flips", async ({ page }) => {
  await page.goto(route);
  const stage = defaultStage(page, "Measurement input");
  await expect(stage.getByRole("textbox", { name: "Weight", exact: true })).toHaveValue("7");
  await expect(stage.getByRole("textbox", { name: "Weight, ounces" })).toHaveValue("8");
  await stage.getByRole("radio", { name: "Kilograms" }).check();
  await expect(stage.getByRole("textbox", { name: "Weight", exact: true })).toHaveValue("3.402");
  await expect(stage.getByRole("textbox", { name: "Weight, ounces" })).toHaveCount(0);
});

test("the flow scale is one radio group that the arrow keys move", async ({ page }) => {
  await page.goto(route);
  const stage = defaultStage(page, "Flow scale");
  const light = stage.getByRole("radio", { name: "Light" });
  await expect(light).toBeChecked();
  await light.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stage.getByRole("radio", { name: "Medium" })).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(stage.getByRole("radio", { name: "Spotting" })).toBeChecked();
  const box = await light.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("chips press, unpress and reveal the rest in place", async ({ page }) => {
  await page.goto(route);
  const stage = defaultStage(page, "Chip group");
  const cramps = stage.getByRole("button", { name: "Cramps" });
  await expect(cramps).toHaveAttribute("aria-pressed", "true");
  await cramps.click();
  await expect(cramps).toHaveAttribute("aria-pressed", "false");
  await expect(stage.getByRole("button", { name: "Anxiety" })).toHaveCount(0);
  await stage.getByRole("button", { name: /^More/ }).click();
  await expect(stage.getByRole("button", { name: "Anxiety" })).toBeVisible();
  await expect(stage.getByRole("button", { name: "Fewer" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const chips = stage.getByRole("button", { name: "Headache" });
  const box = await chips.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("the mood selector keeps one value selected", async ({ page }) => {
  await page.goto(route);
  const stage = defaultStage(page, "Mood selector");
  await expect(stage.getByRole("radio", { name: "Steady" })).toBeChecked();
  await stage.getByRole("radio", { name: "Bright" }).check();
  await expect(stage.getByRole("radio", { name: "Bright" })).toBeChecked();
  await expect(stage.getByRole("radio", { name: "Steady" })).not.toBeChecked();
});
