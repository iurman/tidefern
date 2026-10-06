// Generates the brand assets from the hand-authored mark vectors and the
// self-hosted fonts (architecture 13.2, docs/design/ASSETS.md). Everything it
// writes is committed, so Vercel never runs sharp or a font library at build
// time. Run from the repository root: `pnpm brand:generate`.
//
//   packages/design-tokens/brand/tidefern-lockup.svg        mark, wordmark, tagline for light surfaces
//   packages/design-tokens/brand/tidefern-lockup-dark.svg   the same for dark surfaces
//   packages/design-tokens/brand/lockup.json                the lockup geometry the brand chapter prints
//   packages/design-tokens/brand/master/                    1024 px icon master as separable layers
//   apps/web/src/app/favicon.ico                            16 and 32 from the small variant, 48 from the mark
//   apps/web/src/app/apple-icon.png                         180 px, opaque Mist, square (iOS rounds it)
//   apps/web/src/app/opengraph-image.png (+ .alt.txt)       1200 by 630, lockup inside the 1000 by 500 safe area
//   apps/web/public/icons/icon-192.png, icon-512.png        manifest icons, purpose any
//   apps/web/public/icons/icon-512-maskable.png             ink inside the central 80 percent circle, 10 percent extra padding
//
// The wordmark is outlined from Newsreader at optical size 72 and weight 500.
// The WOFF2 the site serves is decoded to SFNT with wawoff2 (Google's woff2
// decoder compiled to WebAssembly) because fontkit cannot instance a variable
// WOFF2 in place; fontkit then applies the two axes and shapes the word with
// kerning. The swash f is not in the font: it is a hand-drawn path edit of the
// font's f, recorded below with the reasoning, and it is the only glyph the
// script replaces.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import pngToIco from "png-to-ico";
import sharp from "sharp";
import { decompress } from "wawoff2";

const root = new URL("../../", import.meta.url);
const brandDir = new URL("packages/design-tokens/brand/", root);
const masterDir = new URL("master/", brandDir);
const appDir = new URL("apps/web/src/app/", root);
const iconsDir = new URL("apps/web/public/icons/", root);
const fontsDir = new URL("apps/web/public/fonts/", root);

const previewFlag = process.argv.indexOf("--preview");
const previewDir = previewFlag >= 0 ? process.argv[previewFlag + 1] : undefined;

// Brand sheet values (architecture 13.2). The lockup files are static, so they
// carry the hex values the tokens derive from, not the CSS variables.
const palette = {
  fern: "#2F4F46",
  mist: "#F7F5EF",
  // Sea Glass darkened for text on light surfaces (the light accent token).
  seaGlassInk: "#35645D",
  // Sea Glass lifted for text on dark surfaces (the dark accent token).
  seaGlassLight: "#8FC1B9",
};

const markBox = 512;
const wordmarkText = "Tidefern";
const taglineText = "LIFE FLOWS TOGETHER";
const taglineTracking = 0.18;
const wordmarkSize = 200;

/**
 * The swash f, in Newsreader's font units (2000 per em, y up, origin at the
 * glyph origin), replacing the font's f in the wordmark only. The brand sheet
 * sets the word with a display f whose flag sweeps right over the following e
 * and whose stem continues below the baseline into a tail that curls left and
 * ends in a point. Newsreader has no such alternate, so this is the font's
 * outline with two edits:
 *
 * 1. The flag. The font's hook ends in a ball at x 850 to 945. The outer edge
 *    now keeps going from the top of the arch (701, 1486) through (950, 1440)
 *    to a teardrop at x 1052 to 1165, y 1215 to 1330, and the inner edge
 *    returns along y about 1412 to rejoin the font's inner curve at
 *    (574, 1412). The hairline stays about 70 units thick, as in the font.
 * 2. The tail. The foot serif (x 60 to 583, y 0 to 59) is removed. From
 *    (432, 120) on the right edge the stem tapers through the baseline and
 *    sweeps left to a point at (100, -450); the left edge returns through
 *    (205, -70) to the stem at (192, 300).
 *
 * The crossbar is the font's own, extended on the right from x 753 to 800 so
 * it meets the following e as the sheet shows. Everything above y 1002 on
 * the left edge and the inner arch from (574, 1412) down to (432, 1208) is
 * the font's outline, untouched.
 */
