import type { Page } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";
import { expect, test } from "./fixtures";

/**
 * Interface sound against the production build (architecture 14.2): no
 * audio context before a gesture, a cue after a click, the mute surviving a
 * reload, quiet hours silencing a cue, and the settle cue after a link and
 * never after back. A hook installed before any page script counts every
 * `AudioContext` the page constructs and records each oscillator as it
 * starts, with its wave and its first scheduled pitch, so a test can tell
 * the press drop (triangle near 523 Hz) from the settle cue (sine near
 * 523 Hz) and the hover tick (sine near 1760 Hz). Nothing here is tagged
 * @smoke: the settings route needs a session.
 */

interface Tone {
  type: string;
  hz: number;
}

interface SoundProbe {
  contexts: number;
  tones: Tone[];
}

declare global {
  interface Window {
    __soundProbe: SoundProbe;
  }
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    // Automation grants sticky activation to a fresh page, which a real first
    // visit never has, so the mount-time fast path is held back (as in the
    // home spec) to test the gesture path the way a person meets it.
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: false, isActive: false },
    });
    const probe: SoundProbe = { contexts: 0, tones: [] };
    window.__soundProbe = probe;
    const Native = window.AudioContext;
    if (!Native) return;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts += 1;
      }
    };
    const firstValue = new WeakMap<AudioParam, number>();
    const setValueAtTime = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value: number, time: number) {
      if (!firstValue.has(this)) firstValue.set(this, value);
      return setValueAtTime.call(this, value, time);
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when?: number) {
      probe.tones.push({
        type: this.type,
        hz: firstValue.get(this.frequency) ?? this.frequency.value,
      });
      return start.call(this, when);
    };
  });
}

function probe(page: Page): Promise<SoundProbe> {
  return page.evaluate(() => window.__soundProbe);
}

/** Within the three percent jitter of a pitch. */
function near(hz: number, target: number): boolean {
  return Math.abs(hz - target) / target <= 0.035;
}

const isPress = (tone: Tone) => tone.type === "triangle" && near(tone.hz, 523);
const isSettle = (tone: Tone) => tone.type === "sine" && near(tone.hz, 523.25);

/** Waits until the chapter's client pieces have hydrated and read the context state. */
async function openChapter(page: Page) {
  await page.goto("/design/sound");
  await expect(page.locator("[data-audio-state]")).not.toHaveAttribute(
    "data-audio-state",
    "reading",
  );
}

/** A quiet window that covers the browser's current minute: it starts five minutes from now and ends four minutes from now, across midnight. */
async function storeQuietHoursCoveringNow(page: Page) {
  await page.addInitScript(() => {
    const pad = (value: number) => String(value).padStart(2, "0");
    const at = (offset: number) => {
      const minutes =
        (((new Date().getHours() * 60 + new Date().getMinutes() + offset) % 1440) + 1440) % 1440;
      return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    };
    try {
      if (!localStorage.getItem("tidefern-quiet-hours-v1"))
        localStorage.setItem(
          "tidefern-quiet-hours-v1",
          JSON.stringify({ start: at(5), end: at(4) }),
        );
    } catch {
      // The test fails on the missing sentence instead.
    }
  });
}

