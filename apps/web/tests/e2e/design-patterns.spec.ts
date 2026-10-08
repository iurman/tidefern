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
  const note = sheet.getByRole("list", { name: "Notes on this day" }).getByRole("listitem");
  await expect(
    note.getByText("Shared with people who can see your pregnancy overview"),
  ).toBeVisible();
  await expect(note.getByText("Added by someone you share with.")).toBeVisible();
});

test("an undo in flight says Undoing beside the saved line", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, undo in flight");
  await expect(sheet.getByText("Saved for Monday, Oct 5.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Undoing" })).toHaveAttribute("aria-busy", "true");
});

test("an undo that failed says so beside Save, with no Undo left", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, undo failed");
  await expect(
    sheet.getByText("We could not undo every change. Check this day and change it back."),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("an edited note cannot be shared until it is saved, and says why", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, note edited");
  await expect(sheet.getByRole("button", { name: "Share this note with..." })).toBeDisabled();
  await expect(sheet.getByText("Save the note first, then share it.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("an ended session is said once and offers no Try again", async ({ page }) => {
  await page.goto(route);
  const signedOut = "Your session has ended. Sign in again, then come back to this day.";
  for (const name of ["Day sheet, session ended", "Day sheet, session ended on load"]) {
    const sheet = stage(page, name);
    await expect(sheet.getByText(signedOut)).toHaveCount(1);
    await expect(sheet.getByRole("button", { name: "Try again" })).toHaveCount(0);
  }
  await expect(
    stage(page, "Day sheet, session ended").getByRole("textbox", { name: "Private note" }),
  ).toBeVisible();
});

test("deleting a shared note asks first, then says Deleting or what failed", async ({ page }) => {
  await page.goto(route);
  const confirm = stage(page, "Day sheet, deleting a note").getByRole("group", {
    name: "Delete this note?",
  });
  await expect(
    confirm.getByText(
      "It is removed for you and for everyone who can read it, and it cannot be brought back.",
    ),
  ).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Delete note" })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Keep it" })).toBeVisible();
  const pending = stage(page, "Day sheet, delete in flight").getByRole("group", {
    name: "Delete this note?",
  });
  await expect(pending.getByRole("button", { name: "Deleting" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(pending.getByRole("button", { name: "Keep it" })).toBeDisabled();
  const failed = stage(page, "Day sheet, delete failed").getByRole("listitem");
  await expect(failed.getByRole("group", { name: "Delete this note?" })).toBeVisible();
  await expect(failed.getByText("We could not delete this note. Try again.")).toBeVisible();
});

test("a share in flight says Sharing, and a failed one says what to do in the step", async ({
  page,
}) => {
  await page.goto(route);
  const pending = stage(page, "Day sheet, share in flight").getByRole("group", {
    name: "Share this note?",
  });
  await expect(pending.getByRole("button", { name: "Sharing" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(pending.getByRole("button", { name: "Keep it private" })).toBeDisabled();
  const failed = stage(page, "Day sheet, share failed").getByRole("group", {
    name: "Share this note?",
  });
  await expect(failed.getByText("We could not share this note. Try again.")).toBeVisible();
  await expect(failed.getByRole("button", { name: "Share note" })).toBeEnabled();
});

test("a note changed elsewhere shows its current text with the step closed", async ({ page }) => {
  await page.goto(route);
  const sheet = stage(page, "Day sheet, note changed elsewhere");
  await expect(sheet.getByRole("textbox", { name: "Private note" })).toHaveValue(
    "Slept badly; better after lunch.",
  );
  await expect(sheet.getByRole("group", { name: "Share this note?" })).toHaveCount(0);
  const line = sheet.getByText("This note changed somewhere else. Check it, then share it again.");
  await expect(line).toBeVisible();
  const share = sheet.getByRole("button", { name: "Share this note with..." });
  const below = async () =>
    ((await line.boundingBox())?.y ?? 0) > ((await share.boundingBox())?.y ?? 0);
  expect(await below()).toBe(true);
});

/**
 * How each radio scale in an element is laid out: its rows of options, the
 * widths of its options, its track's radius and inner width, and whether any
 * label is cut or leaves the track.
 */
function scales(element: Element) {
  return [...element.querySelectorAll("fieldset")]
    .filter((group) => group.querySelector('input[type="radio"]'))
    .map((group) => {
      const radio = group.querySelector('input[type="radio"]') as HTMLElement;
      const track = radio.parentElement?.parentElement as HTMLElement;
      const box = track.getBoundingClientRect();
      const labels = [...track.querySelectorAll("label")].map((label) => {
        const rect = label.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          cut: label.scrollWidth > label.clientWidth + 0.5,
        };
      });
      const widths = labels.map((label) => label.width);
      // Inside the form that holds it: one control that cannot shrink must not widen every row.
      const form = group.closest("form")?.getBoundingClientRect();
      return {
        inForm:
          form === undefined || (box.left >= form.left - 0.5 && box.right <= form.right + 0.5),
        name: group.querySelector("legend")?.textContent ?? "",
        options: labels.length,
        rows: new Set(labels.map((label) => label.top)).size,
        narrowest: Math.min(...widths),
        widest: Math.max(...widths),
        lowest: Math.min(...labels.map((label) => label.height)),
        inner: track.clientWidth,
        radius: getComputedStyle(track).borderTopLeftRadius,
        cut: labels.some((label) => label.cut),
        inside: labels.every(
          (label) => label.left >= box.left - 0.5 && label.right <= box.right + 0.5,
        ),
      };
    });
}

// G9 laid the flow scale out at narrow widths from day-sheet.module.css by
// reaching into SegmentedControl's markup: a tight row, then chips that
// wrapped three and two at a 320 px phone's sheet. G9b replaced that on
// purpose with SegmentedControl's own columns layout, which the flow scale
// and the mood selector both use: the round pill where it fits, equal columns
// with the control radius on a phone, and one value per row where a column
// would cut a label. A cell set to a phone's width holds the inline sheet at
// exactly that phone's width, so its scales are as wide as on the phone.
test("the scales keep the pill where it fits, equal columns on a phone and one value per row at 320 px", async ({
  page,
}) => {
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  const cell = stage(page, "Day sheet");
  const at = async (width: string) => {
    await cell.evaluate((element, size) => {
      (element as HTMLElement).style.width = size;
    }, width);
    const found = await cell.evaluate(scales);
    const flow = found.find((group) => group.name === "Flow");
    const mood = found.find((group) => group.name === "Mood");
    expect(flow, width).toBeDefined();
    expect(mood, width).toBeDefined();
    for (const group of [flow!, mood!]) {
      expect(group.cut, `${group.name} at ${width}`).toBe(false);
      expect(group.inside, `${group.name} at ${width}`).toBe(true);
      expect(group.inForm, `${group.name} at ${width}`).toBe(true);
      expect(group.lowest, `${group.name} at ${width}`).toBeGreaterThanOrEqual(44);
    }
    return { flow: flow!, mood: mood! };
  };

  // Desktop: the cell is the specimen's own width, wide enough for the round pill.
  const wide = await at("");
  for (const group of [wide.flow, wide.mood]) {
    expect(group.rows).toBe(1);
    expect(group.radius).toBe("999px");
    expect(group.widest - group.narrowest).toBeGreaterThan(8);
  }

  // A 390 px and a 360 px phone: five equal columns, then three.
  for (const width of ["390px", "360px"]) {
    const phone = await at(width);
    for (const group of [phone.flow, phone.mood]) {
      expect(group.rows, `${group.name} at ${width}`).toBe(1);
      expect(group.radius, `${group.name} at ${width}`).toBe("10px");
      expect(group.widest - group.narrowest, `${group.name} at ${width}`).toBeLessThan(1);
    }
  }

  // A 320 px phone: five columns would cut Spotting, so the flow values stack, one per row,
  // each the track's full width; the three moods still fit as columns.
  const narrow = await at("320px");
  expect(narrow.flow.rows).toBe(5);
  expect(narrow.flow.narrowest).toBeGreaterThanOrEqual(narrow.flow.inner - 1);
  expect(narrow.flow.radius).toBe("10px");
  expect(narrow.mood.rows).toBe(1);
  expect(narrow.mood.widest - narrow.mood.narrowest).toBeLessThan(1);
});

// The lead saw the pill fold into two rows at phone width. At every viewport
// the chapter is checked at, every radio scale in every specimen is one row
// or one option per row, never anything between, and never a cut label.
for (const width of [1440, 390, 320]) {
  test(`no scale folds into uneven rows or cuts a label at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const found = await page.locator("main").evaluate(scales);
    expect(found.length).toBeGreaterThan(20);
    for (const group of found) {
      expect([1, group.options], `${group.name} rows at ${width}`).toContain(group.rows);
      if (group.rows > 1) expect(group.radius, `${group.name} at ${width}`).toBe("10px");
      expect(group.cut, `${group.name} at ${width}`).toBe(false);
      expect(group.inside, `${group.name} at ${width}`).toBe(true);
      expect(group.inForm, `${group.name} at ${width}`).toBe(true);
    }
  });
}

/**
 * Where the focused radio in a group draws its ring: how far past its own box
 * the ring reaches (zero or less is inside), which other labels' text it
 * crosses, and how wide a band of the track's color runs between the ring and
 * a chosen value's fill.
 */
function focusRing(fieldset: Element) {
  const radio = document.activeElement;
  if (!(radio instanceof HTMLInputElement) || !fieldset.contains(radio)) return null;
  const ring = getComputedStyle(radio);
  const offset = parseFloat(ring.outlineOffset);
  const reach = offset + parseFloat(ring.outlineWidth);
  const box = radio.getBoundingClientRect();
  const label = radio.nextElementSibling as HTMLElement;
  const track = radio.parentElement?.parentElement as HTMLElement;
  const crossed = [...fieldset.querySelectorAll('input[type="radio"]')]
    .filter((other) => other !== radio)
    .map((other) => other.nextElementSibling as HTMLElement)
    .filter((other) => {
      const range = document.createRange();
      range.selectNodeContents(other);
      const text = range.getBoundingClientRect();
      return (
        text.left < box.right + reach &&
        text.right > box.left - reach &&
        text.top < box.bottom + reach &&
        text.bottom > box.top - reach
      );
    })
    .map((other) => other.textContent);
  // An inset shadow in the track's color, measured from the ring's inner edge.
  const [, color, spread] =
    /^(rgba?\([^)]*\)) 0px 0px 0px ([\d.]+)px inset$/.exec(getComputedStyle(label).boxShadow) ?? [];
  const band =
    spread !== undefined && color === getComputedStyle(track).backgroundColor
      ? parseFloat(getComputedStyle(label).borderLeftWidth) + parseFloat(spread) + offset
      : 0;
  return {
    name: label.textContent,
    checked: radio.checked,
    visible: radio.matches(":focus-visible"),
    reach,
    crossed,
    band,
  };
}

// G9b's review: the columns touch, so the global ring (2 px at a 4 px offset)
// around a focused value crossed the next label ("Spotting" beside Light at a
// 360 px phone) and, in a stacked list, reached past the form. A focused value
// in the columns layout draws its ring inside its own box, and on a chosen
// value a band of the track's color keeps the ring apart from the fill, whose
// tone is too close to the focus color to show it.
for (const width of ["390px", "360px", "320px"]) {
  test(`a focused value keeps its ring inside its own column, clear of the next label, at a ${width} phone`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    for (const state of ["default", "empty"]) {
      await stage(page, "Day sheet", state).evaluate((element, size) => {
        (element as HTMLElement).style.width = size;
      }, width);
    }

    // A chosen value as the arrow keys leave it: Light beside Spotting, Low beside Steady.
    for (const [name, from, to] of [
      ["Flow", "Medium", "Light"],
      ["Mood", "Steady", "Low"],
    ] as const) {
      const group = stage(page, "Day sheet").getByRole("group", { name, exact: true });
      // The form is inert until the page hydrates; retry the first press until it lands.
      await expect(async () => {
        await group.getByRole("radio", { name: from }).focus({ timeout: 1000 });
        await page.keyboard.press("ArrowLeft");
        await expect(group.getByRole("radio", { name: to })).toBeFocused({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      const chosen = await group.evaluate(focusRing);
      expect(chosen, `${name} at ${width}`).toMatchObject({
        name: to,
        checked: true,
        visible: true,
      });
      expect(chosen!.reach, `${name} at ${width}`).toBeLessThanOrEqual(0);
      expect(chosen!.crossed, `${name} at ${width}`).toEqual([]);
      expect(chosen!.band, `${name} at ${width}`).toBeGreaterThanOrEqual(1);
    }

    // Nothing chosen: Tab from the Period switch enters the flow scale on None, unchecked.
    const empty = stage(page, "Day sheet", "empty");
    await empty.getByRole("switch", { name: "Period" }).focus();
    await page.keyboard.press("Tab");
    const flow = empty.getByRole("group", { name: "Flow", exact: true });
    await expect(flow.getByRole("radio", { name: "None" })).toBeFocused();
    const unchosen = await flow.evaluate(focusRing);
    expect(unchosen, width).toMatchObject({ name: "None", checked: false, visible: true });
    expect(unchosen!.reach, width).toBeLessThanOrEqual(0);
    expect(unchosen!.crossed, width).toEqual([]);
  });
}

test("the Period row puts the switch under a short help line on a phone, beside it on desktop", async ({
  page,
}) => {
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  const cell = stage(page, "Day sheet");
  const help = cell.getByText("Logs a period day at Medium. Change the flow below.");
  const toggle = cell.getByRole("switch", { name: "Period" });
  await expect(toggle).toHaveAccessibleDescription(
    "Logs a period day at Medium. Change the flow below.",
  );
  const boxes = async () => {
    const text = await help.boundingBox();
    const control = await toggle.boundingBox();
    expect(text).not.toBeNull();
    expect(control).not.toBeNull();
    return { text: text!, control: control! };
  };
  const desktop = await boxes();
  expect(desktop.control.x).toBeGreaterThan(desktop.text.x + desktop.text.width);
  expect(desktop.control.y).toBeLessThan(desktop.text.y + desktop.text.height);
  for (const width of ["360px", "320px"]) {
    await cell.evaluate((element, size) => {
      (element as HTMLElement).style.width = size;
    }, width);
    const phone = await boxes();
    expect(phone.control.y, width).toBeGreaterThanOrEqual(phone.text.y + phone.text.height);
    // Aligned to the start, under the line it belongs to.
    expect(Math.abs(phone.control.x - phone.text.x), width).toBeLessThanOrEqual(0.5);
    // Two short lines at most, never the seven lines it ran to beside the switch.
    expect(phone.text.height, width).toBeLessThan(50);
  }
});

test("a chosen mood clears with Clear, and focus moves to the first mood", async ({ page }) => {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const mood = stage(page, "Day sheet").getByRole("group", { name: "Mood" });
  await expect(mood.getByRole("radio", { name: "Steady" })).toBeChecked();
  const clear = mood.getByRole("button", { name: "Clear mood" });
  await expect(clear).toHaveText("Clear");
  // The form is inert until the page hydrates; retry the first press until it lands.
  await expect(async () => {
    await clear.click({ timeout: 1000 });
    await expect(mood.getByRole("radio", { checked: true })).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(mood.getByRole("radio", { name: "Low" })).toBeFocused();
  await expect(clear).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(mood.getByRole("radio", { name: "Low" })).toBeChecked();
  await expect(mood.getByRole("radio", { name: "Low" })).toBeFocused();
  await expect(mood.getByRole("button", { name: "Clear mood" })).toBeVisible();
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