const swashF = [
  "M247 901L208 883L27 938L27 970L221 1034L299 1024L800 1024L782 901Z",
  "M432 300L432 120Q432 -60 372 -230Q320 -370 205 -440Q150 -470 100 -450",
  "Q125 -412 165 -345Q212 -250 205 -70Q200 80 192 300L192 1002",
  "Q192 1110 230 1198.5Q268 1287 336 1351.5Q404 1416 497 1451Q590 1486 701 1486",
  "Q830 1486 950 1440Q1070 1394 1130 1330Q1165 1292 1162 1255Q1158 1215 1112 1215",
  "Q1072 1215 1052 1260Q1000 1335 920 1375Q840 1412 740 1413Q650 1414 574 1412",
  "Q525 1412 493.5 1390Q462 1368 447 1322.5Q432 1277 432 1208Z",
].join("");

async function loadVariableFont(file, variation) {
  const woff2 = await readFile(new URL(file, fontsDir));
  const sfnt = Buffer.from(await decompress(woff2));
  const font = fontkit.create(sfnt);
  for (const axis of Object.keys(variation)) {
    if (!font.variationAxes[axis]) throw new Error(`${file} has no ${axis} axis`);
  }
  return { font, instance: font.getVariation(variation) };
}

/** Shapes a string and returns each glyph with its pen position in font units. */
function shape(instance, text, features, trackingEm = 0) {
  const run = instance.layout(text, features);
  const tracking = trackingEm * instance.unitsPerEm;
  let pen = 0;
  const glyphs = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const placed = {
      name: glyph.name,
      x: pen + position.xOffset,
      y: position.yOffset,
      d: glyph.path.toSVG(),
      bbox: glyph.bbox,
    };
    pen += position.xAdvance + tracking;
    return placed;
  });
  return { glyphs, advance: pen - tracking };
}

/** Walks an absolute-coordinate path (M, L, Q, C, Z) and maps every point. */
function mapPath(d, map) {
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let out = "";
  let pending = [];
  const flush = () => {
    for (let i = 0; i + 1 < pending.length; i += 2) {
      const [x, y] = map(Number(pending[i]), Number(pending[i + 1]));
      out += `${round(x)} ${round(y)} `;
    }
    pending = [];
  };
  for (const token of tokens) {
    if (/^[MLQCZ]$/i.test(token)) {
      flush();
      out += token;
    } else {
      pending.push(token);
    }
  }
  flush();
  return out.replace(/\s+(?=[MLQCZ])/g, "").trim();
}

function pathBounds(d) {
  const numbers = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    box.minX = Math.min(box.minX, numbers[i]);
    box.maxX = Math.max(box.maxX, numbers[i]);
    box.minY = Math.min(box.minY, numbers[i + 1]);
    box.maxY = Math.max(box.maxY, numbers[i + 1]);
  }
  return box;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Outlines a shaped word at a pixel size. Returns the path data in pixel
 * units with the baseline at y 0, plus the ink box in the same units.
 */
function outline(shaped, unitsPerEm, size, replacements = {}) {
  const k = size / unitsPerEm;
  const ink = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const parts = shaped.glyphs.map((glyph) => {
    const source = replacements[glyph.name] ?? glyph.d;
    const bounds = replacements[glyph.name] ? pathBounds(source) : glyph.bbox;
    ink.minX = Math.min(ink.minX, (glyph.x + bounds.minX) * k);
    ink.maxX = Math.max(ink.maxX, (glyph.x + bounds.maxX) * k);
    ink.minY = Math.min(ink.minY, -(glyph.y + bounds.maxY) * k);
    ink.maxY = Math.max(ink.maxY, -(glyph.y + bounds.minY) * k);
    return mapPath(source, (x, y) => [(glyph.x + x) * k, -(glyph.y + y) * k]);
  });
  return { d: parts.join(""), ink, advance: shaped.advance * k };
}

/** The drawing inside a mark SVG, without the title, ready to nest in a group. */
async function markDrawing(file) {
  const svg = await readFile(new URL(file, brandDir), "utf8");
  return svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, "")
    .trim();
}

