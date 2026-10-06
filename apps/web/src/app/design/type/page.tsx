import Link from "next/link";
import { designTokens } from "@tidefern/design-tokens";
import { Mark } from "@/components/logo";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/type",
  "Type and space",
  "Newsreader and Figtree in real specimens: the scale, the numerals, the estimate sentence and the wordmark, in both themes.",
  false,
);

const scale = designTokens.type.filter((token) => token.name.startsWith("type-"));

const navigationLabels = ["Today", "Calendar", "Journey", "Family", "Sharing", "Settings"];

const comparedValues = ["1,118", "11,181", "7.9", "14,000"];

export default function TypePage() {
  return (
    <div className="design wrap">
      <nav className="chapter-nav" aria-label="Chapters">
        <Link href="/design" prefetch={false}>
          Design system
        </Link>
      </nav>
      <header className="design-title">
        <p className="eyebrow">Type and space</p>
        <h1>Two faces, each with one job.</h1>
        <p className="intro">
          Newsreader carries display, headings and the wordmark. Figtree carries body, controls,
          labels and every numeral. The pairing is decided in the architecture record (section
          13.5); this chapter shows it in the sizes the product uses, in both themes.
        </p>
      </header>

      <section className="design-section" aria-labelledby="wordmark">
        <h2 id="wordmark">Wordmark and tagline</h2>
        <p className="muted-note">
          The wordmark is live Newsreader at weight 500 until the outlined vector arrives with the
          brand assets (task G4). The tagline is Figtree, uppercase, tracked 0.18em, in the accent
          role so it stays readable on every surface.
        </p>
        <div className="specimen lockup">
          <Mark size={96} />
          <div>
            <p className="specimen-wordmark">Tidefern</p>
            <p className="eyebrow specimen-tagline">Life flows together</p>
          </div>
        </div>
        <div className="specimen lockup lockup-panel">
          <Mark size={48} />
          <div>
            <p className="specimen-wordmark small">Tidefern</p>
            <p className="eyebrow specimen-tagline">Life flows together</p>
          </div>
        </div>
      </section>

      <section className="design-section" aria-labelledby="scale">
        <h2 id="scale">The scale</h2>
        <p className="muted-note">
          Each row is set in its own token. Display and heading sizes are clamped between phone and
          desktop; body is 17 px on desktop and 16 px on phones with a line height of 1.6.
        </p>
        <ol className="scale-list">
          {scale.map((token) => (
            <li key={token.name}>
              <div className="scale-meta">
                <code>--{token.name}</code>
                <span className="caption">{token.value}</span>
              </div>
              <p
                className={
                  token.name === "type-display" || token.name === "type-heading"
                    ? "specimen-serif"
                    : "specimen-sans"
                }
                style={{ fontSize: `var(--${token.name})` }}
              >
                {token.name === "type-display"
                  ? "Life flows together."
                  : token.name === "type-heading"
                    ? "Every chapter, one quiet place."
                    : token.name === "type-intro"
                      ? "One app for every chapter, for you and the people who grow with you."
                      : "Log a day in a few taps, see where you are, and keep notes that stay yours."}
              </p>
              <p className="caption">{token.use}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="design-section" aria-labelledby="body">
        <h2 id="body">Body and reading width</h2>
        <p className="muted-note">
          Reading passages sit between 45 and 68 characters. The paragraph below is the footer
          sentence the product uses, at the real size and width.
        </p>
        <p className="specimen-reading">
          Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis
          or treatment, and is not a form of birth control. Talk with your doctor or midwife before
          making health decisions.
        </p>
        <p className="estimate specimen-estimate">
          Based on your last 5 cycles, your next period will likely start between Oct 21 and Oct 23.
        </p>
        <p className="caption">
          The estimate sentence is the only italic in the product: Newsreader italic at the intro
          size, which keeps the serif italic out of the small sizes where it reads worst.
        </p>
      </section>

      <section className="design-section" aria-labelledby="navigation">
        <h2 id="navigation">Navigation and controls</h2>
        <p className="muted-note">
          Figtree at the small size, weight 600. Labels are sentence case; page titles are the one
          place Title Case is used.
        </p>
        <ul className="specimen-nav" aria-label="Navigation label specimen">
          {navigationLabels.map((label, index) => (
            <li key={label} aria-current={index === 0 ? "page" : undefined}>
              {label}
            </li>
          ))}
        </ul>
        <div className="specimen-controls">
          <span className="action">Create an account</span>
          <span className="quiet-action">Add a private note</span>
          <button type="button" className="chip-specimen" aria-pressed="true">
            Cramps
          </button>
          <button type="button" className="chip-specimen" aria-pressed="false">
            Headache
          </button>
        </div>
      </section>

      <section className="design-section" aria-labelledby="numerals">
        <h2 id="numerals">Numerals</h2>
        <p className="muted-note">
          Counters, dates and compared columns use Figtree with tabular figures, so digits line up.
          Display numerals sit beside a Newsreader label and never alone.
        </p>
        <div className="numeral-grid">
          <div>
            <p className="caption">Proportional, wrong for a column</p>
            <ul className="numeral-column proportional">
              {comparedValues.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="caption">Tabular, right for a column</p>
            <ul className="numeral-column tabular">
              {comparedValues.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="caption">Display numeral beside its label</p>
            <p className="specimen-display-numeral">
              <span className="numeral">12</span>{" "}
              <span className="numeral-label">day of your cycle</span>
            </p>
            <p className="specimen-display-numeral">
              <span className="numeral">24</span>{" "}
              <span className="numeral-label">weeks and 3 days</span>
            </p>
          </div>
        </div>
      </section>

      <section className="design-section" aria-labelledby="provenance">
        <h2 id="provenance">Provenance</h2>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Family and axes</th>
              <th scope="col">Size</th>
              <th scope="col">Licence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <code>newsreader-latin-opsz-normal.woff2</code>
              </th>
              <td>Newsreader, optical size 6 to 72, weight 200 to 800</td>
              <td className="tabular">132 KB</td>
              <td>SIL Open Font License 1.1</td>
            </tr>
            <tr>
              <th scope="row">
                <code>newsreader-latin-wght-italic.woff2</code>
              </th>
              <td>Newsreader italic, weight 200 to 800</td>
              <td className="tabular">64 KB</td>
              <td>SIL Open Font License 1.1</td>
            </tr>
            <tr>
              <th scope="row">
                <code>figtree-latin-wght-normal.woff2</code>
              </th>
              <td>Figtree, weight 300 to 900</td>
              <td className="tabular">20 KB</td>
              <td>SIL Open Font License 1.1</td>
            </tr>
            <tr>
              <th scope="row">
                <code>figtree-latin-wght-italic.woff2</code>
              </th>
              <td>Figtree italic, weight 300 to 900</td>
              <td className="tabular">21 KB</td>
              <td>SIL Open Font License 1.1</td>
            </tr>
          </tbody>
        </table>
        <p className="caption">
          Latin subsets from fontsource 5.3.0, self-hosted with the licence text beside each file
          and loaded through next/font with swap and matched fallback metrics. Why these two faces
          won is recorded in docs/design/TYPOGRAPHY.md.
        </p>
      </section>

      <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
        <Link href="/design/color" prefetch={false}>
          Previous: Color
        </Link>
        <Link href="/design/components" prefetch={false}>
          Next: Components
        </Link>
      </nav>
    </div>
  );
}
