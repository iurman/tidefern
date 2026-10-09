import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./session";

/**
 * A window that runs on past a row (task J3b): in Noor's seeded October the
 * logged period runs Saturday Oct 3 to Monday Oct 5 (today), so it leaves
 * the first week past Sunday and enters the second on Monday, and the
 * expected period runs from Oct 28 past Sunday Nov 1. The week strip of the
 * list view starts on Monday Oct 5, today, on the warmth surface, with the
 * period coming in from before it.
 *
 * Each continuing end must stay inside its grid or strip (a 4 px gutter,
 * like a rounded end) and fade out, so it reads as continuing rather than
 * cut off, and in the strip it must leave today's warmth corners showing.
 * Measured in the page from the pill's own pseudo-element at 1440, 390 and
 * 320, in both themes. The persona is only read. Against a server without
 * a database the calendar shows its failed read, which the calendar spec
 * covers; here the test says so and stops.
 */

const NOOR_OCTOBER = "/calendar?month=2026-10";

interface Edge {
  /** The day's own number, for the failure message. */
  day: string;
  side: "start" | "end";
  /** How far the pill stops short of the holder's edge on that side. */
  inset: number;
  masked: boolean;
  /** Whether the pill's box stays within the grid or strip. */
  inside: boolean;
  today: boolean;
}

/** Every day at a row's first or last place whose window goes on past it, measured in the page. */
function continuingEdges(page: Page, container: string, holder: string): Promise<Edge[]> {
  return page.evaluate(
    ({ container, holder }) => {
      const root = document.querySelector(container);
      if (root === null) return [];
      const bounds = root.getBoundingClientRect();
      const found: Edge[] = [];
      for (const cell of root.querySelectorAll<HTMLElement>(holder)) {
        const names = cell.className;
        if (!/logged|predicted|estimated/.test(names)) continue;
        const parent = cell.parentElement;
        if (parent === null) continue;
        const first = parent.firstElementChild === cell;
        const last = parent.lastElementChild === cell;
        const opensBefore = first && /edgeMiddle|edgeEnd/.test(names);
        const opensAfter = last && /edgeMiddle|edgeStart/.test(names);
        if (!opensBefore && !opensAfter) continue;
        const style = getComputedStyle(cell, "::before");
        const box = cell.getBoundingClientRect();
        const left = parseFloat(style.left);
        const right = parseFloat(style.right);
        const mask = style.maskImage || style.webkitMaskImage;
        const pillLeft = box.left + left;
        const pillRight = box.right - right;
        const inside = pillLeft >= bounds.left - 0.5 && pillRight <= bounds.right + 0.5;
        const day = (cell.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        const today = cell.getAttribute("aria-current") === "date";
        if (opensBefore) {
          found.push({ day, side: "start", inset: left, masked: mask !== "none", inside, today });
        }
        if (opensAfter) {
          found.push({ day, side: "end", inset: right, masked: mask !== "none", inside, today });
        }
      }
      return found;
    },
    { container, holder },
  );
}

function overflowOf(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

function expectContinuing(edges: Edge[], where: string) {
  for (const edge of edges) {
    const label = `${where}: ${edge.day} continues at its ${edge.side}`;
    expect.soft(edge.inset, `${label}, 4 px short of the edge`).toBe(4);
    expect.soft(edge.masked, `${label}, fading out`).toBe(true);
    expect.soft(edge.inside, `${label}, inside the grid`).toBe(true);
  }
}

test("a pill that runs on past a row stops inside the grid and the strip and fades, clear of today's warmth", async ({
  page,
}) => {
  const session = await signInAs(page, "noor");
  if (session === null) {
    await page.goto(NOOR_OCTOBER);
    await expect(page.getByText("We could not load your calendar. Try again.")).toBeVisible();
    return;
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.goto(NOOR_OCTOBER);
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const where = `the month at ${width} in ${theme}`;
      await expect(page.getByRole("grid", { name: "October 2026" })).toBeVisible();
      const month = await continuingEdges(page, "table", "td");
      // Sunday Oct 4 and Sunday Nov 1 run on to the next row; Monday Oct 5 comes in from the last.
      expect(
        month.map((edge) => edge.side),
        `${where}: the seeded October's continuing ends`,
      ).toEqual(["end", "start", "end"]);
      expectContinuing(month, where);
      expect(await overflowOf(page), `${where} scrolls sideways`).toBeLessThanOrEqual(0);

      await page.goto(`${NOOR_OCTOBER}&view=list`);
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const strip = page.getByRole("list", { name: "This week" });
      await expect(strip).toBeVisible();
      const week = await continuingEdges(page, "ol[aria-label='This week']", "li");
      const stripWhere = `the week strip at ${width} in ${theme}`;
      expect(
        week.map((edge) => [edge.side, edge.today]),
        `${stripWhere}: today's period comes in from before the strip`,
      ).toEqual([["start", true]]);
      expectContinuing(week, stripWhere);
      expect(await overflowOf(page), `${stripWhere} scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
});
