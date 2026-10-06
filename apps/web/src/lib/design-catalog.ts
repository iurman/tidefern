/**
 * The machine-readable catalog of the `/design` reference (architecture
 * 13.8): every component specimen and every chapter section, each with a
 * stable anchor, the repository paths it is built from and one sentence.
 * `/design/catalog.json` serves it and `/design/reference.md` renders it.
 *
 * Two of the six specimen groups are client modules, so a route handler sees
 * them as client references and cannot read their names. The specimen list
 * here is therefore written out once, and `design-catalog.test.ts` compares
 * it with all six groups (name, source and order) so it cannot drift; the
 * browser suite checks that every section heading on a chapter page is listed
 * and that every `href` resolves to exactly one element.
 */

export const catalogVersion = 1;

export type ChapterSlug =
  "overview" | "brand" | "color" | "type" | "components" | "motion" | "sound" | "foundations";

export interface DesignChapter {
  slug: ChapterSlug;
  title: string;
  href: string;
  source: string;
  summary: string;
}

/** The chapters in the order architecture 13.8 lists them; previous and next links follow it. */
export const designChapters: readonly DesignChapter[] = [
  {
    slug: "overview",
    title: "Design system",
    href: "/design",
    source: "apps/web/src/app/(public)/design/page.tsx",
    summary: "The chapter index, the live tokens and the exports.",
  },
  {
    slug: "brand",
    title: "Brand",
    href: "/design/brand",
    source: "apps/web/src/app/(public)/design/brand/page.tsx",
    summary: "The mark, the wordmark, clear space, minimum sizes and theme rules.",
  },
  {
    slug: "color",
    title: "Color",
    href: "/design/color",
    source: "apps/web/src/app/(public)/design/color/page.tsx",
    summary: "Every color role in both themes with its measured contrast.",
  },
  {
    slug: "type",
    title: "Type and space",
    href: "/design/type",
    source: "apps/web/src/app/(public)/design/type/page.tsx",
    summary: "Newsreader and Figtree, the scale, reading widths and font provenance.",
  },
  {
    slug: "components",
    title: "Components",
    href: "/design/components",
    source: "apps/web/src/app/(public)/design/components/page.tsx",
    summary: "The shared components in their eight states and both themes.",
  },
  {
    slug: "motion",
    title: "Motion",
    href: "/design/motion",
    source: "apps/web/src/app/(public)/design/motion/page.tsx",
    summary: "Durations, easings, the tide and reduced motion.",
  },
  {
    slug: "sound",
    title: "Sound and touch",
    href: "/design/sound",
    source: "apps/web/src/app/(public)/design/sound/page.tsx",
    summary: "The interface cues, their levels, the unlock rule and haptics.",
  },
  {
    slug: "foundations",
    title: "Foundations",
    href: "/design/foundations",
    source: "apps/web/src/app/(public)/design/foundations/page.tsx",
    summary: "Layout, accessibility, copy and privacy rules, and the checklist.",
  },
];

export interface CatalogSpecimen {
  /** The specimen's name exactly as its group writes it. */
  name: string;
  /** The component file, exactly as the specimen's `source`. */
  source: string;
  description: string;
}

export interface CatalogGroup {
  slug: string;
  title: string;
  specimens: readonly CatalogSpecimen[];
}

const ui = "apps/web/src/components/ui/";

