import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildCatalog, designChapters } from "../../src/lib/design-catalog";
import { signInRedirect } from "./sign-in-redirect";

const repository = resolve(__dirname, "../../../..");
const catalog = buildCatalog();

/** Every page of the reference: the chapters, then the component groups. */
const designPages = [
  ...catalog.chapters.map((chapter) => chapter.href),
  ...catalog.groups.map((group) => group.href),
];

/** React's generated ids (`useId`) sit on headings inside specimens; they are not section anchors. */
const sectionHeadings = 'h2[id]:not([id^="_"])';

async function countIds(page: Page, ids: string[]): Promise<Record<string, number>> {
  return page.evaluate(
    (wanted) =>
      Object.fromEntries(
        wanted.map((id) => [id, document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length]),
      ),
    ids,
  );
}

test("the catalog is served as JSON and equals the catalog module", async ({ request }) => {
  const response = await request.get("/design/catalog.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^application\/json/);
  expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
  expect(await response.json()).toEqual(JSON.parse(JSON.stringify(catalog)));
});

test("the Markdown reference is served as text/markdown and links every pattern", async ({
  request,
}) => {
  const response = await request.get("/design/reference.md");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
  const text = await response.text();
  expect(text).toContain("# Tidefern design system reference");
  for (const heading of ["## Entry points", "## Theme rules", "## Usage", "## Verification"]) {
    expect(text).toContain(heading);
  }
  for (const pattern of catalog.patterns) expect(text).toContain(`](${pattern.href})`);
});

test("the exported tokens match packages/design-tokens/tokens.json and tokens.css", async ({
  request,
}) => {
  const json = await request.get("/design/tokens.json");
  expect(json.status()).toBe(200);
  const file = JSON.parse(
    await readFile(resolve(repository, "packages/design-tokens/tokens.json"), "utf8"),
  ) as unknown;
  expect(await json.json()).toEqual(file);

  const css = await request.get("/design/tokens.css");
  expect(css.status()).toBe(200);
  expect(css.headers()["content-type"]).toBe("text/css; charset=utf-8");
  expect(await css.text()).toBe(
    await readFile(resolve(repository, "apps/web/src/app/tokens.css"), "utf8"),
  );
});

test("the hub links every export and each one answers 200", async ({ page, request }) => {
  await page.goto("/design");
  const links = page.locator("#exports a");
  await expect(links).toHaveCount(catalog.exports.length);
  for (const entry of catalog.exports) {
    await expect(page.locator(`#exports a[href="${entry.href}"]`)).toHaveText(entry.name);
    const response = await request.get(entry.href);
    expect(response.status(), entry.href).toBe(200);
    expect(response.headers()["content-type"], entry.href).toContain(entry.contentType);
  }
});

test("every catalog href resolves to exactly one element, and every section is catalogued", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const byPath = new Map<string, string[]>();
  for (const pattern of catalog.patterns) {
    const [path = "", id = ""] = pattern.href.split("#");
    byPath.set(path, [...(byPath.get(path) ?? []), id]);
  }
  for (const path of designPages) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const ids = byPath.get(path) ?? [];
    const counts = await countIds(page, ids);
    for (const id of ids) expect(counts[id], `${path}#${id}`).toBe(1);

    const headings = await page
      .locator(sectionHeadings)
      .evaluateAll((elements) => elements.map((element) => element.id));
    const missing = headings.filter((id) => !ids.includes(id));
    expect(missing, `${path} sections missing from the catalog`).toEqual([]);
  }
  const unknown = [...byPath.keys()].filter((path) => !designPages.includes(path));
  expect(unknown).toEqual([]);
});

/**
 * Product destinations the specimens link to with synthetic data that no
 * route serves yet, so they may answer 404; every other internal link must
 * answer 200, or 307 to sign-in for a signed-in route. The shell's tabs and
 * a day's log (`/calendar`, `/journey`, `/family`, `/sharing`, `/settings`,
 * `/log/<date>`) were built in tasks H2 to H7 and left this list in task
 * J1, so the check now holds them to 200 or 307. docs/design/COVERAGE.md
 * lists the rest.
 */
const plannedProductRoutes = new Set([
  "/journey/dating",
  "/journey/start",
  "/family/child/milestones",
  "/log",
]);

/**
 * Only the exact unbuilt paths are allowed, so a route that exists today
 * (`/today`, `/calendar`, `/settings/sound`, `/log/<date>`) still fails the
 * check if it disappears.
 */
function isPlannedProductRoute(path: string): boolean {
  return plannedProductRoutes.has(path);
}

test("every internal link on every /design page answers 200 and every fragment resolves once", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const origin = new URL(baseURL ?? "http://127.0.0.1:3000").origin;
  const targets = new Map<string, Set<string>>();
  for (const path of designPages) {
    await page.goto(path);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
    for (const href of hrefs) {
      const url = new URL(href);
      if (url.origin !== origin) continue;
      const fragments = targets.get(url.pathname) ?? new Set<string>();
      if (url.hash) fragments.add(decodeURIComponent(url.hash.slice(1)));
      targets.set(url.pathname, fragments);
    }
  }
  expect(targets.size).toBeGreaterThan(designPages.length);

  const broken: string[] = [];
  for (const [path, fragments] of targets) {
    const response = await request.get(path, { maxRedirects: 0 });
    const status = response.status();
    // A signed-in route seen signed out sends the visitor to sign in; that is the route working.
    const toSignIn = status === 307 && response.headers()["location"] === signInRedirect(path);
    if (status === 404 && isPlannedProductRoute(path) && fragments.size === 0) continue;
    if (status !== 200 && !toSignIn) {
      broken.push(`${path} answered ${status}`);
      continue;
    }
    if (fragments.size === 0) continue;
    await page.goto(path);
    const counts = await countIds(page, [...fragments]);
    for (const fragment of fragments) {
      if (counts[fragment] !== 1) broken.push(`${path}#${fragment} matched ${counts[fragment]}`);
    }
  }
  expect(broken).toEqual([]);
});

test("each chapter's previous and next links follow the 13.8 order", async ({ page }) => {
  const chapters = designChapters;
  for (const [index, chapter] of chapters.entries()) {
    if (index === 0) continue;
    await page.goto(chapter.href);
    const foot = page.getByRole("navigation", { name: "Chapters, previous and next" });
    const previous = chapters[index - 1];
    const next = chapters[index + 1];
    const previousLinks = foot.getByRole("link", { name: /^Previous: / });
    const nextLinks = foot.getByRole("link", { name: /^Next: / });
    await expect(previousLinks).toHaveCount(1);
    await expect(previousLinks).toHaveAttribute("href", previous?.href ?? "");
    await expect(previousLinks).toHaveText(`Previous: ${previous?.title ?? ""}`);
    if (next) {
      await expect(nextLinks).toHaveCount(1);
      await expect(nextLinks).toHaveAttribute("href", next.href);
      await expect(nextLinks).toHaveText(`Next: ${next.title}`);
    } else {
      await expect(nextLinks).toHaveCount(0);
    }
  }
});
