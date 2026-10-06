import { designTokens, type ColorToken, type Theme } from "@tidefern/design-tokens";
import { ChapterFoot, ChapterHead } from "@/components/design/chapter-nav";
import { ColorPlates, type Plate } from "@/components/design/color-plates";
import { AA_TEXT, contrast, formatRatio, thresholdFor } from "@/components/design/contrast";
import { PairingChecker } from "@/components/design/pairing-checker";
import { CopyCode } from "@/components/ui/copy-code";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata(
  "/design/color",
  "Color",
  "Every color role in both themes, painted from the stylesheet and measured against each surface it names, with a sandboxed pairing checker and copyable variables.",
  false,
);

const repositoryFile = "https://github.com/iurman/tidefern/blob/main/";

const byName = new Map(designTokens.colors.map((token) => [token.name, token]));

function token(name: string): ColorToken {
  const found = byName.get(name);
  if (!found) throw new Error(`Unknown color role ${name}`);
  return found;
}

/** The plates for one theme: the declared value and the ratio on every surface the role names. */
function platesFor(names: string[], theme: Theme): Plate[] {
  return names.map((name) => {
    const role = token(name);
    const threshold = thresholdFor(role.kind);
    const samples =
      threshold === undefined
        ? []
        : (role.on ?? []).map((surface) => ({
            surface,
            declared: contrast(role[theme], token(surface)[theme]),
            threshold,
          }));
    return {
      name: role.name,
      label: role.label,
      use: role.use,
      kind: role.kind,
      declared: role[theme],
      samples,
    };
  });
}

const groups = [
  {
    id: "surfaces",
    title: "Surfaces",
    lede: "Four tiers separate layers without a shadow, plus warmth for the one highlighted thing on a screen. Surfaces are measured through the roles placed on them.",
    names: ["page", "surface", "panel", "overlay", "warmth"],
  },
  {
    id: "text",
    title: "Text roles",
    lede: "Each needs 4.5:1 on every surface it names. Success, warning and danger are text colors here: ink, not fills.",
    names: ["text", "muted", "accent", "success", "warning", "danger"],
  },
  {
    id: "action",
    title: "The action triple",
    lede: "The one role that ships as a fill with its own foreground. Action text is measured on the action fill, never on a surface.",
    names: ["action", "action-text"],
  },
  {
    id: "interface",
    title: "Interface roles",
    lede: "Borders and the focus ring need 3:1 as non-text contrast. The soft border is decorative and separates tiers without carrying meaning.",
    names: ["border", "soft-border", "focus"],
  },
  {
    id: "data",
    title: "Data marks",
    lede: "Three colors for logged and estimated facts, each at 3:1 or better on the four surfaces. The texture below carries the meaning; the hue only agrees with it.",
    names: ["data-period", "data-fertile", "data-band"],
  },
  {
    id: "decorative",
    title: "Decorative",
    lede: "The tide and the leaf are never text and never a data mark, so nothing is measured.",
    names: ["tide", "leaf"],
  },
] as const;

const kinds = [
  { kind: "surface", meaning: "A background other roles are measured on", threshold: "none" },
  { kind: "text", meaning: "Words on a surface", threshold: "4.5:1" },
  {
    kind: "fill",
    meaning: "A filled control; its foreground is a separate role",
    threshold: "none",
  },
  { kind: "on-fill", meaning: "Words on a fill", threshold: "4.5:1 on the fill" },
  { kind: "ui", meaning: "A border, ring or other non-text element", threshold: "3:1" },
  { kind: "data", meaning: "A mark in a chart or calendar", threshold: "3:1" },
  { kind: "decorative", meaning: "Never text, never a data mark", threshold: "none" },
] as const;

const anchors = [
  { id: "reading", label: "How to read a plate" },
  ...groups.map((group) => ({ id: group.id, label: group.title })),
  { id: "textures", label: "Textures" },
  { id: "palette", label: "The brand palette as text" },
  { id: "checker", label: "Pairing checker" },
  { id: "copy", label: "Copy as CSS" },
  { id: "themes", label: "Theme behavior" },
];

const lightPage = token("page").light;

/** The brand colors that reach 4.5:1 as text on the light page, measured, not asserted. */
const readablePalette = designTokens.palette.filter(
  (color) => contrast(color.value, lightPage) >= AA_TEXT,
);

