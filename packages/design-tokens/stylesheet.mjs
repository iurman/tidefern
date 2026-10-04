/**
 * Turns tokens.json into the CSS custom properties the web app consumes.
 * Shared tokens (type, spacing, radius, motion, sound) live on :root.
 * Colors are written once per theme; data-theme on <html> selects them.
 */
export function tokenStylesheet(tokens) {
  const declarations = (entries) =>
    entries.map(([name, value]) => `  --${name}: ${value};`).join("\n");
  const shared = ["type", "spacing", "radius", "motion", "sound"].flatMap((group) =>
    tokens[group].map(({ name, value }) => [name, value]),
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
    "",
  ].join("\n");
}