/** The specimen groups in the order the components chapter lists them. */
export const specimenGroups: readonly CatalogGroup[] = [
  {
    slug: "actions",
    title: "Actions and feedback",
    specimens: [
      {
        name: "Button, primary",
        source: `${ui}button.tsx`,
        description: "The one main action on a screen, with a loading label that keeps its width.",
      },
      {
        name: "Button, secondary",
        source: `${ui}button.tsx`,
        description: "An alternative action beside the primary one.",
      },
      {
        name: "Button, quiet",
        source: `${ui}button.tsx`,
        description: "A low-emphasis action such as Undo or Cancel.",
      },
      {
        name: "Button, destructive",
        source: `${ui}button.tsx`,
        description: "An action that removes something, colored with the danger role.",
      },
      {
        name: "Button, as a link",
        source: `${ui}button.tsx`,
        description: "The button's look on a real link, for navigation that reads as an action.",
      },
      {
        name: "Text link",
        source: `${ui}text-link.tsx`,
        description: "A link inside running text.",
      },
      {
        name: "Inline feedback",
        source: `${ui}inline-feedback.tsx`,
        description: "A status sentence beside the control it is about, with an optional cue.",
      },
      {
        name: "Toast",
        source: `${ui}toast.tsx`,
        description: "A short confirmation with an optional action, such as Undo.",
      },
      {
        name: "Toast region",
        source: `${ui}toast.tsx`,
        description: "The labelled region that stacks toasts and drops duplicates.",
      },
      {
        name: "Skeleton",
        source: `${ui}skeleton.tsx`,
        description: "The loading placeholder that holds the layout's shape.",
      },
      {
        name: "Empty state",
        source: `${ui}empty-state.tsx`,
        description: "What would be here, why it is not, and the one action that changes that.",
      },
      {
        name: "Disclosure",
        source: `${ui}disclosure.tsx`,
        description: "A native details and summary pair for content shown on request.",
      },
      {
        name: "Copy code",
        source: `${ui}copy-code.tsx`,
        description: "A code block with a copy button that reports success or failure honestly.",
      },
      {
        name: "Token swatch",
        source: `${ui}token-swatch.tsx`,
        description: "A color token painted with its variable and its resolved value.",
      },
      {
        name: "Theme toggle",
        source: `${ui}theme-toggle.tsx`,
        description: "Switches between light and dark and stores the explicit choice.",
      },
      {
        name: "Sound toggle",
        source: `${ui}sound-toggle.tsx`,
        description: "Turns interface sound on or off on this device.",
      },
    ],
  },
  {
    slug: "forms",
    title: "Forms",
    specimens: [
      {
        name: "Form field",
        source: `${ui}form-field.tsx`,
        description:
          "Label above, help text, the inline error below and the required marker for any control.",
      },
      {
        name: "Text input",
        source: `${ui}text-input.tsx`,
        description: "A single-line input with input mode and autocomplete set.",
      },
      {
        name: "Textarea",
        source: `${ui}textarea.tsx`,
        description: "A multi-line input for notes.",
      },
      {
        name: "Time zone combobox",
        source: `${ui}time-zone-combobox.tsx`,
        description: "Searches the IANA time zones and keeps the chosen name.",
      },
      {
        name: "Segmented date input",
        source: `${ui}segmented-date-input.tsx`,
        description: "A calendar date typed in day, month and year parts, kept as YYYY-MM-DD.",
      },
      {
        name: "Measurement input",
        source: `${ui}measurement-input.tsx`,
        description: "A number with a unit toggle that stores metric values.",
      },
      {
        name: "Segmented control",
        source: `${ui}segmented-control.tsx`,
        description: "One choice from a few options, built on native radio buttons.",
      },
      {
        name: "Flow scale",
        source: `${ui}flow-scale.tsx`,
        description: "The five flow values for a day, with none first so clearing is one tap.",
      },
      {
        name: "Chip group",
        source: `${ui}chip-group.tsx`,
        description: "Several choices at once, such as symptoms, as toggle chips.",
      },
      {
        name: "Mood selector",
        source: `${ui}mood-selector.tsx`,
        description: "Three moods, one chosen, as a segmented radio group.",
      },
    ],
  },
  {
    slug: "structure",
    title: "Structure and overlays",
    specimens: [
      {
        name: "App shell",
        source: `${ui}app-shell.tsx`,
        description: "The signed-in frame: tab bar on phones, rail from 1024 px.",
      },
      {
        name: "Tab bar",
        source: `${ui}tab-bar.tsx`,
        description: "The persistent bottom navigation on phones.",
      },
      {
        name: "Rail",
        source: `${ui}rail.tsx`,
        description: "The left navigation on wide screens.",
      },
      {
        name: "Dialog",
        source: `${ui}dialog.tsx`,
        description: "A native modal dialog on the overlay tier with the scrim.",
      },
      {
        name: "Dialog, destructive",
        source: `${ui}dialog.tsx`,
        description: "A dialog whose body names the consequence before a removal.",
      },
      {
        name: "Bottom sheet",
        source: `${ui}bottom-sheet.tsx`,
        description:
          "A native dialog that rises from the bottom edge on phones and centers from 1024 px.",
      },
      {
        name: "Grant row",
        source: `${ui}grant-row.tsx`,
        description:
          "One shared category, what it reveals, and the switch that revokes in one step.",
      },
      {
        name: "Person card",
        source: `${ui}person-card.tsx`,
        description: "Someone the account shares with, every grant listed, and removal.",
      },
      {
        name: "Invitation card",
        source: `${ui}invitation-card.tsx`,
        description: "A pending invitation; Withdraw is the only action.",
      },
      {
        name: "Consent record",
        source: `${ui}consent-record.tsx`,
        description:
          "Categories, purposes and processors, with one unchecked control apart from the terms.",
      },
      {
        name: "Consent record, read-only",
        source: `${ui}consent-record.tsx`,
        description: "The same record read-only in Settings, with the date it was given.",
      },
      {
        name: "Device row",
        source: `${ui}device-row.tsx`,
        description: "The device in use, with the action that signs out every other device.",
      },
      {
        name: "Device row, another device",
        source: `${ui}device-row.tsx`,
        description: "Another signed-in device: the browser, when it was last seen, and revoke.",
      },
    ],
  },
  {
    slug: "calendar",
    title: "Calendar",
    specimens: [
      {
        name: "Day cell textures",
        source: `${ui}day-cell.tsx`,
        description: "Logged, predicted and estimated days drawn as solid, dashed and dotted.",
      },
      {
        name: "Month grid",
        source: `${ui}month-grid.tsx`,
        description: "The calendar month with windows, points, notes and today.",
      },
      {
        name: "Date range selection",
        source: `${ui}date-range-selection.tsx`,
        description: "Choosing a start and an end date on the month grid.",
      },
      {
        name: "Week strip",
        source: `${ui}week-strip.tsx`,
        description: "Seven days above the list view, with the month grid's textures.",
      },
      {
        name: "Day list",
        source: `${ui}day-list.tsx`,
        description: "The calendar as a list of days, the accessible twin of the grid.",
      },
    ],
  },
  {
    slug: "marks",
    title: "Marks and charts",
    specimens: [
      {
        name: "Cycle ring",
        source: `${ui}cycle-ring.tsx`,
        description: "Today's place in the cycle, logged and predicted, with the uncertainty arc.",
      },
      {
        name: "Cycle ring, first guess",
        source: `${ui}cycle-ring.tsx`,
        description: "One logged period: the 28 day default and the first-guess sentence.",
      },
      {
        name: "Cycle ring, not enough regular cycles",
        source: `${ui}cycle-ring.tsx`,
        description:
          "No completed cycle inside 21 to 45 days: no predicted arcs, and the sentence says why.",
      },
      {
        name: "Pregnancy week card",
        source: `${ui}week-card.tsx`,
        description: "The week and days, the trimester bar, the due date and days to go.",
      },
      {
        name: "Pregnancy week card, paused",
        source: `${ui}week-card.tsx`,
        description:
          "The partner's card once a pregnancy has ended: updates are paused, never explained.",
      },
      {
        name: "Timeline",
        source: `${ui}timeline.tsx`,
        description:
          "Dated items in order; expected ones are outlined, dashed and labelled Expected.",
      },
      {
        name: "Timeline, no warmth",
        source: `${ui}timeline.tsx`,
        description:
          "Every row plain, for screens where something else already carries the warmth.",
      },
      {
        name: "Measurement chart",
        source: `${ui}measurement-chart.tsx`,
        description: "A child's measurements over the percentile band.",
      },
      {
        name: "Measurement chart, beyond the band",
        source: `${ui}measurement-chart.tsx`,
        description: "A measurement outside the band, said in words beside the chart.",
      },
      {
        name: "Measurement chart, partner's view in US units",
        source: `${ui}measurement-chart.tsx`,
        description: "The same chart read in US customary units.",
      },
    ],
  },
  {
    slug: "patterns",
    title: "Patterns",
    specimens: [
      {
        name: "Day sheet",
        source: `${ui}day-sheet.tsx`,
        description:
          "The quick-log sheet for one day: flow, symptoms, mood and a note, from the shared parts.",
      },
    ],
  },
];

