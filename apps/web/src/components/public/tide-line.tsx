import styles from "./tide-line.module.css";

/** Builds one row of waves across the viewBox, extended past its right edge so a shift reveals no gap. */
function wavePath(waves: number, length: number, height: number): string {
  const wavelength = length / waves;
  const half = wavelength / 2;
  const mid = height / 2;
  const amplitude = height / 2 - 1;
  let path = `M0 ${mid}`;
  for (let index = 0; index < waves + 2; index += 1) {
    path += `c${half / 2} 0 ${half / 2} ${-amplitude} ${half} ${-amplitude}`;
    path += `s${half / 2} ${amplitude} ${half} ${amplitude}`;
  }
  return path;
}

const LENGTH = 1200;
const HEIGHT = 12;
const WAVES = 14;
const path = wavePath(WAVES, LENGTH, HEIGHT);

export interface TideLineProps {
  /**
   * On the marketing page only: the wave drifts in once over the tide
   * duration and rests, so nothing on the route animates forever
   * (architecture 13.6).
   */
  settle?: boolean;
  className?: string;
}

/**
 * The tide line, signature move 2: one 1 px sea-glass hairline wave, the
 * only decorative rule in the product. It is the section divider here and
 * the today marker elsewhere. Decorative, so hidden from assistive
 * technology.
 */
export function TideLine({ settle = false, className }: TideLineProps) {
  const classes = [styles.tide, className].filter(Boolean).join(" ");
  return (
    <div className={classes} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox={`0 0 ${LENGTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          className={settle ? styles.settling : undefined}
          data-tide-settle={settle ? "once" : undefined}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
