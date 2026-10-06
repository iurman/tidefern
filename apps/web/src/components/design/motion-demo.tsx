"use client";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { durations, easings } from "@/lib/motion-tokens";
import styles from "./motion-demo.module.css";

export type DemoMove = "fade" | "rise" | "settle";

export interface MotionDemoProps {
  id: string;
  title: string;
  duration: keyof typeof durations;
  easing: keyof typeof easings;
  /** The move the product makes with this pair: the month grid's cross-fade, the sheet's rise, the ring's settle. */
  move: DemoMove;
  /** Where the product uses it, in one sentence. */
  note: string;
}

/**
 * One replayable timing demo. The duration and the easing are read from
 * `motion-tokens.ts` on every render, so a replay runs whatever the module
 * says at that moment, and the caption prints the same values. The subject
 * remounts on replay, which restarts a CSS animation without touching the
 * Web Animations API. Under reduced motion the module stylesheet sets the
 * duration to zero: the subject arrives at once, complete, and Replay still
 * works.
 */
export function MotionDemo({ id, title, duration, easing, move, note }: MotionDemoProps) {
  const [run, setRun] = useState(1);
  const milliseconds = durations[duration];
  const curve = easings[easing];
  const style = {
    "--demo-duration": `${milliseconds}ms`,
    "--demo-ease": curve,
  } as CSSProperties;
  return (
    <figure className={styles.demo} id={id} data-demo={id}>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <Button variant="secondary" onClick={() => setRun((count) => count + 1)}>
          Replay
        </Button>
      </div>
      <div className={styles.stage} aria-hidden="true">
        <div
          key={run}
          className={`${styles.subject} ${styles[move]}`}
          style={style}
          data-subject
          data-run={run}
        >
          {move === "settle" ? (
            <svg viewBox="0 0 96 96" width="96" height="96" focusable="false">
              <circle cx="48" cy="48" r="38" className={styles.ringTrack} />
              <path d="M48 10 a38 38 0 1 1 -26.9 11.1" className={styles.ringArc} />
            </svg>
          ) : move === "rise" ? (
            <div className={styles.sheet}>
              <span className={styles.sheetGrip} />
            </div>
          ) : (
            <div className={styles.grid}>
              {Array.from({ length: 7 }, (_, index) => (
                <span key={index} className={styles.cell} />
              ))}
            </div>
          )}
        </div>
      </div>
      <figcaption className={styles.caption}>
        <code>--duration-{duration}</code> <span className="tabular">{milliseconds} ms</span> with{" "}
        <code>--ease-{easing}</code> <code>{curve}</code>. {note}
      </figcaption>
    </figure>
  );
}

const lanes = [
  { key: "interface", label: "Interface" },
  { key: "settle", label: "Settle" },
  { key: "disclosure", label: "Disclosure" },
  { key: "tide", label: "Tide" },
] as const;

/**
 * The four easings run the same distance over the settle duration, side
 * by side, so the shapes of the curves can be compared as movement. Replay
 * restarts all four together.
 */
export function EasingRace() {
  const [run, setRun] = useState(1);
  const milliseconds = durations.settle;
  return (
    <figure className={styles.demo} id="easing-race" data-demo="easing-race">
      <div className={styles.head}>
        <h3 className={styles.title}>The four curves over one settle</h3>
        <Button variant="secondary" onClick={() => setRun((count) => count + 1)}>
          Replay
        </Button>
      </div>
      <ol className={styles.race} aria-hidden="true">
        {lanes.map((lane) => (
          <li key={lane.key} className={styles.lane}>
            <span className={styles.laneLabel}>{lane.label}</span>
            <span className={styles.track}>
              <span
                key={run}
                className={styles.runner}
                data-run={run}
                data-lane={lane.key}
                style={
                  {
                    "--demo-duration": `${milliseconds}ms`,
                    "--demo-ease": easings[lane.key],
                  } as CSSProperties
                }
              />
            </span>
          </li>
        ))}
      </ol>
      <figcaption className={styles.caption}>
        Every lane runs <span className="tabular">{milliseconds} ms</span> (
        <code>--duration-settle</code>). Settle and interface both cover most of the distance in the
        first fifth; settle keeps the longer tail. Disclosure is the browser&apos;s ease keyword.
        The tide is symmetric: slow at both ends, quickest in the middle.
      </figcaption>
    </figure>
  );
}