/** Measures where the ink of a 512-box drawing actually is, in box units. */
async function inkBounds(drawing) {
  const probe = 1024;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markBox} ${markBox}" width="${probe}" height="${probe}">${drawing}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const scale = markBox / probe;
  return {
    minX: minX * scale,
    minY: minY * scale,
    maxX: (maxX + 1) * scale,
    maxY: (maxY + 1) * scale,
  };
}

function svgDocument({ width, height, viewBox, title, body }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-labelledby="lockup-title">`,
    `  <title id="lockup-title">${title}</title>`,
    body,
    "</svg>",
    "",
  ].join("\n");
}

async function buildLockups() {
  const newsreader = await loadVariableFont("newsreader-latin-opsz-normal.woff2", {
    opsz: 72,
    wght: 500,
  });
  const figtree = await loadVariableFont("figtree-latin-wght-normal.woff2", { wght: 500 });

  const wordShaped = shape(newsreader.instance, wordmarkText, ["kern", "liga"]);
  if (!wordShaped.glyphs.some((glyph) => glyph.name === "f")) {
    throw new Error("Newsreader shaped the wordmark without a glyph named f");
  }
  const word = outline(wordShaped, newsreader.font.unitsPerEm, wordmarkSize, { f: swashF });
  const capHeight = round((newsreader.font.capHeight * wordmarkSize) / newsreader.font.unitsPerEm);

  // The tagline is as wide as the wordmark's ink, tracked 0.18em, as on the sheet.
  const tagShaped = shape(figtree.instance, taglineText, ["kern"], taglineTracking);
  const unit = outline(tagShaped, figtree.font.unitsPerEm, 1);
  const taglineSize = round((word.ink.maxX - word.ink.minX) / (unit.ink.maxX - unit.ink.minX), 3);
  const tagline = outline(tagShaped, figtree.font.unitsPerEm, taglineSize);
  const taglineCap = round((figtree.font.capHeight * taglineSize) / figtree.font.unitsPerEm);

  // Vertical rhythm: the wordmark baseline sits at the ascender height, the
  // tagline's cap line a little more than a third of a cap height below it, so
  // the swash tail stops short of the tagline.
  const ascender = -word.ink.minY;
  const baseline = round(ascender);
  const taglineGap = round(capHeight * 0.36);
  const taglineBaseline = round(baseline + taglineGap + taglineCap);

  const markLight = await markDrawing("tidefern-mark.svg");
  const markDark = await markDrawing("tidefern-mark-dark.svg");
  const ink = await inkBounds(markLight);
  const inkWidth = ink.maxX - ink.minX;
  const inkHeight = ink.maxY - ink.minY;
  const markScale = round(taglineBaseline / inkHeight, 4);
  const markGap = round(capHeight * 0.5);
  const markTranslate = { x: round(-ink.minX * markScale), y: round(-ink.minY * markScale) };
  const textX = round(inkWidth * markScale + markGap - word.ink.minX);
  const width = Math.ceil(textX + word.ink.maxX);
  const height = Math.ceil(Math.max(taglineBaseline, baseline + word.ink.maxY));

  const lockup = (theme) => {
    const dark = theme === "dark";
    const body = [
      `  <g transform="translate(${markTranslate.x} ${markTranslate.y}) scale(${markScale})">`,
      `    ${dark ? markDark : markLight}`,
      "  </g>",
      `  <path fill="${dark ? palette.mist : palette.fern}" transform="translate(${textX} ${baseline})" d="${word.d}"/>`,
      `  <path fill="${dark ? palette.seaGlassLight : palette.seaGlassInk}" transform="translate(${round(textX - tagline.ink.minX + word.ink.minX)} ${taglineBaseline})" d="${tagline.d}"/>`,
    ].join("\n");
    return svgDocument({
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      title: "Tidefern. Life flows together.",
      body,
    });
  };

  const geometry = {
    viewBox: { width, height },
    wordmark: {
      family: "Newsreader",
      opticalSize: 72,
      weight: 500,
      fontSize: wordmarkSize,
      capHeight,
      x: textX,
      baseline,
    },
    tagline: {
      family: "Figtree",
      weight: 500,
      fontSize: taglineSize,
      capHeight: taglineCap,
      tracking: taglineTracking,
      baseline: taglineBaseline,
    },
    mark: { scale: markScale, width: round(inkWidth * markScale), gap: markGap },
    // The clear space rule (architecture 13.8): the wordmark cap height on every side.
    clearSpace: capHeight,
    minimumWidth: 120,
  };

  return {
    light: lockup("light"),
    dark: lockup("dark"),
    geometry,
    word,
    markInk: ink,
    markLight,
    markDark,
  };
}

/** A square icon drawing: an optional background, then the mark fitted by its ink. */
function squareIcon({ size, background, radius, drawing, ink, scale }) {
  const inkWidth = ink.maxX - ink.minX;
  const inkHeight = ink.maxY - ink.minY;
  const tx = round(size / 2 - (ink.minX + inkWidth / 2) * scale);
  const ty = round(size / 2 - (ink.minY + inkHeight / 2) * scale);
  const rect = background
    ? `  <rect width="${size}" height="${size}" rx="${radius ?? 0}" fill="${background}"/>\n`
    : "";
  return {
    background: rect,
    foreground: `  <g transform="translate(${tx} ${ty}) scale(${round(scale, 4)})">\n    ${drawing}\n  </g>\n`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n${rect}  <g transform="translate(${tx} ${ty}) scale(${round(scale, 4)})">\n    ${drawing}\n  </g>\n</svg>\n`,
  };
}

