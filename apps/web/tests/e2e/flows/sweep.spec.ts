import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { buildCatalog } from "../../../src/lib/design-catalog";
import { expect, test } from "../fixtures";
import type { Persona } from "../session";
import { AXE_TAGS, DESKTOP, PHONE, THEMES, expectLimiterUntouched, projectOptions } from "./steps";

/**
 * The cross-route sweep (task J1): every public route signed out, and every
 * signed-in route for a seeded persona who can see it, each checked the
 * same way:
 *
 * - axe with the `wcag22aa` tag set of ../axe.ts in both themes, at 1440
 *   and at 390, at the top of the page as it loads (below 1024 px the
 *   shell's tab bar is sticky over the foot of the viewport, and whatever
 *   it covers at that scroll position is what a person sees);
 * - no sideways scroll at 320;
 * - a keyboard path: Tab from the top reaches the skip link first and
 *   Enter on it moves focus to main; every focusable element of the frame
 *   (the shell's navigation and policy line, or the public header and
 *   footer) is reached by Tab, every element Tab reaches shows a focus
 *   ring, and none is left entirely under the tab bar; where the route
 *   has a sheet or a dialog, it opens from the keyboard, Escape closes it
 *   and focus returns to the control that opened it.
 *
 * Checks are batched per page: one context per persona and viewport, and
 * every check for a route runs before the next route loads. A failed check
 * is recorded softly with its route, so one run reports every route.
 * The personas only read: nothing here saves, and a dialog is only ever
 * closed with Escape. On a server without a database the persona pages
 * render their failed-read state, which is still swept for axe, reflow and
 * the keyboard. Nothing here is tagged @smoke.
 */

interface Opener {
  /** The control that opens the sheet or dialog. */
  control: (page: Page) => Locator;
  /** The widths where the control shows. */
  widths: readonly number[];
}

interface Route {
  path: string;
  opener?: Opener;
}

const catalog = buildCatalog();

const publicRoutes: Route[] = [
  { path: "/" },
  { path: "/privacy" },
  { path: "/health-privacy" },
  { path: "/terms" },
  { path: "/accessibility" },
  { path: "/account/delete" },
  { path: "/sign-in" },
  { path: "/sign-up" },
  { path: "/verify" },
  { path: "/reset" },
  { path: "/reset/sample-token" },
  ...[...catalog.chapters, ...catalog.groups].map((page) => ({ path: page.href })),
  { path: "/this-page-does-not-exist" },
];

const bothWidths = [DESKTOP.width, PHONE.width] as const;

/** Each persona's routes; the child pages are added from the API at run time. */
const personaRoutes: Record<Persona, Route[]> = {
  noor: [
    {
      path: "/today",
      opener: {
        control: (page) =>
          page.locator("nav[aria-label='Main']").last().getByRole("button", { name: "Log today" }),
        widths: [PHONE.width],
      },
    },
    {
      path: "/calendar",
      opener: {
        control: (page) => page.getByRole("grid").getByRole("button", { name: /^Today, / }),
        widths: bothWidths,
      },
    },
    { path: "/log/2026-10-04" },
    {
      path: "/sharing",
      opener: {
        control: (page) => page.getByRole("button", { name: "Remove Theo" }),
        widths: bothWidths,
      },
    },
    { path: "/activity" },
    { path: "/settings" },
    { path: "/settings/profile" },
    { path: "/settings/time-zone" },
    { path: "/settings/units" },
    { path: "/settings/theme" },
    { path: "/settings/sound" },
    { path: "/settings/notifications" },
    { path: "/settings/devices" },
    { path: "/settings/two-factor" },
    { path: "/settings/export" },
    { path: "/settings/consent" },
    { path: "/settings/close-account" },
    { path: "/journey" },
  ],
  mira: [
    { path: "/today" },
    { path: "/journey" },
    {
      path: "/family",
      opener: {
        control: (page) => page.getByRole("button", { name: "Diaper for Ilo" }),
        widths: bothWidths,
      },
    },
    { path: "/calendar" },
    { path: "/sharing" },
  ],
  pia: [{ path: "/today" }, { path: "/family" }, { path: "/calendar" }, { path: "/sharing" }],
  theo: [{ path: "/today" }, { path: "/calendar" }, { path: "/sharing" }, { path: "/journey" }],
  lena: [
    { path: "/today" },
    {
      path: "/journey",
      opener: {
        control: (page) => page.getByRole("button", { name: "Add an appointment" }),
        widths: bothWidths,
      },
    },
    { path: "/family" },
    { path: "/calendar" },
  ],
};