export interface CatalogSection {
  /** The page the section is on. */
  path: string;
  /** The heading's id on that page. */
  id: string;
  name: string;
  sources: readonly string[];
  description: string;
}

const tokensJson = "packages/design-tokens/tokens.json";
const design = "apps/web/src/app/(public)/design/";
const designParts = "apps/web/src/components/design/";

function sections(
  path: string,
  page: string,
  rows: ReadonlyArray<readonly [id: string, name: string, description: string, extra?: string[]]>,
): CatalogSection[] {
  return rows.map(([id, name, description, extra = []]) => ({
    path,
    id,
    name,
    sources: [page, ...extra],
    description,
  }));
}

/** Every section heading with an id on every chapter page, grouped by chapter. */
export const chapterSections: Readonly<Record<ChapterSlug, readonly CatalogSection[]>> = {
  overview: sections("/design", `${design}page.tsx`, [
    ["exports", "Exports", "Links to the JSON, CSS and Markdown exports and the API contract."],
    ["chapters", "Chapters", "The chapter cards in reading order."],
    ["palette", "Brand palette", "The brand colors with their meaning.", [tokensJson]],
    ["roles", "Semantic colors", "Every color role with its light and dark value.", [tokensJson]],
    ["group-type", "Type tokens", "The type scale as custom properties.", [tokensJson]],
    ["group-spacing", "Spacing tokens", "The spacing scale as custom properties.", [tokensJson]],
    ["group-radius", "Radius tokens", "The corner radii as custom properties.", [tokensJson]],
    ["group-motion", "Motion tokens", "Durations and easings as custom properties.", [tokensJson]],
    ["group-sound", "Sound tokens", "Cue levels as tokens.", [tokensJson]],
  ]),
  brand: sections("/design/brand", `${design}brand/page.tsx`, [
    [
      "lockup",
      "The lockup",
      "The mark and wordmark together in both themes.",
      ["apps/web/public/brand/tidefern-lockup.svg", "apps/web/src/components/logo.tsx"],
    ],
    [
      "variants",
      "Mark variants and downloads",
      "Every mark variant with its file.",
      ["packages/design-tokens/brand/README.md"],
    ],
    ["clear-space", "Clear space", "The space kept free around the lockup."],
    ["minimum-sizes", "Minimum sizes", "The smallest size for the mark and the lockup."],
    ["themes", "Light and dark", "Which variant sits on which surface."],
    ["misuse", "Misuse", "What never to do with the mark."],
    ["typography", "Wordmark and tagline typography", "The faces and weights of the wordmark."],
    ["rasters", "Raster set", "Icons and social images with downloads.", ["scripts/brand"]],
    ["approval", "Approval status", "Where the mark stands with the owner."],
  ]),
  color: sections("/design/color", `${design}color/page.tsx`, [
    [
      "reading",
      "How to read a plate",
      "What each color plate shows: declared, resolved and measured.",
      [`${designParts}color-plates.tsx`],
    ],
    [
      "surfaces",
      "Surfaces",
      "The page, panel and raised surfaces.",
      [tokensJson, `${designParts}color-plates.tsx`],
    ],
    [
      "text",
      "Text roles",
      "Text colors measured against the surfaces they name.",
      [tokensJson, `${designParts}contrast.ts`],
    ],
    [
      "action",
      "The action triple",
      "The action fill, the foreground on it and its ink.",
      [tokensJson],
    ],
    ["interface", "Interface roles", "Borders, focus and other non-text roles.", [tokensJson]],
    [
      "data",
      "Data marks",
      "Colors and textures for logged, predicted and estimated.",
      [tokensJson],
    ],
    ["decorative", "Decorative", "Roles that carry no meaning and need no contrast.", [tokensJson]],
    [
      "palette",
      "The brand palette as text",
      "Which brand colors can carry text, measured.",
      [tokensJson],
    ],
    [
      "checker",
      "Pairing checker",
      "A sandbox that measures any foreground on any surface and writes nothing.",
      [`${designParts}pairing-checker.tsx`],
    ],
    [
      "copy",
      "Copy as CSS",
      "Both themes as custom properties, ready to paste.",
      ["apps/web/src/app/tokens.css"],
    ],
    [
      "themes",
      "Theme behavior",
      "System first, the stored choice, and no flash.",
      ["apps/web/src/components/theme-sync.tsx"],
    ],
  ]),
  type: sections("/design/type", `${design}type/page.tsx`, [
    ["wordmark", "Wordmark and tagline", "The wordmark set in live text."],
    ["scale", "The scale", "Every type token rendered at its size.", [tokensJson]],
    ["body", "Body and reading width", "Body text at the reading measure."],
    ["navigation", "Navigation and controls", "Labels on controls and navigation."],
    ["numerals", "Numerals", "Tabular figures for dates and measurements."],
    [
      "provenance",
      "Provenance",
      "Where the fonts come from and how they are served.",
      ["docs/design/TYPOGRAPHY.md", "apps/web/src/app/layout.tsx"],
    ],
  ]),
  components: [
    ...sections("/design/components/structure", `${design}components/structure/page.tsx`, [
      [
        "shell-demo-heading",
        "The shell at full width",
        "The app shell answering to its own width.",
        [`${ui}app-shell.tsx`],
      ],
      [
        "overlays-heading",
        "Live overlays",
        "The dialog and the bottom sheet, opened for real.",
        [`${ui}dialog.tsx`, `${ui}bottom-sheet.tsx`],
      ],
      [
        "specimens-heading",
        "Every component, every state",
        "The structure group's specimens.",
        [`${ui}specimens/structure.tsx`],
      ],
    ]),
    ...sections("/design/components/calendar", `${design}components/calendar/page.tsx`, [
      ["month-view", "Month view", "The month grid with its key.", [`${ui}month-grid.tsx`]],
      ["list-view", "List view", "The same month as a list of days.", [`${ui}day-list.tsx`]],
      [
        "states",
        "Every state, both themes",
        "The calendar group's specimens.",
        [`${ui}specimens/calendar.tsx`],
      ],
    ]),
  ],
  motion: sections("/design/motion", `${design}motion/page.tsx`, [
    [
      "contract",
      "The contract",
      "What may move, for how long and when.",
      ["apps/web/src/lib/motion-tokens.ts"],
    ],
    [
      "durations",
      "Durations",
      "The four durations, each replayable.",
      ["apps/web/src/lib/motion-tokens.ts", `${designParts}motion-demo.tsx`],
    ],
    [
      "easings",
      "Easings",
      "The four curves drawn from their control points.",
      [`${designParts}curves.ts`, `${designParts}motion-demo.tsx`],
    ],
    [
      "tide",
      "The tide",
      "The one decorative motion, run once on request.",
      [`${designParts}tide-demo.tsx`, "apps/web/src/components/public/tide-line.tsx"],
    ],
    [
      "reduced",
      "Reduced motion",
      "What changes when the system asks for less motion.",
      [`${designParts}reduced-motion-status.tsx`],
    ],
    ["rules", "Rules", "The motion rules every component follows."],
  ]),
  sound: sections("/design/sound", `${design}sound/page.tsx`, [
    [
      "unlock",
      "The unlock rule",
      "Audio starts only after the first gesture.",
      ["apps/web/src/lib/sound.ts", `${designParts}sound-context-state.tsx`],
    ],
    [
      "cues",
      "The cues",
      "Every cue, playable, with its tones.",
      ["apps/web/src/lib/sound.ts", `${designParts}sound-cue-button.tsx`],
    ],
    [
      "meter",
      "Level meter",
      "The cue's level drawn as it plays.",
      [`${designParts}sound-meter.tsx`],
    ],
    [
      "levels",
      "Levels, the mute and quiet hours",
      "All, actions only, off, and quiet hours.",
      ["apps/web/src/lib/quiet-hours.ts", "apps/web/src/app/(app)/settings/sound/page.tsx"],
    ],
    ["touch", "Touch", "Haptic support and its fallback.", [`${designParts}sound-haptics.tsx`]],
    ["tokens", "Tokens", "The sound tokens.", [tokensJson]],
    [
      "rules",
      "What sound never does",
      "The rules for interface sound.",
      ["apps/web/src/components/sound-provider.tsx", "docs/design/SOUND.md"],
    ],
  ]),
  foundations: sections("/design/foundations", `${design}foundations/page.tsx`, [
    ["layout", "Layout and breakpoints", "Breakpoints, sizes and gutters.", [tokensJson]],
    ["spacing", "Spacing scale", "Each spacing token drawn at its size.", [tokensJson]],
    ["radius", "Radius and elevation", "Radii, surface tiers and elevation.", [tokensJson]],
    [
      "accessibility",
      "Accessibility targets",
      "The targets every page meets and the axe tags checked.",
      ["apps/web/tests/e2e/axe.ts"],
    ],
    [
      "copy",
      "Copy rules",
      "Voice, capitalisation and the empty-state formula.",
      ["docs/design/CONTENT.md"],
    ],
    ["privacy", "Privacy rules", "Where health data may never appear.", ["AGENTS.md"]],
    [
      "checklist",
      "Development checklist",
      "Every gate pnpm check runs.",
      ["package.json", `${designParts}gates.ts`],
    ],
  ]),
};