async function png(svg) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toBuffer();
}

async function write(url, data) {
  await mkdir(new URL("./", url), { recursive: true });
  await writeFile(url, data);
  console.log(`wrote ${fileURLToPath(url).replace(fileURLToPath(root), "")}`);
}

async function main() {
  const built = await buildLockups();
  await write(new URL("tidefern-lockup.svg", brandDir), built.light);
  await write(new URL("tidefern-lockup-dark.svg", brandDir), built.dark);
  await write(new URL("lockup.json", brandDir), `${JSON.stringify(built.geometry, null, 2)}\n`);

  // Favicon: the small variant at 16 and 32 (architecture 13.2: below 48 px),
  // the full mark at 48. Transparent, so it reads on any tab strip.
  const small = await markDrawing("tidefern-mark-small.svg");
  const smallInk = await inkBounds(small);
  const faviconLayers = await Promise.all(
    [
      [16, small, smallInk],
      [32, small, smallInk],
      [48, built.markLight, built.markInk],
    ].map(([size, drawing, ink]) => {
      const longest = Math.max(ink.maxX - ink.minX, ink.maxY - ink.minY);
      return png(squareIcon({ size, drawing, ink, scale: size / longest }).svg);
    }),
  );
  await write(new URL("favicon.ico", appDir), await pngToIco(faviconLayers));

  // Manifest icons with purpose any: the app icon exactly as drawn (Mist
  // rounded square), so they match icon.svg.
  const appIcon = await readFile(new URL("tidefern-icon.svg", brandDir), "utf8");
  for (const size of [192, 512]) {
    const sized = appIcon.replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
    await write(new URL(`icon-${size}.png`, iconsDir), await png(sized));
  }

  // Maskable: an opaque Mist square with the ink inside the central 80
  // percent circle, then 10 percent more padding. The ink box's diagonal is
  // what has to fit the circle, so that is what the scale is taken from.
  const maskableSize = 512;
  const inkWidth = built.markInk.maxX - built.markInk.minX;
  const inkHeight = built.markInk.maxY - built.markInk.minY;
  const diagonal = Math.hypot(inkWidth, inkHeight);
  const maskableScale = (maskableSize * 0.8 * 0.9) / diagonal;
  const maskable = squareIcon({
    size: maskableSize,
    background: palette.mist,
    drawing: built.markLight,
    ink: built.markInk,
    scale: maskableScale,
  });
  await write(new URL("icon-512-maskable.png", iconsDir), await png(maskable.svg));

  // Apple touch icon: opaque Mist, square, no rounding of its own; the ink's
  // longer side at 72 percent of the box so iOS's corner mask clears it.
  const appleSize = 180;
  const apple = squareIcon({
    size: appleSize,
    background: palette.mist,
    drawing: built.markLight,
    ink: built.markInk,
    scale: (appleSize * 0.72) / Math.max(inkWidth, inkHeight),
  });
  await write(new URL("apple-icon.png", appDir), await png(apple.svg));

  // 1024 px master as separable layers for a store listing (Icon Composer
  // assembles the background and the foreground itself).
  const masterSize = 1024;
  const master = squareIcon({
    size: masterSize,
    background: palette.mist,
    drawing: built.markLight,
    ink: built.markInk,
    scale: (masterSize * 0.72) / Math.max(inkWidth, inkHeight),
  });
  const layer = (body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${masterSize} ${masterSize}" width="${masterSize}" height="${masterSize}">\n${body}</svg>\n`;
  await write(
    new URL("tidefern-icon-1024-background.png", masterDir),
    await png(layer(master.background)),
  );
  await write(
    new URL("tidefern-icon-1024-foreground.png", masterDir),
    await png(layer(master.foreground)),
  );
  await write(new URL("tidefern-icon-1024.png", masterDir), await png(master.svg));
  await write(
    new URL("tidefern-icon-1024.svg", masterDir),
    layer(
      `  <g id="background">\n  ${master.background}  </g>\n  <g id="foreground">\n  ${master.foreground}  </g>\n`,
    ),
  );

  // Social card: the light lockup on Mist inside the 1000 by 500 safe area.
  const card = { width: 1200, height: 630, safeWidth: 1000, safeHeight: 500 };
  const { width, height } = built.geometry.viewBox;
  const cardScale = Math.min(card.safeWidth / width, card.safeHeight / height);
  const lockupBody = built.light.replace(/^[\s\S]*?<\/title>\n/, "").replace(/<\/svg>\s*$/, "");
  const cardSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${card.width} ${card.height}" width="${card.width}" height="${card.height}">`,
    `  <rect width="${card.width}" height="${card.height}" fill="${palette.mist}"/>`,
    `  <g transform="translate(${round((card.width - width * cardScale) / 2)} ${round((card.height - height * cardScale) / 2)}) scale(${round(cardScale, 4)})">`,
    lockupBody,
    "  </g>",
    "</svg>",
  ].join("\n");
  await write(new URL("opengraph-image.png", appDir), await png(cardSvg));
  // No trailing newline: Next copies the file verbatim into og:image:alt.
  await write(new URL("opengraph-image.alt.txt", appDir), "Tidefern. Life flows together.");

  if (previewDir) {
    const dir = new URL(`${previewDir.replace(/\/?$/, "/")}`, `file://${process.cwd()}/`);
    const wordOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(built.word.ink.minX - 10)} ${round(built.word.ink.minY - 10)} ${round(built.word.ink.maxX - built.word.ink.minX + 20)} ${round(built.word.ink.maxY - built.word.ink.minY + 20)}" width="2000"><path fill="${palette.fern}" d="${built.word.d}"/></svg>`;
    await write(new URL("preview-wordmark.png", dir), await png(wordOnly));
    const circle = maskable.svg.replace(
      "</svg>",
      `<circle cx="256" cy="256" r="${maskableSize * 0.4}" fill="none" stroke="#C98B74" stroke-width="2"/></svg>`,
    );
    await write(new URL("preview-maskable.png", dir), await png(circle));
    const lockupLight = built.light
      .replace(/width="\d+"/, 'width="1600"')
      .replace(/ height="\d+"/, "");
    await write(new URL("preview-lockup-light.png", dir), await png(lockupLight));
    const darkBody = built.dark.replace(/width="\d+"/, 'width="1600"').replace(/ height="\d+"/, "");
    const darkOnPage = darkBody.replace(
      /<\/title>\n/,
      `</title>\n  <rect width="${width}" height="${height}" fill="#0F1A17"/>\n`,
    );
    await write(new URL("preview-lockup-dark.png", dir), await png(darkOnPage));
    for (const [index, size] of [16, 32, 48].entries()) {
      const scaled = await sharp(faviconLayers[index])
        .resize(size * 8, size * 8, { kernel: "nearest" })
        .png()
        .toBuffer();
      await write(new URL(`preview-favicon-${size}.png`, dir), scaled);
    }
  }
  console.log(`lockup ${width} by ${height}, cap height ${built.geometry.wordmark.capHeight}`);
}

await main();
