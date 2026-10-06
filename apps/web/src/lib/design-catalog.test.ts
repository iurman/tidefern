// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as catalogRoute } from "@/app/(public)/design/catalog.json/route";
import { GET as referenceRoute } from "@/app/(public)/design/reference.md/route";
import { GET as tokensCssRoute } from "@/app/(public)/design/tokens.css/route";
import { GET as tokensJsonRoute } from "@/app/(public)/design/tokens.json/route";
import { specimens as actions } from "@/components/ui/specimens/actions";
import { specimens as calendar } from "@/components/ui/specimens/calendar";
import { specimens as forms } from "@/components/ui/specimens/forms";
import { groups as indexGroups } from "@/components/ui/specimens/index-list";
import { specimens as marks } from "@/components/ui/specimens/marks";
import { specimens as patterns } from "@/components/ui/specimens/patterns";
import { specimens as structure } from "@/components/ui/specimens/structure";
import {
  buildCatalog,
  designChapters,
  renderReference,
  specimenAnchor,
  specimenGroups,
} from "./design-catalog";

const repository = resolve(__dirname, "../../../..");

function allSources(): string[] {
  const catalog = buildCatalog();
  return [
    ...catalog.chapters.map((chapter) => chapter.source),
    ...catalog.groups.map((group) => group.source),
    ...catalog.exports.flatMap((entry) => entry.sources),
    ...catalog.patterns.flatMap((pattern) => pattern.sources),
  ];
}

describe("design catalog", () => {
  it("names only repository paths that exist", () => {
    const missing = [...new Set(allSources())].filter(
      (path) => !existsSync(resolve(repository, path)),
    );
    expect(missing).toEqual([]);
  });

  it("lists every specimen of every group, in the chapter's order, with the group's source", () => {
    const real = [actions, forms, structure, calendar, marks, patterns];
    expect(real.map((group) => group.slug)).toEqual(indexGroups.map((group) => group.slug));
    const shape = (
      groups: ReadonlyArray<{
        slug: string;
        title: string;
        specimens: ReadonlyArray<{ name: string; source: string }>;
      }>,
    ) =>
      groups.map((group) => ({
        slug: group.slug,
        title: group.title,
        specimens: group.specimens.map(({ name, source }) => ({ name, source })),
      }));
    expect(shape(specimenGroups)).toEqual(shape(real));
  });

  it("gives every pattern a page, a fragment, a description and at least one source", () => {
    const { patterns: entries } = buildCatalog();
    expect(entries.length).toBeGreaterThan(100);
    for (const entry of entries) {
      expect(entry.href).toMatch(/^\/design(\/[a-z-]+)*#[A-Za-z][\w-]*$/);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.sources.length).toBeGreaterThan(0);
    }
    const hrefs = entries.map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the chapters in the order architecture 13.8 lists them", () => {
    expect(designChapters.map((chapter) => chapter.href)).toEqual([
      "/design",
      "/design/brand",
      "/design/color",
      "/design/type",
      "/design/components",
      "/design/motion",
      "/design/sound",
      "/design/foundations",
    ]);
  });

  it("derives a specimen's anchor the way the specimen frame writes it", () => {
    expect(specimenAnchor("Button, primary")).toBe("specimen-button-primary");
    expect(specimenAnchor("Measurement chart, partner's view in US units")).toBe(
      "specimen-measurement-chart-partner-s-view-in-us-units",
    );
  });
});

describe("design exports", () => {
  it("serves the catalog as JSON", async () => {
    const response = catalogRoute();
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(buildCatalog())));
  });

  it("serves the reference as Markdown that links every pattern and has no em dash", async () => {
    const response = referenceRoute();
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const text = await response.text();
    expect(text).toBe(renderReference());
    expect(text.startsWith("# Tidefern design system reference\n")).toBe(true);
    for (const pattern of buildCatalog().patterns) {
      expect(text).toContain(`](${pattern.href})`);
    }
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it("serves tokens.json equal to packages/design-tokens/tokens.json", async () => {
    const file = JSON.parse(
      readFileSync(resolve(repository, "packages/design-tokens/tokens.json"), "utf8"),
    ) as unknown;
    expect(await tokensJsonRoute().json()).toEqual(file);
  });

  it("serves tokens.css equal to the generated stylesheet", async () => {
    const file = readFileSync(resolve(repository, "apps/web/src/app/tokens.css"), "utf8");
    const response = await tokensCssRoute();
    expect(response.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await response.text()).toBe(file);
  });
});

describe("cell", () => {
  it("escapes backslashes before pipes so no text can end or split a table cell", async () => {
    const { cell } = await import("./design-catalog");
    expect(cell("a | b")).toBe("a \\| b");
    expect(cell("ends with \\")).toBe("ends with \\\\");
    expect(cell("\\|")).toBe("\\\\\\|");
  });
});
