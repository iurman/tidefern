import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { buildCatalog } from "../../../src/lib/design-catalog";
import { expect, test } from "../fixtures";
import { AXE_TAGS } from "../axe";
import { serverHasDatabase, signInAs, type Persona } from "../session";
import {
  DESKTOP,
  PHONE,
  THEMES,
  addDays,
  api,
  expectLimiterUntouched,
  projectOptions,
} from "./steps";

/**
 * The cross-route sweep (task J1): every public route signed out, and every
 * signed-in route for a seeded persona who can see it, each checked the
 * same way:
 *
 * - axe with the `wcag22aa` tag set of ../axe.ts in both themes, at 1440
 *   and at 390, at the top of the page as it loads (below 1024 px the
 *   shell's tab bar is fixed over the foot of the viewport, and whatever
 *   it covers at that scroll position is what a person sees);
 * - no sideways scroll at 320;
 * - a keyboard path: Tab from the top reaches the skip link first and
 *   Enter on it moves focus to main; every focusable element of the frame
 *   (the shell's navigation and policy line, or the public header and
 *   footer) is reached by Tab, every element Tab reaches shows a focus
 *   ring that it did not draw at rest (a visible outline or a box shadow
 *   that changed on focus), and none is left entirely under the tab bar;
 *   for every sheet or dialog the route has, it opens from the keyboard,
 *   Escape closes it and focus returns to the control that opened it. A
 *   dialog behind fresh authentication gets a fresh sign-in first, so its
 *   control shows instead of the sign-in-again notice. At 390 the public
 *   header's menu opens from the keyboard, Tab reaches its links with a
 *   ring, and Escape closes it with focus back on its button.
 *
 * Checks are batched per page: one context per persona and viewport, and
 * every check for a route runs before the next route loads. A failed check
 * is recorded softly with its route, so one run reports every route.
 * The personas only read: nothing here saves, and a dialog is only ever
 * closed with Escape, never confirmed. On a server without a database the persona pages
 * render their failed-read state, which is still swept for axe, reflow and
 * the keyboard. Nothing here is tagged @smoke.
 */

interface Opener {
  /** What it opens, for the failure message. */
  name: string;
  /** The control that opens the sheet or dialog. */
  control: (page: Page) => Locator;
  /** The widths where the control shows. */
  widths: readonly number[];
  /** Whether the control shows only within the fresh-authentication window. */
  fresh?: boolean;
  /** What has to happen on the loaded page before the control shows, such as choosing a tab. */
  prepare?: (page: Page) => Promise<void>;
}