export interface DesignExport {
  name: string;
  href: string;
  contentType: string;
  sources: readonly string[];
  description: string;
}

export const designExports: readonly DesignExport[] = [
  {
    name: "Tokens (JSON)",
    href: "/design/tokens.json",
    contentType: "application/json",
    sources: [tokensJson, `${design}tokens.json/route.ts`],
    description: "The token file as the product reads it.",
  },
  {
    name: "Theme variables (CSS)",
    href: "/design/tokens.css",
    contentType: "text/css",
    sources: ["apps/web/src/app/tokens.css", `${design}tokens.css/route.ts`],
    description: "The generated custom properties for both themes.",
  },
  {
    name: "Reference (Markdown)",
    href: "/design/reference.md",
    contentType: "text/markdown",
    sources: ["apps/web/src/lib/design-catalog.ts", `${design}reference.md/route.ts`],
    description: "This reference as one Markdown page for people and agents.",
  },
  {
    name: "Catalog (JSON)",
    href: "/design/catalog.json",
    contentType: "application/json",
    sources: ["apps/web/src/lib/design-catalog.ts", `${design}catalog.json/route.ts`],
    description: "Every pattern with its anchor and source paths.",
  },
  {
    name: "API contract (OpenAPI 3.1)",
    href: "/api/v1/openapi.json",
    contentType: "application/json",
    sources: ["openapi/v1.json"],
    description: "The HTTP API the clients use.",
  },
];

