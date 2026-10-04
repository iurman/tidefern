import { writeFileSync } from "node:fs";
const f = (n) => Math.round(n * 10) / 10;
const SEA = "#6EA7A0",
  MIST = "#F7F5EF",
  FERN = "#2F4F46",
  STEM = "#7FA084",
  LEAF = "#7E9C7A";

// Stem: rises from the wave's dip, curves up and left; then a counterclockwise crozier.
const P0 = [352, 312],
  P1 = [386, 244],
  P2 = [356, 164],
  P3 = [312, 118];
const bez = (t) => {
  const u = 1 - t;
  return [
    u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
    u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
  ];
};
const tan = (t) => {
  const u = 1 - t;
  const x = 3 * u * u * (P1[0] - P0[0]) + 6 * u * t * (P2[0] - P1[0]) + 3 * t * t * (P3[0] - P2[0]);
  const y = 3 * u * u * (P1[1] - P0[1]) + 6 * u * t * (P2[1] - P1[1]) + 3 * t * t * (P3[1] - P2[1]);
  const l = Math.hypot(x, y);
  return [x / l, y / l];
};

function spiral() {
  const [tx, ty] = tan(1);
  let ang = Math.atan2(ty, tx);
  const pts = [];
  let [x, y] = P3;
  const steps = 90,
    turn = Math.PI * 2.5,
    r0 = 74;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps,
      r = r0 * Math.pow(0.12, s),
      d = turn / steps;
    x += Math.cos(ang) * r * d;
    y += Math.sin(ang) * r * d;
    ang -= d; // counterclockwise on screen
    pts.push([x, y, ang]);
  }
  return pts;
}
const sp = spiral();
const seg = (a, b) =>
  sp
    .slice(a, b)
    .map(([x, y]) => `L${f(x)} ${f(y)}`)
    .join(" ");
const stemBez = `M${P0[0]} ${P0[1]} C${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]} ${P3[0]} ${P3[1]}`;
// Tapered stem: four stroke widths over the length.
const stemParts = (color) =>
  [
    [stemBez, 26],
    [`M${P3[0]} ${P3[1]} ${seg(0, 30)}`, 20],
    [`M${f(sp[29][0])} ${f(sp[29][1])} ${seg(30, 60)}`, 14],
    [`M${f(sp[59][0])} ${f(sp[59][1])} ${seg(60, 90)}`, 10],
  ]
    .map(
      ([d, w]) =>
        `<path fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`,
    )
    .join("\n  ");

// Leaflet: pointed oval of length L and width W along +x.
const leafD = (L, W) =>
  `M0 0 C${f(L * 0.2)} ${f(-W * 0.6)} ${f(L * 0.8)} ${f(-W * 0.5)} ${f(L)} 0 C${f(L * 0.8)} ${f(W * 0.5)} ${f(L * 0.2)} ${f(W * 0.6)} 0 0 Z`;
const leaves = [];
// Five feather leaflets on the right of the stem, pointing up and right.
[
  [0.07, 140],
  [0.23, 128],
  [0.39, 112],
  [0.55, 96],
  [0.7, 78],
].forEach(([t, L]) => {
  const [x, y] = bez(t),
    [tx, ty] = tan(t);
  const rx = -ty,
    ry = tx; // right of travel
  const ang = (Math.atan2(ty, tx) * 180) / Math.PI + 46;
  leaves.push({ x: f(x + rx * 8), y: f(y + ry * 8), a: f(ang), d: leafD(L, L * 0.46) });
});
// Halo of small leaflets around the outside of the crozier.
[
  [1, 46],
  [8, 46],
  [15, 44],
  [22, 42],
  [29, 40],
  [36, 36],
  [43, 32],
].forEach(([i, L]) => {
  const [x, y, ang] = sp[i];
  const tx = Math.cos(ang + (Math.PI * 2.45) / 90),
    ty = Math.sin(ang + (Math.PI * 2.45) / 90);
  const ox = -ty,
    oy = tx; // outward (right of travel while turning left)
  const dir = (Math.atan2(oy * 0.8 + ty * 0.2, ox * 0.8 + tx * 0.2) * 180) / Math.PI;
  leaves.push({ x: f(x + ox * 7), y: f(y + oy * 7), a: f(dir), d: leafD(L, L * 0.5) });
});
const leavesSvg = (fill) =>
  leaves
    .map(
      (l) =>
        `<path fill="${fill}" transform="translate(${l.x} ${l.y}) rotate(${l.a})" d="${l.d}"/>`,
    )
    .join("\n  ");

