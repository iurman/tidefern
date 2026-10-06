/* eslint-disable @next/next/no-img-element -- static brand vectors and rasters, served as drawn */
import Link from "next/link";
import lockup from "@tidefern/design-tokens/brand/lockup.json";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata(
  "/design/brand",
  "Brand",
  "The Tidefern mark and lockup in every variant, with clear space, minimum sizes, theme rules, the misuse grid and the approval status.",
  false,
);

const variants = [
  {
    file: "tidefern-mark.svg",
    name: "Full colour",
    use: "Light surfaces: Mist, Sand, white.",
    theme: "light",
  },
  {
    file: "tidefern-mark-dark.svg",
    name: "Dark surfaces",
    use: "Page, surface and panel in dark mode. An invention the sheet does not show.",
    theme: "dark",
  },
  {
    file: "tidefern-mark-mono.svg",
    name: "One colour",
    use: "Forced colours and print.",
    theme: "light",
  },
  {
    file: "tidefern-mark-small.svg",
    name: "Small sizes",
    use: "Below 48 px rendered. Today the same drawing as the full mark; the stem and wave simplification with heavier strokes is owed by the mark's trace step.",
    theme: "light",
  },
  {
    file: "tidefern-icon.svg",
    name: "App icon",
    use: "The mark in a Mist rounded square.",
    theme: "light",
  },
] as const;

const rasters = [
  {
    href: "/favicon.ico",
    name: "favicon.ico",
    spec: "16 and 32 px from the small variant, 48 px from the mark",
  },
  { href: "/apple-icon.png", name: "apple-icon.png", spec: "180 px, opaque Mist, square" },
  { href: "/icons/icon-192.png", name: "icon-192.png", spec: "Manifest icon, purpose any" },
  { href: "/icons/icon-512.png", name: "icon-512.png", spec: "Manifest icon, purpose any" },
  {
    href: "/icons/icon-512-maskable.png",
    name: "icon-512-maskable.png",
    spec: "Ink inside the central 80 percent circle with 10 percent extra padding",
  },
  {
    href: "/opengraph-image.png",
    name: "opengraph-image.png",
    spec: "1200 by 630, the lockup inside a 1000 by 500 safe area",
  },
] as const;

const smallSizes = [16, 24, 32] as const;
const fullSizes = [48, 64, 96] as const;

const { width, height } = lockup.viewBox;
const clear = lockup.clearSpace;
const clearPercent = Math.round((clear / width) * 1000) / 10;