/** The anchor `SpecimenFrame` gives a specimen's heading. */
export function specimenAnchor(name: string): string {
  return `specimen-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export interface CatalogEntry {
  name: string;
  chapter: ChapterSlug;
  /** A page path and a fragment that names exactly one element on it. */
  href: string;
  /** Repository paths, relative to the root. */
  sources: string[];
  description: string;
  /** For a specimen, its group under /design/components. */
  group?: string;
}

export interface DesignCatalog {
  version: number;
  name: string;
  repository: string;
  chapters: Array<{
    name: string;
    slug: ChapterSlug;
    href: string;
    source: string;
    summary: string;
  }>;
  groups: Array<{ name: string; slug: string; href: string; source: string }>;
  exports: DesignExport[];
  patterns: CatalogEntry[];
}

/** The catalog: chapters in order, then each chapter's sections, with the specimens under components. */
export function buildCatalog(): DesignCatalog {
  const patterns: CatalogEntry[] = [];
  for (const chapter of designChapters) {
    for (const section of chapterSections[chapter.slug]) {
      patterns.push({
        name: section.name,
        chapter: chapter.slug,
        href: `${section.path}#${section.id}`,
        sources: [...section.sources],
        description: section.description,
      });
    }
    if (chapter.slug === "components") {
      for (const group of specimenGroups) {
        for (const specimen of group.specimens) {
          patterns.push({
            name: specimen.name,
            chapter: "components",
            group: group.slug,
            href: `/design/components/${group.slug}#${specimenAnchor(specimen.name)}`,
            sources: [specimen.source, `${ui}specimens/${group.slug}.tsx`],
            description: specimen.description,
          });
        }
      }
    }
  }
  return {
    version: catalogVersion,
    name: "Tidefern design system",
    repository: "https://github.com/iurman/tidefern",
    chapters: designChapters.map((chapter) => ({
      name: chapter.title,
      slug: chapter.slug,
      href: chapter.href,
      source: chapter.source,
      summary: chapter.summary,
    })),
    groups: specimenGroups.map((group) => ({
      name: group.title,
      slug: group.slug,
      href: `/design/components/${group.slug}`,
      source: `${ui}specimens/${group.slug}.tsx`,
    })),
    exports: designExports.map((entry) => ({ ...entry, sources: [...entry.sources] })),
    patterns,
  };
}

