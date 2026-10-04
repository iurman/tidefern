import { readFile } from "node:fs/promises";

/**
 * Measures every color role against the surfaces its token says it is used
 * on, in both themes, with the WCAG 2.2 formula. Text roles need 4.5:1, ui
 * and data roles need 3:1, action-text is measured on the action fill.
 * Fails when any pairing is below its threshold, so the color chapter can
 * never claim an unmeasured value.
 */
const tokens = JSON.parse(await readFile(new URL("../tokens.json", import.meta.url), "utf8"));

function luminance(hex) {
  const channel = (index) => {
    const c = parseInt(hex.slice(index, index + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const byName = Object.fromEntries(tokens.colors.map((token) => [token.name, token]));
const thresholds = { text: 4.5, ui: 3, data: 3, "on-fill": 4.5 };
const failures = [];
const rows = [];
for (const token of tokens.colors) {
  const threshold = thresholds[token.kind];
  if (!threshold) continue;
  for (const theme of ["light", "dark"]) {
    for (const surfaceName of token.on ?? []) {
      const surface = byName[surfaceName];
      if (!surface) throw new Error(`${token.name} names an unknown surface ${surfaceName}`);
      const ratio = contrast(token[theme], surface[theme]);
      rows.push(
        `${theme.padEnd(5)} ${token.name.padEnd(14)} on ${surfaceName.padEnd(12)} ${ratio.toFixed(2)}:1 (needs ${threshold})`,
      );
      if (ratio < threshold) failures.push(rows.at(-1));
    }
  }
}
if (process.argv.includes("--matrix")) console.log(rows.join("\n"));
if (failures.length) {
  console.error("Contrast below threshold:");
  for (const line of failures) console.error("  " + line);
  process.exit(1);
}
console.log(`tokens:contrast passed (${rows.length} pairings measured)`);
