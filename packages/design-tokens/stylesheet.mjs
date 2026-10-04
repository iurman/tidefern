/**
 * Turns tokens.json into the CSS custom properties the web app consumes.
 * Shared tokens live on :root. Colors are written for light on :root, for
 * dark under [data-theme="dark"], and again for dark inside a
 * prefers-color-scheme media block that applies whenever no explicit light
 * choice is set, so the system theme is honored before and without
 * JavaScript.
 */
export const sharedGroups = [
  "type",
  "weight",
  "leading",
  "tracking",
  "spacing",
  "radius",
  "size",
  "breakpoint",
  "elevation",
  "motion",
  "sound",
];

export function tokenStylesheet(tokens) {
  const declarations = (entries, indent = "  ") =>
    entries.map(([name, value]) => `${indent}--${name}: ${value};`).join("\n");
  const shared = sharedGroups.flatMap((group) =>
    (tokens[group] ?? []).map(({ name, value }) => [name, value]),
  );
  const palette = tokens.palette.map(({ name, value }) => [`palette-${name}`, value]);
  const light = tokens.colors.map(({ name, light: value }) => [name, value]);
  const dark = tokens.colors.map(({ name, dark: value }) => [name, value]);
  return [
    "/* Generated from packages/design-tokens/tokens.json. Run pnpm tokens:generate after editing it. */",
    ":root {",
    declarations(shared),
    declarations(palette),
    "}",
    ":root,",
    '[data-theme="light"] {',
    declarations(light),
    "  color-scheme: light;",
    "}",
    '[data-theme="dark"] {',
    declarations(dark),
    "  color-scheme: dark;",
    "}",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    declarations(dark, "    "),
    "    color-scheme: dark;",
    "  }",
    "}",
    "",
  ].join("\n");
}
