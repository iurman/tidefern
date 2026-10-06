import Link from "next/link";
import { designTokens } from "@tidefern/design-tokens";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design",
  "Design system",
  "Tidefern's tokens, brand rules and components, for people and agents building the product.",
  false,
);

/** The chapters that exist as routes; the rest are listed by name until they land. */
const published = new Set([
  "brand",
  "color",
  "type",
  "components",
  "motion",
  "sound",
  "foundations",
]);

const chapters = [
  { slug: "brand", title: "Brand", text: "The mark, the wordmark, clear space and theme rules." },
  { slug: "color", title: "Color", text: "Light and dark roles with measured contrast." },
  { slug: "type", title: "Type and space", text: "Newsreader, Figtree, the scale and the rhythm." },
  { slug: "components", title: "Components", text: "Real controls with every state." },
  { slug: "motion", title: "Motion", text: "Timing, easing and the quieter setting." },
  { slug: "sound", title: "Sound and touch", text: "The cues, their levels and the mute." },
  {
    slug: "foundations",
    title: "Foundations",
    text: "Layout, accessibility and rules for building.",
  },
];

export default function DesignHome() {
  return (
    <div className="design wrap">
      <header className="design-title">
        <p className="eyebrow">Tidefern design system</p>
        <h1>Tokens first, then everything else.</h1>
        <p className="intro">
          This reference is generated from the same source the product uses. The seven chapters
          below are the planned structure; this page already exposes the live tokens and exports.
        </p>
        <p className="design-exports">
          <a href="/design/tokens.json">Tokens (JSON)</a>
          <a href="/design/tokens.css">Theme variables (CSS)</a>
          <a href="/api/v1/openapi.json">API contract (OpenAPI 3.1)</a>
        </p>
      </header>

      <section className="design-section" aria-labelledby="chapters">
        <h2 id="chapters">Chapters</h2>
        <ul className="chapter-grid">
          {chapters.map((chapter) => (
            <li key={chapter.slug}>
              <h3>
                {published.has(chapter.slug) ? (
                  <Link href={`/design/${chapter.slug}`} prefetch={false}>
                    {chapter.title}
                  </Link>
                ) : (
                  chapter.title
                )}
              </h3>
              <p>{chapter.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="design-section" aria-labelledby="palette">
        <h2 id="palette">Brand palette</h2>
        <ul className="swatch-row">
          {designTokens.palette.map((color) => (
            <li key={color.name}>
              <i style={{ background: color.value }} aria-hidden="true" />
              <span>{color.label}</span>
              <code>{color.value}</code>
              <small>{color.meaning}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="design-section" aria-labelledby="roles">
        <h2 id="roles">Semantic colors</h2>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Light</th>
              <th scope="col">Dark</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {designTokens.colors.map((token) => (
              <tr key={token.name}>
                <th scope="row">
                  <code>--{token.name}</code>
                </th>
                <td>
                  <i className="swatch" style={{ background: token.light }} aria-hidden="true" />{" "}
                  <code>{token.light}</code>
                </td>
                <td>
                  <i className="swatch" style={{ background: token.dark }} aria-hidden="true" />{" "}
                  <code>{token.dark}</code>
                </td>
                <td>{token.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(["type", "spacing", "radius", "motion", "sound"] as const).map((group) => (
        <section className="design-section" key={group} aria-labelledby={`group-${group}`}>
          <h2 id={`group-${group}`} style={{ textTransform: "capitalize" }}>
            {group}
          </h2>
          <table className="token-table">
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Value</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {designTokens[group].map((token) => (
                <tr key={token.name}>
                  <th scope="row">
                    <code>--{token.name}</code>
                  </th>
                  <td>
                    <code>{token.value}</code>
                  </td>
                  <td>{token.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