/** Escapes a Markdown table cell: backslashes first, then pipes, so no input can end or split a cell. */
export function cell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * The public Markdown reference (`/design/reference.md`): entry points,
 * theme rules, usage, the verification commands, then the catalog as tables.
 */
export function renderReference(catalog: DesignCatalog = buildCatalog()): string {
  const lines: string[] = [
    "# Tidefern design system reference",
    "",
    "Tidefern is a privacy-first web app for cycles, pregnancy and early childhood. This page is the",
    "short, machine-readable companion to the `/design` chapters. Every pattern below links to the",
    "fragment that documents it and to the repository files it is built from. The same data is",
    "served as JSON at `/design/catalog.json`.",
    "",
    "## Entry points",
    "",
    "- Tokens: `packages/design-tokens/tokens.json` is the single source. `pnpm tokens:generate`",
    "  writes `apps/web/src/app/tokens.css`; components read tokens only as CSS custom properties",
    "  such as `var(--page)` and `var(--space-4)`.",
    "- Components: one named export per file in `apps/web/src/components/ui/`, styled with a CSS",
    "  module beside it. Specimens for every state live in `apps/web/src/components/ui/specimens/`.",
    "- Motion: `apps/web/src/lib/motion-tokens.ts` exports `durations`, `easings` and",
    "  `prefersReducedMotion()`, read from the same tokens.",
    "- Sound and touch: the shared `SoundProvider` (`apps/web/src/components/sound-provider.tsx`)",
    "  gives every native control its cue. A component that confirms something plays only the",
    "  success or error cue, once, beside visible text.",
    "- Brand files: `packages/design-tokens/brand/` holds the masters; `pnpm --filter web brand:sync`",
    "  copies them to `apps/web/public/brand/`.",
    "",
    "## Theme rules",
    "",
    "- The first visit follows the system preference. Light is written on `:root`, dark under",
    '  `[data-theme="dark"]` and again inside `prefers-color-scheme: dark` for',
    '  `:root:not([data-theme="light"])`, so the right theme renders before and without JavaScript.',
    "- An explicit choice is stored under one key, `tidefern-theme-v1`, and applied before paint.",
    "- Both themes are designed separately with the semantic roles. Never invert a page or an image;",
    "  the mark swaps to its dark variant.",
    "- Text roles reach 4.5:1 and interface and data roles 3:1 on every surface they name, in both",
    "  themes; `pnpm tokens:contrast` measures them.",
    "- A specimen or experiment pins its own `data-theme` locally and never changes production tokens.",
    "",
    "## Usage",
    "",
    "A module rule that uses tokens only:",
    "",
    "```css",
    ".card {",
    "  background: var(--panel);",
    "  color: var(--text);",
    "  padding: var(--space-4);",
    "  border-radius: var(--radius-card);",
    "}",
    "```",
    "",
    "A component from the shared set:",
    "",
    "```tsx",
    'import { Button } from "@/components/ui/button";',
    "",
    '<Button variant="primary" loading={saving} loadingText="Saving">',
    "  Save",
    "</Button>;",
    "```",
    "",
    "Motion from the tokens, with reduced motion respected:",
    "",
    "```ts",
    'import { durations, easings, prefersReducedMotion } from "@/lib/motion-tokens";',
    "",
    "element.animate([{ opacity: 0 }, { opacity: 1 }], {",
    "  duration: prefersReducedMotion() ? 0 : durations.disclosure,",
    "  easing: easings.disclosure,",
    "});",
    "```",
    "",
    "## Verification",
    "",
    "```sh",
    "pnpm check            # prose, generated files, contrast, lint, types, unit tests, build",
    "pnpm tokens:check     # tokens.css matches tokens.json",
    "pnpm tokens:contrast  # every color role measured in both themes",
    "pnpm --filter web brand:check",
    "pnpm test:e2e         # browser suites, including the /design link and anchor check",
    "```",
    "",
    "## Chapters",
    "",
  ];
  for (const chapter of catalog.chapters) {
    lines.push(`- [${chapter.name}](${chapter.href}): ${chapter.summary}`);
  }
  lines.push("", "## Exports", "");
  for (const entry of catalog.exports) {
    lines.push(`- [${entry.name}](${entry.href}) (\`${entry.contentType}\`): ${entry.description}`);
  }
  for (const chapter of catalog.chapters) {
    const rows = catalog.patterns.filter((pattern) => pattern.chapter === chapter.slug);
    if (rows.length === 0) continue;
    lines.push("", `## ${chapter.name} patterns`, "", "| Pattern | Sources | Description |");
    lines.push("| --- | --- | --- |");
    for (const row of rows) {
      const sources = row.sources.map((source) => `\`${source}\``).join(", ");
      lines.push(`| [${cell(row.name)}](${row.href}) | ${sources} | ${cell(row.description)} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