/** What the page says about the element that has focus, measured in the page. */
interface Focused {
  key: string | null;
  label: string;
  skip: boolean;
  main: boolean;
  inMain: boolean;
  ring: boolean;
  /** Entirely under the tab bar (WCAG 2.4.11), when one shows. */
  hidden: boolean;
}

/**
 * Marks every focusable element of the frame with a key and returns the
 * keys: the shell's visible navigation and its policy line, or the public
 * header and footer.
 */
function markFrame(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const frames = document.querySelectorAll(
      "nav[aria-label='Main'], footer, [role='contentinfo'], header, [role='banner']",
    );
    const focusable =
      "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
    const keys: string[] = [];
    let next = 0;
    for (const frame of frames) {
      // Specimens of the shell inside a design page are content, not the frame.
      if (frame.closest("main") !== null) continue;
      for (const element of frame.querySelectorAll<HTMLElement>(focusable)) {
        const style = getComputedStyle(element);
        if (element.getClientRects().length === 0 || style.visibility === "hidden") continue;
        if (element.closest("[inert], [aria-hidden='true']")) continue;
        if (!element.dataset.sweepKey) {
          element.dataset.sweepKey = `frame-${next}`;
          next += 1;
        }
        keys.push(element.dataset.sweepKey);
      }
    }
    return [...new Set(keys)];
  });
}

function describeFocus(page: Page): Promise<Focused | null> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element === null || element === document.body) return null;
    const drawsRing = (candidate: Element | null) => {
      if (candidate === null) return false;
      const style = getComputedStyle(candidate);
      const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      return outline || style.boxShadow !== "none";
    };
    // A visually hidden input draws its ring on the box beside it or on its label.
    const box = element.getBoundingClientRect();
    const tiny = box.width <= 1 || box.height <= 1;
    const ring =
      drawsRing(element) ||
      (tiny &&
        (drawsRing(element.nextElementSibling) ||
          drawsRing(element.closest("label")) ||
          drawsRing(element.parentElement)));
    const bars = [...document.querySelectorAll("nav[aria-label='Main']")].filter(
      (nav) =>
        nav.closest("main") === null &&
        nav.getClientRects().length > 0 &&
        getComputedStyle(nav).position !== "static",
    );
    const bar = bars.find((nav) => nav.getBoundingClientRect().top > window.innerHeight / 2);
    let hidden = false;
    if (bar !== undefined && !bar.contains(element) && !tiny) {
      const cover = bar.getBoundingClientRect();
      hidden = box.top >= cover.top && box.bottom <= cover.bottom;
    }
    const label = (element.getAttribute("aria-label") ?? element.textContent ?? element.tagName)
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 48);
    return {
      key: element.dataset.sweepKey ?? null,
      label: `${element.tagName.toLowerCase()} "${label}"`,
      skip: element.classList.contains("skip-link"),
      main: element.id === "main",
      inMain: element.closest("main") !== null,
      ring,
      hidden,
    };
  });
}

/**
 * The keyboard path for the route on screen; failures are soft and name the
 * route. `full` walks every focusable element of the page forward with Tab
 * and checks each one; `frame` walks only the frame, Shift+Tab back from
 * main through what comes before it and from the end of the page back to
 * main, which reaches the same frame elements in a fraction of the presses
 * on a long page.
 */