interface Route {
  path: string;
  openers?: Opener[];
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

/** The event editor's form, from the add control of the pregnancy the persona sees. */
const addAppointment: Opener = {
  name: "the appointment form",
  control: (page) => page.getByRole("button", { name: "Add an appointment" }),
  widths: bothWidths,
};

/**
 * Each persona's routes. Noor's day page and every child page are added at
 * run time: the day from the API's `today`, the children from the API's list.
 */
const personaRoutes: Record<Persona, Route[]> = {
  noor: [
    {
      path: "/today",
      openers: [
        {
          name: "the quick-log sheet",
          control: (page) =>
            page
              .locator("nav[aria-label='Main']")
              .last()
              .getByRole("button", { name: "Log today" }),
          widths: [PHONE.width],
        },
      ],
    },
    {
      path: "/calendar",
      openers: [
        {
          name: "the day sheet",
          control: (page) => page.getByRole("grid").getByRole("button", { name: /^Today, / }),
          widths: bothWidths,
        },
      ],
    },
    {
      path: "/sharing",
      openers: [
        {
          name: "the remove confirmation",
          control: (page) => page.getByRole("button", { name: "Remove Theo" }),
          widths: bothWidths,
        },
      ],
    },
    { path: "/activity" },
    { path: "/settings" },
    { path: "/settings/profile" },
    { path: "/settings/time-zone" },
    { path: "/settings/units" },
    { path: "/settings/theme" },
    { path: "/settings/sound" },
    { path: "/settings/notifications" },
    {
      path: "/settings/devices",
      openers: [
        {
          name: "the sign-out confirmation",
          // The first row is this browser's; the confirmation is only closed, so nothing signs out.
          control: (page) => page.getByRole("button", { name: "Sign out this device" }).first(),
          widths: bothWidths,
        },
      ],
    },
    { path: "/settings/two-factor" },
    { path: "/settings/export" },
    {
      path: "/settings/consent",
      openers: [
        {
          name: "the withdraw confirmation",
          control: (page) => page.getByRole("button", { name: "Withdraw consent" }),
          widths: bothWidths,
          fresh: true,
        },
      ],
    },
    {
      path: "/settings/close-account",
      openers: [
        {
          name: "the close confirmation",
          control: (page) => page.getByRole("button", { name: "Close my account" }),
          widths: bothWidths,
          fresh: true,
        },
      ],
    },
    { path: "/journey" },
  ],
  mira: [
    { path: "/today" },
    { path: "/journey", openers: [addAppointment] },
    {
      path: "/family",
      openers: [
        {
          name: "the diaper sheet",
          control: (page) => page.getByRole("button", { name: "Diaper for Ilo" }),
          widths: bothWidths,
        },
      ],
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
      openers: [
        addAppointment,
        {
          name: "the end-of-pregnancy form",
          control: (page) => page.getByRole("button", { name: "My pregnancy ended" }),
          widths: bothWidths,
        },
      ],
    },
    { path: "/family" },
    { path: "/calendar" },
  ],
};

/** The growth sheet on a child page, for a guardian who can add a measurement. */
const addMeasurement: Opener = {
  name: "the measurement sheet",
  control: (page) =>
    page.locator("[data-panel='growth']").getByRole("button", { name: "Add a measurement" }),
  widths: bothWidths,
  // A press before hydration checks the radio only, so choose the tab until its panel shows.
  prepare: async (page) => {
    const panel = page.locator("[data-panel='growth']");
    await expect(async () => {
      await page.getByRole("radio", { name: "Growth", exact: true }).click();
      await expect(panel).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  },
};

/** Personas who are a guardian with write access on every child the API lists for them. */
const writesGrowth: ReadonlySet<Persona> = new Set(["mira"]);

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

/** How an element draws its outline and box shadow, compared before and after focus. */
interface RingStyle {
  outline: string;
  shadow: string;
}

/**
 * Records, before the first Tab, the resting outline and box shadow of
 * every focusable element and of the boxes that may draw a hidden input's
 * ring (the next sibling, the label, the parent), so a focused element only
 * counts as ringed when what it draws changed on focus.
 */
function recordRestingRings(page: Page): Promise<void> {
  return page.evaluate(() => {
    const focusable =
      "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
    const rest = new WeakMap<Element, RingStyle>();
    const record = (element: Element | null) => {
      // An element focused now is not at rest; blurring it would move where Tab starts.
      if (element === null || element === document.activeElement || rest.has(element)) return;
      const style = getComputedStyle(element);
      rest.set(element, {
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`,
        shadow: style.boxShadow,
      });
    };
    for (const element of document.querySelectorAll(focusable)) {
      record(element);
      record(element.nextElementSibling);
      record(element.closest("label"));
      record(element.parentElement);
    }
    (window as unknown as { sweepRest: WeakMap<Element, RingStyle> }).sweepRest = rest;
  });
}

function describeFocus(page: Page): Promise<Focused | null> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element === null || element === document.body) return null;
    const rest = (window as unknown as { sweepRest?: WeakMap<Element, RingStyle> }).sweepRest;
    // A color with zero alpha, in any of the forms getComputedStyle may give it.
    const clear = (color: string) =>
      color === "transparent" ||
      /^rgba\(.*,\s*0(\.0*)?\)$/.test(color) ||
      /\/\s*0(\.0*)?\)$/.test(color);
    // A ring shows (a visible outline or a box shadow) and is not what the box draws at rest.
    const drawsRing = (candidate: Element | null) => {
      if (candidate === null) return false;
      const style = getComputedStyle(candidate);
      const before = rest?.get(candidate);
      const outline = `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`;
      const outlineShows =
        style.outlineStyle !== "none" &&
        parseFloat(style.outlineWidth) > 0 &&
        !clear(style.outlineColor);
      const shadowShows = style.boxShadow !== "none";
      return (
        (outlineShows && outline !== before?.outline) ||
        (shadowShows && style.boxShadow !== before?.shadow)
      );
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
  await recordRestingRings(page);
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
  expect.soft(opened, `${label}: ${opener.name} opens from the keyboard`).toBe(true);
  if (!opened) return;
  await page.keyboard.press("Escape");
  await expect.soft(dialog, `${label}: Escape closes ${opener.name}`).toBeHidden();
  await expect
    .soft(control, `${label}: focus returns to the control that opened ${opener.name}`)
    .toBeFocused();
}

/**
 * The public header's menu on a phone (task J3b): the disclosure button
 * opens from the keyboard and says so with `aria-expanded`, Tab walks into
 * its two links with a visible ring, and Escape closes it with focus back
 * on the button. A page without the public header (the app shell) has no
 * such button and is skipped.
 */
async function headerMenuPath(page: Page, label: string) {
  const button = page.getByRole("banner").getByRole("button", { name: "Menu" });
  if ((await button.count()) === 0) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await recordRestingRings(page);
  // A press before hydration does nothing, so try again until the menu says it is open.
  const opened = await expect(async () => {
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  })
    .toPass({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  expect.soft(opened, `${label}: the header menu opens from the keyboard`).toBe(true);
  if (!opened) return;
  const menu = page.locator(`#${await button.getAttribute("aria-controls")}`);
  await expect.soft(menu, `${label}: the menu the button controls shows`).toBeVisible();
  for (const name of ["Design system", "Sign in"]) {
    await page.keyboard.press("Tab");
    const focus = await describeFocus(page);
    expect
      .soft(focus?.label, `${label}: Tab from the menu button reaches ${name}`)
      .toBe(`a "${name}"`);
    expect.soft(focus?.ring, `${label}: ${name} in the menu shows a focus ring`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect
    .soft(button, `${label}: Escape closes the header menu`)
    .toHaveAttribute("aria-expanded", "false");
  await expect.soft(menu, `${label}: the closed menu hides its links`).toBeHidden();
  await expect.soft(button, `${label}: Escape returns focus to the menu button`).toBeFocused();
}

/**
 * Every check for one route at one width, on the page as it loads. `persona`
 * is who the page is signed in as, for a fresh sign-in before a dialog
 * behind fresh authentication.
 */
async function sweepRoute(
  page: Page,
  route: Route,
  who: string,
  mode: "full" | "frame",
  persona?: Persona,
) {
  const width = page.viewportSize()?.width ?? DESKTOP.width;
  const label = `${who} ${route.path} at ${width}`;
  await page.goto(route.path);
  await page.waitForLoadState("networkidle");
  for (const theme of THEMES) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      window.scrollTo(0, 0);
    }, theme);
    // Only violations are read, so axe skips collecting every passing node. `options` replaces
    // the whole options object, so it comes before `withTags`, which adds the tag set to it.
    const results = await new AxeBuilder({ page })
      .options({ resultTypes: ["violations"] })
      .withTags(AXE_TAGS)
      .analyze();
    expect(results.toolOptions.runOnly, "axe ran the wcag22aa tag set").toEqual({
      type: "tag",
      values: AXE_TAGS,
    });
    expect.soft(results.violations, `${label} in ${theme}`).toEqual([]);
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  // Every element on a phone, where the tab bar can cover one; the frame on a desktop.
  await keyboardPath(page, label, mode === "full" && width === PHONE.width ? "full" : "frame");
  if (width === PHONE.width) await headerMenuPath(page, label);
  for (const opener of route.openers ?? []) {
    if (!opener.widths.includes(width)) continue;
    // Read-only: a fresh sign-in only starts a new session, and the dialog is closed unconfirmed.
    if (opener.fresh === true && persona !== undefined && serverHasDatabase() !== false) {
      await signInAs(page, persona, { fresh: true });
    }
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    await opener.prepare?.(page);
    await escapePath(page, opener, label);
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
async function childRoutes(page: Page, persona: Persona): Promise<Route[]> {
  const response = await page.request.get("/api/v1/children");
  if (!response.ok()) return [];
  const { items } = (await response.json()) as { items: { id: string }[] };
  return items.map((child) => ({
    path: `/family/${child.id}`,
    ...(writesGrowth.has(persona) ? { openers: [addMeasurement] } : {}),
  }));
}

/** The routes that depend on run-time facts: Noor's day page for yesterday, from the API's `today`. */
async function runtimeRoutes(page: Page, persona: Persona): Promise<Route[]> {
  const routes = await childRoutes(page, persona);
  if (persona === "noor") {
    const { today } = await api<{ today: string }>(page, "/api/v1/me");
    routes.unshift({ path: `/log/${addDays(today, -1)}` });
  }
  return routes;
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
      const routes = [...personaRoutes[persona], ...(await runtimeRoutes(page, persona))];
      for (const route of routes) await sweepRoute(page, route, `${persona}:`, "full", persona);
      expectLimiterUntouched();
    });
  }
}