test.describe("the sound chapter", () => {
  test.beforeEach(async ({ page }) => {
    await installProbe(page);
  });

  test("creates no audio context before a gesture, then plays a cue after a click", async ({
    page,
  }) => {
    await openChapter(page);
    await expect(page.locator("[data-audio-state]")).toHaveAttribute("data-audio-state", "none");
    const button = page.getByRole("button", { name: "Play press drop" });
    // A mouse hover is not an activation-granting input, so it creates nothing.
    await button.hover();
    await page.mouse.move(10, 10);
    await button.hover();
    expect(await probe(page)).toEqual({ contexts: 0, tones: [] });

    await button.click();
    await expect(page.getByText("That was the press drop cue at the current level.")).toBeVisible();
    await expect(page.locator("[data-audio-state]")).toHaveAttribute("data-audio-state", "running");
    const after = await probe(page);
    expect(after.contexts).toBe(1);
    // The demo owns its cue: one press drop, not the provider's on top of it.
    expect(after.tones.filter(isPress)).toHaveLength(1);
    await expect(page.locator("[data-last-cue]")).toHaveAttribute("data-last-cue", "Press drop");

    await page.getByRole("button", { name: "Play success" }).click();
    await expect(page.getByText("That was the success cue at the current level.")).toBeVisible();
    expect((await probe(page)).contexts).toBe(1);
  });

  test("keeps the mute across a reload, and a muted cue stays silent", async ({ page }) => {
    await openChapter(page);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Turn interface sounds off" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
    await expect(page.getByRole("radio", { name: "Off" })).toBeChecked();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
    await expect(page.getByRole("radio", { name: "Off" })).toBeChecked();
    await page.getByRole("button", { name: "Play press drop" }).click();
    await expect(
      page.getByText("Sound is off. Choose All or Actions only to hear it.").first(),
    ).toBeVisible();
    expect((await probe(page)).tones).toEqual([]);

    // The middle level persists the same way and keeps presses.
    await page.getByRole("radio", { name: "Actions only" }).check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sound", "actions");
    await page.getByRole("button", { name: "Play hover tick" }).click();
    await expect(page.getByText("The hover tick plays at the All level only.")).toBeVisible();
  });

  test("stays silent inside quiet hours and says so", async ({ page }) => {
    await storeQuietHoursCoveringNow(page);
    await openChapter(page);
    await expect(page.getByText(/Silent right now\./)).toBeVisible();
    await page.getByRole("button", { name: "Play press drop" }).click();
    await expect(
      page.getByText("Quiet hours are on right now, so it stayed silent.").first(),
    ).toBeVisible();
    expect((await probe(page)).tones).toEqual([]);
  });

  test("stays silent in a hidden tab and says so, then plays once the tab shows", async ({
    page,
  }) => {
    await openChapter(page);
    // Unlock with a real click first, so only the hidden tab can keep the next cue silent.
    await page.getByRole("button", { name: "Play success" }).click();
    await expect(page.getByText("That was the success cue at the current level.")).toBeVisible();
    const before = (await probe(page)).tones.length;

    // A background tab: the page reports itself hidden, and a cue that lands there (a save that
    // finishes after she switched away) arrives through a click handler with no pointer on it.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page
      .getByRole("button", { name: "Play press drop" })
      .evaluate((button: HTMLElement) => button.click());
    await expect(
      page.getByText("This tab was in the background, so it stayed silent.").first(),
    ).toBeVisible();
    expect((await probe(page)).tones.slice(before)).toEqual([]);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.getByRole("button", { name: "Play press drop" }).click();
    await expect(page.getByText("That was the press drop cue at the current level.")).toBeVisible();
    expect((await probe(page)).tones.slice(before).filter(isPress)).toHaveLength(1);
  });

  test("plays the settle cue after Enter on a link and never after back", async ({ page }) => {
    await openChapter(page);
    // Unlock first, so the press and the settle cue both find the context running.
    await page.getByRole("button", { name: "Play success" }).click();
    await expect(page.getByText("That was the success cue at the current level.")).toBeVisible();
    const before = (await probe(page)).tones.length;

    await page.getByRole("navigation", { name: "Chapters", exact: true }).getByRole("link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/design$/);
    await expect
      .poll(async () => (await probe(page)).tones.slice(before).filter(isSettle).length)
      .toBe(1);
    const afterLink = await probe(page);
    expect(afterLink.tones.slice(before).filter(isPress)).toHaveLength(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/design\/sound$/);
    await page.waitForTimeout(700);
    const afterBack = await probe(page);
    expect(afterBack.tones.slice(afterLink.tones.length).filter(isSettle)).toHaveLength(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no axe violations in ${theme} mode`, async ({ page }) => {
      await expectNoAxeViolations(page, "/design/sound", theme);
    });
  }
});

/*
 * The settings route reads the session in process, so these tests ask for
 * Noor from the per-worker fixture (./fixtures.ts, task J1): against a
 * seeded server that is the worker's one real session for her; without a
 * database the read cannot answer and the layout renders for the canned
 * cookie.
 */
test.describe("the sound settings", () => {
  test.beforeEach(async ({ noor }) => {
    await installProbe(noor);
  });

  test("stores the level and quiet hours on the device and silences the sample", async ({
    noor: page,
  }) => {
    await page.goto("/settings/sound");
    await expect(page.getByRole("heading", { level: 1, name: "Sound" })).toBeVisible();
    await expect(page).toHaveTitle("Sound | Tidefern");

    const quiet = page.getByRole("switch", { name: "Use quiet hours", exact: true });
    await expect(quiet).toBeEnabled();
    await expect(quiet).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Play a sample" }).click();
    await expect(page.getByText("That was the success cue at the current level.")).toBeVisible();
    expect((await probe(page)).tones.length).toBeGreaterThan(0);

    await quiet.click();
    await expect(quiet).toHaveAttribute("aria-checked", "true");
    // A window that covers this minute: from five minutes ahead round to four minutes ahead.
    const [start, end] = await page.evaluate(() => {
      const pad = (value: number) => String(value).padStart(2, "0");
      const at = (offset: number) => {
        const now = new Date();
        const minutes = (now.getHours() * 60 + now.getMinutes() + offset) % 1440;
        return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      };
      return [at(5), at(4)];
    });
    await page.getByLabel("Start").fill(start);
    await page.getByLabel("End").fill(end);
    // The sentence prints the times as the time fields show them, in the browser's locale.
    const [shownStart, shownEnd] = await page.evaluate(
      (times) =>
        times.map((time) =>
          new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
            new Date(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))),
          ),
        ),
      [start, end],
    );
    await expect(
      page.getByText(`Quiet from ${shownStart} to ${shownEnd}.`, { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Quiet hours are on right now.")).toBeVisible();

    const beforeSample = (await probe(page)).tones.length;
    await page.getByRole("button", { name: "Play a sample" }).click();
    await expect(
      page.getByText("Quiet hours are on right now, so it stayed silent."),
    ).toBeVisible();
    expect((await probe(page)).tones).toHaveLength(beforeSample);

    await page.getByRole("radio", { name: "Off" }).check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-sound", "off");
    await expect(page.getByRole("radio", { name: "Off" })).toBeChecked();
    await expect(
      page.getByRole("switch", { name: "Use quiet hours", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Start")).toHaveValue(start);
    await expect(page.getByLabel("End")).toHaveValue(end);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no axe violations in ${theme} mode`, async ({ noor: page }) => {
      await expectNoAxeViolations(page, "/settings/sound", theme);
    });
  }
});