// Wave: rounded body on the left, a pronounced crest, a steep dip under the frond, a tail tapering to a point.
// The top edge is three cubic segments; the highlight is that edge offset inward so it hugs the crest all the way down the tail.
const top = [
  [
    [36, 392],
    [40, 292],
    [96, 236],
    [150, 230],
  ],
  [
    [150, 230],
    [198, 226],
    [252, 292],
    [346, 314],
  ],
  [
    [346, 314],
    [406, 326],
    [448, 382],
    [488, 444],
  ],
];
const bottom = "C452 470 356 482 236 476 C128 470 44 442 36 392 Z";
const waveD = `M36 392 ${top.map((c) => `C${c[1][0]} ${c[1][1]} ${c[2][0]} ${c[2][1]} ${c[3][0]} ${c[3][1]}`).join(" ")} ${bottom}`;
function cubicAt(c, t) {
  const u = 1 - t;
  return [
    u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0],
    u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1],
  ];
}
function cubicTan(c, t) {
  const u = 1 - t;
  const x =
    3 * u * u * (c[1][0] - c[0][0]) +
    6 * u * t * (c[2][0] - c[1][0]) +
    3 * t * t * (c[3][0] - c[2][0]);
  const y =
    3 * u * u * (c[1][1] - c[0][1]) +
    6 * u * t * (c[2][1] - c[1][1]) +
    3 * t * t * (c[3][1] - c[2][1]);
  const l = Math.hypot(x, y);
  return [x / l, y / l];
}
const hiPts = [];
top.forEach((c, i) => {
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    if (i > 0 && k === 0) continue;
    const [x, y] = cubicAt(c, t);
    const [tx, ty] = cubicTan(c, t);
    hiPts.push([x - -ty * 0 + ty * 0 + -ty * -1 * 0, y, tx, ty]);
  }
});
// offset inward (to the right of travel, which is below the top edge here) by 26 px
const OFF = 30;
const offs = hiPts.map(([x, y, tx, ty]) => [x + -ty * OFF, y + tx * OFF]);
const usable = offs.slice(2, offs.length - 5);
const highlightD =
  `M${f(usable[0][0])} ${f(usable[0][1])} ` +
  usable
    .slice(1)
    .map(([x, y]) => `L${f(x)} ${f(y)}`)
    .join(" ");

const svg = (
  title,
  { stem, leaf, wave, hi, hiOpacity = 1 },
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">${title}</title>
  <path fill="${wave}" d="${waveD}"/>
  <path fill="none" stroke="${hi}" stroke-opacity="${hiOpacity}" stroke-width="20" stroke-linecap="round" d="${highlightD}"/>
  ${leavesSvg(leaf)}
  ${stemParts(stem)}
</svg>
`;
const out = {
  "tidefern-mark.svg": svg("Tidefern mark", { stem: STEM, leaf: LEAF, wave: SEA, hi: MIST }),
  "tidefern-mark-dark.svg": svg("Tidefern mark for dark surfaces", {
    stem: "#A9C4A6",
    leaf: "#A3BF9E",
    wave: "#6EA7A0",
    hi: MIST,
    hiOpacity: 0.85,
  }),
  "tidefern-mark-mono.svg": svg("Tidefern mark, one color", {
    stem: FERN,
    leaf: FERN,
    wave: FERN,
    hi: MIST,
  }),
};
out["tidefern-icon.svg"] =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">Tidefern app icon</title>
  <rect width="512" height="512" rx="112" fill="${MIST}"/>
  <g transform="translate(34 40) scale(0.86)">
${out["tidefern-mark.svg"]
  .split("\n")
  .slice(2, -2)
  .map((l) => "  " + l)
  .join("\n")}
  </g>
</svg>
`;
const smallLeaves = leaves.slice(0, 3).concat(leaves.slice(5, 8));
out["tidefern-mark-small.svg"] =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-labelledby="title">
  <title id="title">Tidefern mark, small sizes</title>
  <path fill="${SEA}" d="${waveD}"/>
  <path fill="none" stroke="${MIST}" stroke-width="20" stroke-linecap="round" d="${highlightD}"/>
  ${smallLeaves.map((l) => `<path fill="${LEAF}" transform="translate(${l.x} ${l.y}) rotate(${l.a}) scale(1.15)" d="${l.d}"/>`).join("\n  ")}
  <path fill="none" stroke="${STEM}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" d="${stemBez} ${seg(0, 50)}"/>
</svg>
`;
for (const [n, s] of Object.entries(out)) writeFileSync(new URL(n, import.meta.url), s);
console.log("wrote");