const paletteVerdict =
  readablePalette.length === 0
    ? "none reaches 4.5:1"
    : `only ${readablePalette.map((color) => color.label).join(" and ")} ${
        readablePalette.length === 1 ? "reaches" : "reach"
      } 4.5:1`;

const lightBlock = `:root,\n[data-theme="light"] {\n${designTokens.colors
  .map((color) => `  --${color.name}: ${color.light};`)
  .join("\n")}\n}`;

const darkBlock = `[data-theme="dark"] {\n${designTokens.colors
  .map((color) => `  --${color.name}: ${color.dark};`)
  .join("\n")}\n}`;

const usage = `.card {\n  background: var(--surface);\n  color: var(--text);\n  border: 1px solid var(--soft-border);\n}\n\n.card p {\n  color: var(--muted);\n}\n\n.card a {\n  color: var(--accent);\n}`;

const checkerRoles = designTokens.colors.map((color) => ({
  name: color.name,
  label: color.label,
  light: color.light,
  dark: color.dark,
}));

const measuredPairings = designTokens.colors.reduce(
  (count, color) => count + (thresholdFor(color.kind) ? (color.on?.length ?? 0) * 2 : 0),
  0,
);

export default function ColorPage() {
  return (
    <div className="design wrap">
      <ChapterHead anchors={anchors} />
      <header className="design-title">
        <p className="eyebrow">Color</p>
        <h1>Every role, measured on the surface it names.</h1>
        <p className="intro">
          Light and dark are designed independently; nothing is inverted. Each plate below is
          painted with its own custom property, so the chip is whatever the stylesheet says, and
          after paint the browser&apos;s resolved value and the ratio of the painted pair are read
          back beside the token file&apos;s declared value. <code>pnpm tokens:contrast</code>{" "}
          measures the same <span className="tabular">{measuredPairings}</span> pairings and fails
          the build when one falls below its threshold.
        </p>
      </header>

      <section className="design-section" aria-labelledby="reading">
        <h2 id="reading">How to read a plate</h2>
        <p className="muted-note">
          A role carries a kind, both theme values and the list of surfaces it is used on. The kind
          decides the threshold. A status color is never one value: the fill, the foreground on that
          fill and the ink for text on the page are three members, each measured. Action is the only
          triple the token file ships today; success, warning and danger ship as ink only, so they
          are never used as a fill, and the calendar draws a logged period as a stroke with a faint
          fill for the same reason.
        </p>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Meaning</th>
              <th scope="col">Needs</th>
              <th scope="col">Roles</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((row) => (
              <tr key={row.kind}>
                <th scope="row">
                  <code>{row.kind}</code>
                </th>
                <td>{row.meaning}</td>
                <td className="tabular">{row.threshold}</td>
                <td>
                  {designTokens.colors
                    .filter((color) => color.kind === row.kind)
                    .map((color) => color.name)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {groups.map((group) => (
        <section className="design-section" key={group.id} aria-labelledby={group.id}>
          <h2 id={group.id}>{group.title}</h2>
          <p className="muted-note">{group.lede}</p>
          <div className={styles.themes}>
            <div>
              <p className={styles.themeLabel}>Light</p>
              <ColorPlates theme="light" plates={platesFor([...group.names], "light")} />
            </div>
            <div>
              <p className={styles.themeLabel}>Dark</p>
              <ColorPlates theme="dark" plates={platesFor([...group.names], "dark")} />
            </div>
          </div>
          {group.id === "data" ? <Textures /> : null}
        </section>
      ))}

      <section className="design-section" aria-labelledby="palette">
        <h2 id="palette">The brand palette as text</h2>
        <p className="muted-note">
          The raw brand colors are decoration. Measured as text on the light page (
          <code>{lightPage}</code>), {paletteVerdict}, which is why the semantic roles above carry
          every word.
        </p>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Color</th>
              <th scope="col">Value</th>
              <th scope="col">On the light page</th>
              <th scope="col">As text</th>
            </tr>
          </thead>
          <tbody>
            {designTokens.palette.map((color) => {
              const ratio = contrast(color.value, lightPage);
              return (
                <tr key={color.name}>
                  <th scope="row">{color.label}</th>
                  <td>
                    <i className="swatch" style={{ background: color.value }} aria-hidden="true" />{" "}
                    <code>{color.value}</code>
                  </td>
                  <td className="tabular">{formatRatio(ratio)}</td>
                  <td>{ratio >= AA_TEXT ? "passes" : "decoration only"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="design-section" aria-labelledby="checker">
        <h2 id="checker">Pairing checker</h2>
        <p className="muted-note">
          Pick any two roles and a theme. The preview pins its own theme and paints the pair; the
          ratio is read from what the browser painted, and the two AA lines are reported. This is a
          sandbox: it reads the running stylesheet and writes nothing, so production tokens never
          change from here. They change in <code>packages/design-tokens/tokens.json</code>, and{" "}
          <code>pnpm tokens:contrast</code> is the gate.
        </p>
        <PairingChecker roles={checkerRoles} />
      </section>

      <section className="design-section" aria-labelledby="copy">
        <h2 id="copy">Copy as CSS</h2>
        <p className="muted-note">
          The variables as the generated stylesheet declares them, both themes, built from the same
          token file. The whole stylesheet and the JSON are on the hub as downloads.
        </p>
        <p className="design-exports">
          <TextLink href="/design/tokens.json">Tokens (JSON)</TextLink>
          <TextLink href="/design/tokens.css">Theme variables (CSS)</TextLink>
          <TextLink href={`${repositoryFile}packages/design-tokens/tokens.json`} external>
            Source: tokens.json
          </TextLink>
        </p>
        <div className={styles.copyGrid}>
          <CopyCode code={lightBlock} label="Light theme variables" language="css" />
          <CopyCode code={darkBlock} label="Dark theme variables" language="css" />
        </div>
        <CopyCode code={usage} label="Usage" language="css" />
      </section>

      <section className="design-section" aria-labelledby="themes">
        <h2 id="themes">Theme behavior</h2>
        <ul className={styles.rules}>
          <li>
            First visit follows the system. The stylesheet writes light on <code>:root</code>, dark
            under <code>[data-theme=&quot;dark&quot;]</code>, and dark again inside a{" "}
            <code>prefers-color-scheme: dark</code> block, so the system theme renders before and
            without JavaScript.
          </li>
          <li>
            A pre-paint script reads one stored key (<code>tidefern-theme-v1</code>) and sets{" "}
            <code>data-theme</code> on the root, so there is no flash. While the source is the
            system, a change in the system preference applies live; a choice made in another tab
            arrives through the storage event.
          </li>
          <li>
            The toggle stores an explicit choice and rewrites both <code>theme-color</code> metas.
            Clearing this site&apos;s data in the browser removes the key and returns to following
            the system; the key is listed on <TextLink href="/privacy">the privacy page</TextLink>{" "}
            under Appearance.
          </li>
          <li>
            Images never invert; the mark swaps to its dark variant. Warmth pairs with text, accent
            and danger only and never hosts a form control.
          </li>
          <li>
            Any element can pin a theme with <code>data-theme</code>: the plates on this page do,
            which is why both columns stay right whatever the header toggle says.
          </li>
        </ul>
      </section>

      <ChapterFoot
        previous={{ href: "/design/brand", label: "Brand" }}
        next={{ href: "/design/type", label: "Type and space" }}
      />
    </div>
  );
}

const marks = [
  { key: "logged", label: "Logged period", note: "solid stroke, faint fill" },
  { key: "predicted", label: "Predicted period", note: "dashed, no fill" },
  { key: "estimated", label: "Estimated fertile", note: "dotted, no fill" },
  { key: "band", label: "Percentile band", note: "40 percent fill, solid edge" },
  { key: "ovulation", label: "Ovulation", note: "outlined dot in the text role" },
  { key: "today", label: "Today", note: "the action role" },
] as const;

/** The data mark textures in both themes: the distinctions that survive without hue. */
function Textures() {
  return (
    <figure className={styles.textures} id="textures">
      <figcaption>
        <h3>Textures</h3>
        <p className="muted-note">
          Every predicted state is dashed, every estimate is dotted, the band is a tint with a solid
          edge, and ovulation and today use the text and action roles as outlined and filled dots.
          Under forced colors the strokes keep these differences, so the marks never rely on color
          alone.
        </p>
      </figcaption>
      <div className={styles.themes}>
        {(["light", "dark"] as const).map((theme) => (
          <ul key={theme} className={styles.markRow} data-theme={theme}>
            {marks.map((mark) => (
              <li key={mark.key}>
                <span className={`${styles.mark} ${styles[mark.key]}`} aria-hidden="true" />
                <span className={styles.markLabel}>{mark.label}</span>
                <span className={styles.markNote}>{mark.note}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </figure>
  );
}