export default function BrandPage() {
  return (
    <div className="design wrap">
      <nav className="chapter-nav" aria-label="Chapters">
        <Link href="/design" prefetch={false}>
          Design system
        </Link>
      </nav>
      <header className="design-title">
        <p className="eyebrow">Brand</p>
        <h1>A frond, a wave, and one word set once.</h1>
        <p className="intro">
          The mark is a hand-authored vector of the brand sheet. The wordmark is outlined once from
          Newsreader so it renders the same in a tab strip, an email and a social card. Everything
          on this page is generated from the same files the product ships, and all of it is pending
          the owner&apos;s approval.
        </p>
      </header>

      <section className="design-section" aria-labelledby="lockup">
        <h2 id="lockup">The lockup</h2>
        <p className="muted-note">
          Mark, wordmark and tagline in one file per theme. The wordmark is Newsreader at optical
          size 72 and weight 500, outlined to paths; the swash f is a hand-drawn edit of the
          font&apos;s f, described under typography below. The tagline is Figtree 500, uppercase,
          tracked 0.18em, in the Sea Glass ink colour.
        </p>
        <div className={styles.pair}>
          <figure className={styles.surface} data-theme="light">
            <img src="/brand/tidefern-lockup.svg" alt="" width={width} height={height} />
            <figcaption>
              Light surfaces.{" "}
              <a href="/brand/tidefern-lockup.svg" download>
                Download tidefern-lockup.svg
              </a>
            </figcaption>
          </figure>
          <figure className={styles.surface} data-theme="dark">
            <img src="/brand/tidefern-lockup-dark.svg" alt="" width={width} height={height} />
            <figcaption>
              Dark surfaces.{" "}
              <a href="/brand/tidefern-lockup-dark.svg" download>
                Download tidefern-lockup-dark.svg
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="design-section" aria-labelledby="variants">
        <h2 id="variants">Mark variants and downloads</h2>
        <p className="muted-note">
          Five vectors, all on the same 512 by 512 box so any of them renders at a given size
          without a per-file offset. The canonical files live in the design tokens package; these
          are the verified copies the app serves.
        </p>
        <ul className={styles.variants}>
          {variants.map((variant) => (
            <li key={variant.file} className={styles.surface} data-theme={variant.theme}>
              <img src={`/brand/${variant.file}`} alt="" width={120} height={120} />
              <h3>{variant.name}</h3>
              <p>{variant.use}</p>
              <a href={`/brand/${variant.file}`} download>
                Download {variant.file}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="design-section" aria-labelledby="clear-space">
        <h2 id="clear-space">Clear space</h2>
        <p className="muted-note">
          Keep a space equal to the wordmark&apos;s cap height free on every side of the lockup:
          {` ${clear} units on the ${width} by ${height} drawing, ${clearPercent} percent of its width. `}
          Nothing else sits inside the dashed line, and the same rule applies to the mark on its
          own, measured against the cap height of the wordmark it would sit beside.
        </p>
        <figure className={`${styles.surface} ${styles.clearSpace}`} data-theme="light">
          <svg
            viewBox={`${-clear} ${-clear} ${width + clear * 2} ${height + clear * 2}`}
            role="img"
            aria-label="The lockup with the clear space drawn as a dashed box one cap height out from every edge, and the cap height shown as a square in the top left corner"
          >
            <rect x={-clear} y={-clear} width={clear} height={clear} className={styles.capSquare} />
            <rect
              x={-clear}
              y={-clear}
              width={width + clear * 2}
              height={height + clear * 2}
              className={styles.clearBox}
            />
            <image href="/brand/tidefern-lockup.svg" width={width} height={height} />
          </svg>
          <figcaption>
            The filled square is one cap height; the dashed box is the clear space.
          </figcaption>
        </figure>
      </section>

      <section className="design-section" aria-labelledby="minimum-sizes">
        <h2 id="minimum-sizes">Minimum sizes</h2>
        <p className="muted-note">
          The mark goes down to 16 px. Below 48 px rendered size architecture 13.2 asks for a stem
          and wave variant with heavier strokes, which the trace step has not produced yet, so the
          16 and 32 px favicon layers are the full mark for now. The lockup is never narrower than{" "}
          {lockup.minimumWidth} px.
        </p>
        <div className={styles.sizes}>
          <figure className={styles.surface} data-theme="light">
            <div className={styles.sizeRow}>
              {smallSizes.map((size) => (
                <img
                  key={size}
                  src="/brand/tidefern-mark-small.svg"
                  alt=""
                  width={size}
                  height={size}
                />
              ))}
            </div>
            <figcaption>Small variant at 16, 24 and 32 px.</figcaption>
          </figure>
          <figure className={styles.surface} data-theme="light">
            <div className={styles.sizeRow}>
              {fullSizes.map((size) => (
                <img key={size} src="/brand/tidefern-mark.svg" alt="" width={size} height={size} />
              ))}
            </div>
            <figcaption>Full mark at 48, 64 and 96 px.</figcaption>
          </figure>
          <figure className={styles.surface} data-theme="light">
            <div className={styles.sizeRow}>
              <img
                src="/brand/tidefern-lockup.svg"
                alt=""
                width={lockup.minimumWidth}
                height={Math.round((lockup.minimumWidth * height) / width)}
              />
              <img
                src="/brand/tidefern-lockup.svg"
                alt=""
                width={240}
                height={Math.round((240 * height) / width)}
              />
            </div>
            <figcaption>Lockup at its {lockup.minimumWidth} px minimum and at 240 px.</figcaption>
          </figure>
        </div>
      </section>

      <section className="design-section" aria-labelledby="themes">
        <h2 id="themes">Light and dark</h2>
        <p className="muted-note">
          Light surfaces take the full colour mark and the Fern wordmark. Dark surfaces take the
          dark variant, whose leaf is lifted to Sage and whose wordmark is Mist; it is never the
          light mark inverted. Under forced colours and in print the one colour variant stands in
          and takes the text colour. The toggles in the header switch the pair; nothing on a page
          may show the light mark on a dark surface.
        </p>
        <div className={styles.pair}>
          <figure className={styles.surface} data-theme="light">
            <div className={styles.sizeRow}>
              <img src="/brand/tidefern-mark.svg" alt="" width={96} height={96} />
              <img src="/brand/tidefern-mark-mono.svg" alt="" width={96} height={96} />
            </div>
            <figcaption>Light: full colour, and the one colour variant beside it.</figcaption>
          </figure>
          <figure className={styles.surface} data-theme="dark">
            <div className={styles.sizeRow}>
              <img src="/brand/tidefern-mark-dark.svg" alt="" width={96} height={96} />
              <img
                src="/brand/tidefern-lockup-dark.svg"
                alt=""
                width={320}
                height={Math.round((320 * height) / width)}
              />
            </div>
            <figcaption>Dark: the dark mark and the dark lockup.</figcaption>
          </figure>
        </div>
      </section>

      <section className="design-section" aria-labelledby="misuse">
        <h2 id="misuse">Misuse</h2>
        <p className="muted-note">
          Each cell shows one thing never to do. The mark is never recreated with a font, an image
          generator or a raster trace; if original vectors arrive they replace the files in place.
        </p>
        <ul className={styles.misuse}>
          <li className={styles.surface} data-theme="light">
            <div className={styles.misuseStage}>
              <img
                className={styles.stretched}
                src="/brand/tidefern-mark.svg"
                alt=""
                width={96}
                height={96}
              />
            </div>
            <p>Never stretch or squash it; scale both axes together.</p>
          </li>
          <li className={styles.surface} data-theme="light">
            <div className={styles.misuseStage}>
              <img
                className={styles.rotated}
                src="/brand/tidefern-mark.svg"
                alt=""
                width={96}
                height={96}
              />
            </div>
            <p>Never rotate it; the wave sits level.</p>
          </li>
          <li className={styles.surface} data-theme="light">
            <div className={styles.misuseStage}>
              <img
                className={styles.recoloured}
                src="/brand/tidefern-mark.svg"
                alt=""
                width={96}
                height={96}
              />
            </div>
            <p>Never recolour it outside the palette; use the light, dark or one colour file.</p>
          </li>
          <li className={styles.surface} data-theme="light">
            <div className={styles.misuseStage}>
              <img
                className={styles.shadowed}
                src="/brand/tidefern-mark.svg"
                alt=""
                width={96}
                height={96}
              />
            </div>
            <p>Never add a shadow, glow, outline or gradient.</p>
          </li>
          <li className={styles.surface} data-theme="dark">
            <div className={styles.misuseStage}>
              <img src="/brand/tidefern-mark.svg" alt="" width={96} height={96} />
            </div>
            <p>Never put the light mark on a dark surface; use the dark variant.</p>
          </li>
          <li className={styles.surface} data-theme="light">
            <div className={`${styles.misuseStage} ${styles.busy}`}>
              <img src="/brand/tidefern-mark.svg" alt="" width={96} height={96} />
            </div>
            <p>
              Never set it on a brand colour or a busy background; Mist, Sand, white or the dark
              page only.
            </p>
          </li>
          <li className={styles.surface} data-theme="light">
            <div className={styles.misuseStage}>
              <p className={styles.wrongFace} aria-hidden="true">
                Tidefern
              </p>
            </div>
            <p>
              Never reset the wordmark in another face or as live text in chrome; use the lockup
              file.
            </p>
          </li>
          <li className={styles.surface} data-theme="light">
            <div className={`${styles.misuseStage} ${styles.cramped}`}>
              <img
                src="/brand/tidefern-lockup.svg"
                alt=""
                width={200}
                height={Math.round((200 * height) / width)}
              />
              <span aria-hidden="true">Sign in</span>
            </div>
            <p>
              Never let anything inside the clear space, and never below {lockup.minimumWidth} px.
            </p>
          </li>
        </ul>
      </section>

      <section className="design-section" aria-labelledby="typography">
        <h2 id="typography">Wordmark and tagline typography</h2>
        <dl className={styles.facts}>
          <dt>Wordmark</dt>
          <dd>
            {lockup.wordmark.family}, optical size {lockup.wordmark.opticalSize}, weight{" "}
            {lockup.wordmark.weight}, shaped with kerning and outlined to paths. On the {width} by{" "}
            {height} drawing the em is {lockup.wordmark.fontSize} units and the cap height{" "}
            {lockup.wordmark.capHeight}.
          </dd>
          <dt>The swash f</dt>
          <dd>
            Newsreader has no swash alternate, so the f is the font&apos;s outline with two edits
            made by hand as path geometry: the flag keeps going from the top of the arch and ends in
            a teardrop over the following e, and the foot serif is replaced by a tail that continues
            below the baseline and sweeps left to a point. The crossbar is extended on the right
            until it meets the e, as the sheet shows. The edit is recorded, point by point, in the
            generator script.
          </dd>
          <dt>Tagline</dt>
          <dd>
            {lockup.tagline.family} {lockup.tagline.weight}, uppercase, tracked{" "}
            {lockup.tagline.tracking}em, sized so it spans the wordmark ({lockup.tagline.fontSize}{" "}
            units), in Sea Glass darkened for light surfaces and lifted for dark ones.
          </dd>
          <dt>In the product</dt>
          <dd>
            Chrome uses the lockup or the mark files. Live Newsreader text stands in only where a
            page sets the word as a heading, and the type chapter shows that pairing.
          </dd>
        </dl>
      </section>

      <section className="design-section" aria-labelledby="rasters">
        <h2 id="rasters">Raster set</h2>
        <p className="muted-note">
          Generated by <code>scripts/brand/generate-icons.mjs</code> with sharp and png-to-ico and
          committed, so the deployment needs no native step. The 1024 px master for a store listing
          is kept as separable layers (Mist background, frond and wave foreground) in the tokens
          package under <code>brand/master/</code>.
        </p>
        <ul className={styles.rasters}>
          {rasters.map((raster) => (
            <li key={raster.href}>
              <img
                src={raster.href}
                alt=""
                width={raster.href.endsWith("opengraph-image.png") ? 160 : 64}
                height={raster.href.endsWith("opengraph-image.png") ? 84 : 64}
              />
              <div>
                <a href={raster.href} download>
                  {raster.name}
                </a>
                <p className="caption">{raster.spec}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="design-section" aria-labelledby="approval">
        <h2 id="approval">Approval status</h2>
        <p className={styles.status}>Pending the owner&apos;s approval.</p>
        <p className="muted-note">
          Three things wait on the owner: the hand-authored reconstruction of the mark, the dark
          surface variant the sheet never shows, and the swash f drawn by hand. If original vectors
          arrive they replace the files in place and the raster set is regenerated with the same
          command.
        </p>
      </section>

      <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
        <Link href="/design" prefetch={false}>
          Previous: Design system
        </Link>
        <Link href="/design/color" prefetch={false}>
          Next: Color
        </Link>
      </nav>
    </div>
  );
}
