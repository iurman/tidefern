/**
 * Geometry for the cycle ring (DESIGN.md 6.1) and the frond curl that ends
 * its progress arc and the growth chart's measurement line (architecture
 * 13.6, signature move 1). Angles are fractions of a turn, 0 at twelve
 * o'clock and clockwise positive, so a day's position never depends on the
 * SVG's own angle convention.
 */

export interface Point {
  x: number;
  y: number;
}

const TAU = 2 * Math.PI;

/** Radians for a fraction of a turn, starting at the top and running clockwise. */
export function turnToRadians(turn: number): number {
  return turn * TAU - Math.PI / 2;
}

export function polarPoint(center: Point, radius: number, turn: number): Point {
  const angle = turnToRadians(turn);
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function fixed(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * An SVG path for the clockwise arc from `startTurn` to `endTurn`. A span of a
 * whole turn or more is drawn as two half circles, because one arc command
 * cannot close on itself.
 */
export function arcPath(center: Point, radius: number, startTurn: number, endTurn: number): string {
  const span = Math.max(0, endTurn - startTurn);
  if (span === 0) return "";
  if (span >= 1) {
    const top = polarPoint(center, radius, startTurn);
    const bottom = polarPoint(center, radius, startTurn + 0.5);
    return [
      `M ${fixed(top.x)} ${fixed(top.y)}`,
      `A ${fixed(radius)} ${fixed(radius)} 0 0 1 ${fixed(bottom.x)} ${fixed(bottom.y)}`,
      `A ${fixed(radius)} ${fixed(radius)} 0 0 1 ${fixed(top.x)} ${fixed(top.y)}`,
    ].join(" ");
  }
  const start = polarPoint(center, radius, startTurn);
  const end = polarPoint(center, radius, endTurn);
  const largeArc = span > 0.5 ? 1 : 0;
  return `M ${fixed(start.x)} ${fixed(start.y)} A ${fixed(radius)} ${fixed(radius)} 0 ${largeArc} 1 ${fixed(end.x)} ${fixed(end.y)}`;
}

/** Keeps a one-based cycle day on the ring: day 0 or a day past the length is drawn at the edge. */
export function clampDay(day: number, length: number): number {
  return Math.min(Math.max(day, 1), Math.max(length, 1));
}

/** The turn at which a one-based day begins. Day 1 begins at the top. */
export function dayStartTurn(day: number, length: number): number {
  return (clampDay(day, length) - 1) / length;
}

/** The turn at which a one-based day ends. */
export function dayEndTurn(day: number, length: number): number {
  return clampDay(day, length) / length;
}

/** The turn at the middle of a day, where a marker for that day sits. */
export function dayMidTurn(day: number, length: number): number {
  return (clampDay(day, length) - 0.5) / length;
}

/**
 * Groups one-based cycle days into runs of consecutive days inside the ring,
 * so logged period days become one solid arc per stretch. Days outside 1 to
 * `length` are dropped, duplicates collapse.
 */
export function consecutiveRuns(days: number[], length: number): Array<[number, number]> {
  const inside = [...new Set(days.filter((day) => day >= 1 && day <= length))].sort(
    (a, b) => a - b,
  );
  const runs: Array<[number, number]> = [];
  for (const day of inside) {
    const last = runs[runs.length - 1];
    if (last && day === last[1] + 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs;
}

/**
 * The frond curl: a spiral of about `size` px that leaves the end of an arc
 * tangentially and turns inward, toward `inward`, over `turns` turns. The path
 * starts exactly at `end`, so a round-capped stroke continues the arc without
 * a seam. `tangent` is the direction the arc was travelling at its end.
 */
export function frondCurlPath(
  end: Point,
  tangent: Point,
  inward: Point,
  size = 16,
  turns = 1.25,
): string {
  const half = size / 2;
  const inwardLength = Math.hypot(inward.x, inward.y) || 1;
  const normal = { x: inward.x / inwardLength, y: inward.y / inwardLength };
  const center = { x: end.x + normal.x * half, y: end.y + normal.y * half };
  const startAngle = Math.atan2(end.y - center.y, end.x - center.x);
  // The spiral's initial tangent is perpendicular to the spoke; pick the
  // rotation whose tangent agrees with the arc's own direction.
  const counterClockwiseTangent = { x: -Math.sin(startAngle), y: Math.cos(startAngle) };
  const direction =
    counterClockwiseTangent.x * tangent.x + counterClockwiseTangent.y * tangent.y >= 0 ? 1 : -1;
  const steps = Math.max(12, Math.round(turns * 32));
  const parts = [`M ${fixed(end.x)} ${fixed(end.y)}`];
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const angle = startAngle + direction * progress * turns * TAU;
    const radius = half * (1 - 0.82 * progress);
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    parts.push(`L ${fixed(x)} ${fixed(y)}`);
  }
  return parts.join(" ");
}

/** The unit tangent of a clockwise circle at a turn, for the frond curl. */
export function clockwiseTangent(turn: number): Point {
  const angle = turnToRadians(turn);
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

/**
 * A finite tide line: one hairline wave across `width` with `crests` crests
 * of `amplitude`, on a baseline at `y`. The same path draws the trimester bar
 * on the week card and nothing else in the group.
 */
export function wavePath(x: number, y: number, width: number, crests: number, amplitude: number) {
  const wavelength = width / crests;
  const quarter = wavelength / 4;
  const parts = [`M ${fixed(x)} ${fixed(y)}`];
  for (let crest = 0; crest < crests; crest += 1) {
    const start = x + crest * wavelength;
    parts.push(
      `Q ${fixed(start + quarter)} ${fixed(y - amplitude)} ${fixed(start + 2 * quarter)} ${fixed(y)}`,
      `Q ${fixed(start + 3 * quarter)} ${fixed(y + amplitude)} ${fixed(start + wavelength)} ${fixed(y)}`,
    );
  }
  return parts.join(" ");
}
