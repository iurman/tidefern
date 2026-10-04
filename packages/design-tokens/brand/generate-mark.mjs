// Tidefern mark generator: a fern frond unrolling from a sea glass wave.
// Geometry is computed so leaflets follow the stem tangent and shrink toward the crozier.
import { writeFileSync } from "node:fs";

const FERN = "#2F4F46",
  SEA = "#6EA7A0",
  SAGE = "#B7C9B1",
  MIST = "#F7F5EF",
  LEAF_DARK = "#4E7A6B";
const f = (n) => Math.round(n * 10) / 10;

// Stem: cubic bezier from the wave up and leftward, then a crozier spiral.
const P0 = [292, 372],
  P1 = [330, 296],
  P2 = [318, 196],
  P3 = [256, 148];
function bez(t) {
  const u = 1 - t;
  return [
    u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
    u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
  ];
}
function bezTangent(t) {
  const u = 1 - t;
  const x = 3 * u * u * (P1[0] - P0[0]) + 6 * u * t * (P2[0] - P1[0]) + 3 * t * t * (P3[0] - P2[0]);
  const y = 3 * u * u * (P1[1] - P0[1]) + 6 * u * t * (P2[1] - P1[1]) + 3 * t * t * (P3[1] - P2[1]);
  const l = Math.hypot(x, y);
  return [x / l, y / l];
}
// Crozier: spiral starting at P3 heading along the end tangent, curling clockwise inward.
function spiralPoints() {
  const [tx, ty] = bezTangent(1);
  let ang = Math.atan2(ty, tx); // heading
  let r0 = 48; // initial radius of curvature
  const pts = [];
  let [x, y] = P3;
  const steps = 72,
    totalTurn = Math.PI * 2.35;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const r = r0 * Math.pow(0.16, s); // radius shrinks toward the center
    const dAng = totalTurn / steps;
    // move along the arc: step length = r * dAng
    const step = r * dAng;
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    ang += dAng; // turn clockwise (screen coords: increasing angle turns right/down)
    pts.push([x, y]);
  }
  return pts;
}
function polyToPath(pts) {
  return pts.map(([x, y], i) => `${i ? "L" : "L"}${f(x)} ${f(y)}`).join(" ");
}

const spiral = spiralPoints();
const stemD = `M${P0[0]} ${P0[1]} C${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]} ${P3[0]} ${P3[1]} ${polyToPath(spiral)}`;

// Leaflet: a pointed oval of length L and width W drawn along +x from the stem point.
function leaf(x, y, angleDeg, L, W) {
  const d = `M0 0 C${f(L * 0.12)} ${f(-W * 0.62)} ${f(L * 0.78)} ${f(-W * 0.66)} ${f(L)} 0 C${f(L * 0.78)} ${f(W * 0.66)} ${f(L * 0.12)} ${f(W * 0.62)} 0 0 Z`;
  return { x: f(x), y: f(y), a: f(angleDeg), d };
}
// Place leaflets alternating sides along the bezier part of the stem.
const leaves = [];
const ts = [0.08, 0.2, 0.33, 0.46, 0.59, 0.72, 0.84, 0.94];
ts.forEach((t, i) => {
  const [x, y] = bez(t);
  const [tx, ty] = bezTangent(t);
  const side = i % 2 === 0 ? 1 : -1; // 1 = right of travel (outer, right side of frond), -1 = left
  const nx = -ty * side,
    ny = tx * side; // normal
  const grow = 1 - t * 0.72; // shrink toward tip
  const inner = side === -1; // inside of the curl crowds, so inner leaflets are shorter and lean more
  const L = (inner ? 88 : 104) * grow,
    W = (inner ? 42 : 50) * grow;
  const lean = inner ? 0.62 : 0.46;
  const dx = nx * (1 - lean) + tx * lean,
    dy = ny * (1 - lean) + ty * lean;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  // offset so the leaf base sits on the stem edge
  leaves.push({ ...leaf(x + nx * 4, y + ny * 4, ang, L, W), side });
});
// Two small leaflets on the crozier
[
  [0.16, 1],
  [0.44, -1],
].forEach(([s, side]) => {
  const i = Math.round(s * (spiral.length - 1));
  const [x, y] = spiral[i],
    [x2, y2] = spiral[Math.min(i + 1, spiral.length - 1)];
  const tx = x2 - x,
    ty = y2 - y,
    l = Math.hypot(tx, ty);
  const nx = (-ty / l) * side,
    ny = (tx / l) * side;
  const dx = nx * 0.5 + (tx / l) * 0.5,
    dy = ny * 0.5 + (ty / l) * 0.5;
  leaves.push({
    ...leaf(x + nx * 3, y + ny * 3, (Math.atan2(dy, dx) * 180) / Math.PI, 24, 12),
    side,
  });
});

