"use client";
import { useState } from "react";
import { TideLine } from "@/components/public/tide-line";
import { Button } from "@/components/ui/button";
import { durations, easings, LONGEST_AUTOMATIC_MOTION_MS } from "@/lib/motion-tokens";
import styles from "./motion-demo.module.css";

/**
 * The real tide line with its one settle. On the marketing page the drift
 * runs once after load; here it waits for the visitor, because a 9 s move
 * that starts by itself would be the one thing on this route longer than
 * the automatic-motion limit. Replay remounts the line, which restarts the
 * single run.
 */
export function TideDemo() {
  const [run, setRun] = useState(0);
  return (
    <figure className={styles.tide} id="tide-demo" data-demo="tide">
      <div className={styles.head}>
        <h3 className={styles.title}>The tide, once</h3>
        <Button variant="secondary" onClick={() => setRun((count) => count + 1)}>
          {run === 0 ? "Run the tide" : "Replay"}
        </Button>
      </div>
      <div className={styles.tideStage} data-run={run}>
        <TideLine key={run} settle={run > 0} />
      </div>
      <figcaption className={styles.caption}>
        <code>--duration-tide</code> <span className="tabular">{durations.tide / 1000} s</span> with{" "}
        <code>--ease-tide</code> <code>{easings.tide}</code>, one iteration, forwards. It is the
        only motion in the product longer than{" "}
        <span className="tabular">{LONGEST_AUTOMATIC_MOTION_MS / 1000} s</span>, it runs by itself
        only on the marketing page, and nothing on any route repeats forever.
      </figcaption>
    </figure>
  );
}
