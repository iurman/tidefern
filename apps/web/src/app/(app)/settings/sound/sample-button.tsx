"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineFeedback, type FeedbackTone } from "@/components/ui/inline-feedback";
import { playAfterUnlock, type PlayResult } from "@/lib/sound";
import { describePlayResult, soundCopy as copy } from "./copy";
import styles from "./sound.module.css";

/**
 * "Play a sample": the success cue at the current level, with the result in
 * words beside the button, because sound never carries meaning alone. The
 * button owns its cue (`data-cue`), so the provider's press cue does not
 * sound on top of the sample.
 */
export function SampleButton() {
  const [result, setResult] = useState<PlayResult | null>(null);
  async function sample() {
    setResult(await playAfterUnlock("success"));
  }
  const tone: FeedbackTone = result === "played" ? "success" : "info";
  return (
    <div className={styles.sample}>
      <Button variant="secondary" onClick={sample} data-cue="success">
        {copy.sample.button}
      </Button>
      {result ? (
        <InlineFeedback tone={tone} className={styles.sampleResult}>
          {describePlayResult(result)}
        </InlineFeedback>
      ) : null}
    </div>
  );
}