async function keyboardPath(page: Page, label: string, mode: "full" | "frame") {
  const frame = await markFrame(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press("Tab");
  const first = await describeFocus(page);
  expect.soft(first?.skip, `${label}: Tab from the top reaches the skip link first`).toBe(true);
  await page.keyboard.press("Enter");
  expect
    .soft((await describeFocus(page))?.main, `${label}: the skip link moves focus to main`)
    .toBe(true);

  const reached = new Set<string>();
  const noRing: string[] = [];
  const hidden: string[] = [];
  const note = (focus: Focused) => {
    if (focus.key !== null) reached.add(focus.key);
    if (!focus.ring) noRing.push(focus.label);
    if (focus.hidden) hidden.push(focus.label);
  };
  const limit =
    (await page.locator("a[href], button, input, select, textarea, summary").count()) + 20;

  if (mode === "full") {
    // From main to the end of the page, around past the skip link (the browser's own stop at the
    // end reads as no focus), and through what comes before main, until focus is back inside it.
    let wrapped = false;
    for (let step = 0; step < limit; step += 1) {
      await page.keyboard.press("Tab");
      const focus = await describeFocus(page);
      if (focus === null || focus.skip) {
        wrapped = true;
        continue;
      }
      if (wrapped && focus.inMain) break;
      note(focus);
    }
  } else {
    // Back from main through what comes before it, to the skip link.
    for (let step = 0; step < limit; step += 1) {
      await page.keyboard.press("Shift+Tab");
      const focus = await describeFocus(page);
      if (focus === null || focus.skip) break;
      note(focus);
    }
    // From the skip link back around to the end of the page, and back through it to main.
    await page.evaluate(() => document.querySelector<HTMLElement>(".skip-link")?.focus());
    let wrapped = false;
    for (let step = 0; step < limit; step += 1) {
      await page.keyboard.press("Shift+Tab");
      const focus = await describeFocus(page);
      if (focus === null || focus.skip) {
        if (wrapped) break;
        wrapped = true;
        continue;
      }
      wrapped = true;
      if (focus.inMain) break;
      note(focus);
    }
  }
  const missed = frame.filter((key) => !reached.has(key));
  expect.soft(missed, `${label}: frame elements Tab never reached`).toEqual([]);
  expect.soft(noRing, `${label}: focused without a visible ring`).toEqual([]);
  expect.soft(hidden, `${label}: focused but entirely under the tab bar`).toEqual([]);
}

/** Opens the route's sheet or dialog from the keyboard, closes it with Escape, and checks focus came back. */
async function escapePath(page: Page, opener: Opener, label: string) {
  const control = opener.control(page);
  const dialog = page.getByRole("dialog");
  // A press before hydration does nothing, so try again until the dialog shows.
  const opened = await expect(async () => {
    await control.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  })
    .toPass({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  expect.soft(opened, `${label}: the sheet or dialog opens from the keyboard`).toBe(true);
  if (!opened) return;
  await page.keyboard.press("Escape");
  await expect.soft(dialog, `${label}: Escape closes it`).toBeHidden();
  await expect.soft(control, `${label}: focus returns to the control that opened it`).toBeFocused();
}

/** Every check for one route at one width, on the page as it loads. */
async function sweepRoute(page: Page, route: Route, who: string, mode: "full" | "frame") {
  const width = page.viewportSize()?.width ?? DESKTOP.width;
  const label = `${who} ${route.path} at ${width}`;
  await page.goto(route.path);
  await page.waitForLoadState("networkidle");
  for (const theme of THEMES) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      window.scrollTo(0, 0);
    }, theme);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect.soft(results.violations, `${label} in ${theme}`).toEqual([]);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  // Every element on a phone, where the tab bar can cover one; the frame on a desktop.
  await keyboardPath(page, label, mode === "full" && width === PHONE.width ? "full" : "frame");
  if (route.opener?.widths.includes(width)) {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    await escapePath(page, route.opener, label);
  }
  if (width === PHONE.width) {
    await page.setViewportSize({ width: 320, height: PHONE.height });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect.soft(overflow, `${who} ${route.path} scrolls sideways at 320`).toBeLessThanOrEqual(0);
    await page.setViewportSize(PHONE);
  }
}

/** A seeded persona's child pages, from the children the API lists for them. */
async function childRoutes(page: Page): Promise<Route[]> {
  const response = await page.request.get("/api/v1/children");
  if (!response.ok()) return [];
  const { items } = (await response.json()) as { items: { id: string }[] };
  return items.map((child) => ({ path: `/family/${child.id}` }));
}

for (const size of [DESKTOP, PHONE]) {
  test(`every public route at ${size.width}: axe in both themes, reflow and the keyboard path`, async ({
    browser,
  }, info) => {
    test.setTimeout(600_000);
    const context = await browser.newContext(projectOptions(info, { viewport: size }));
    const page = await context.newPage();
    try {
      for (const route of publicRoutes) await sweepRoute(page, route, "signed out:", "frame");
    } finally {
      await context.close();
    }
  });
}

for (const persona of ["noor", "mira", "pia", "theo", "lena"] as const) {
  for (const size of [DESKTOP, PHONE]) {
    test(`${persona}'s routes at ${size.width}: axe in both themes, reflow and the keyboard path`, async ({
      asPersona,
    }) => {
      test.setTimeout(600_000);
      const page = await asPersona(persona, { viewport: size });
      const routes = [...personaRoutes[persona], ...(await childRoutes(page))];
      for (const route of routes) await sweepRoute(page, route, `${persona}:`, "full");
      expectLimiterUntouched();
    });
  }
}