// Wave: a soft lens rising to a crest left of center, dipping to meet the stem, then a short rise.
const waveD =
  "M52 376 C92 292 198 274 268 316 C300 336 326 352 362 350 C384 348 402 352 414 372 C404 426 336 468 238 468 C142 468 68 434 52 376 Z";
const highlightD = "M84 384 C124 322 206 308 266 346 C290 362 310 372 334 372";

function leavesSvg(fillLeft, fillRight) {
  return leaves
    .map(
      (l) =>
        `<path fill="${l.side === 1 ? fillRight : fillLeft}" transform="translate(${l.x} ${l.y}) rotate(${l.a})" d="${l.d}"/>`,
    )
    .join("\n    ");
}
function mark({ stem, leafLeft, leafRight, wave, highlight, highlightOpacity = 1, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">${title}</title>
  <path fill="${wave}" d="${waveD}"/>
  <path fill="none" stroke="${highlight}" stroke-opacity="${highlightOpacity}" stroke-width="13" stroke-linecap="round" d="${highlightD}"/>
  <g>
    ${leavesSvg(leafLeft, leafRight)}
  </g>
  <path fill="none" stroke="${stem}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" d="${stemD}"/>
</svg>
`;
}
const out = {
  "tidefern-mark.svg": mark({
    title: "Tidefern mark",
    stem: FERN,
    leafLeft: SAGE,
    leafRight: LEAF_DARK,
    wave: SEA,
    highlight: MIST,
  }),
  "tidefern-mark-dark.svg": mark({
    title: "Tidefern mark for dark surfaces",
    stem: "#DCE6DA",
    leafLeft: "#B7C9B1",
    leafRight: "#8FC1B9",
    wave: "#6EA7A0",
    highlight: MIST,
    highlightOpacity: 0.85,
  }),
  "tidefern-mark-mono.svg": mark({
    title: "Tidefern mark, one color",
    stem: FERN,
    leafLeft: FERN,
    leafRight: FERN,
    wave: FERN,
    highlight: MIST,
  }),
};
out["tidefern-icon.svg"] =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">Tidefern app icon</title>
  <rect width="512" height="512" rx="112" fill="${MIST}"/>
  <g transform="translate(36 30) scale(0.86)">
${out["tidefern-mark.svg"]
  .split("\n")
  .slice(2, -2)
  .map((l) => "  " + l)
  .join("\n")}
  </g>
</svg>
`;
// Small: thicker stem, four leaflets, no highlight detail beyond one stroke.
const smallLeaves = leaves
  .filter((_, i) => i < 6 && i % 1 === 0)
  .filter((_, i) => [0, 1, 2, 3].includes(i));
out["tidefern-mark-small.svg"] =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">Tidefern mark, small sizes</title>
  <path fill="${SEA}" d="${waveD}"/>
  <path fill="none" stroke="${MIST}" stroke-width="22" stroke-linecap="round" d="${highlightD}"/>
  ${smallLeaves.map((l) => `<path fill="${l.side === 1 ? LEAF_DARK : SAGE}" transform="translate(${l.x} ${l.y}) rotate(${l.a}) scale(1.25)" d="${l.d}"/>`).join("\n  ")}
  <path fill="none" stroke="${FERN}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" d="${stemD}"/>
</svg>
`;
for (const [name, svg] of Object.entries(out)) writeFileSync(new URL(name, import.meta.url), svg);
console.log("wrote", Object.keys(out).join(", "));
