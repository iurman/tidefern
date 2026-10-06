"use client";
import { useState } from "react";
import { describePlayResult } from "@/app/settings/sound/copy";
import { Button } from "@/components/ui/button";
import { playAfterUnlock, type Cue, type PlayResult } from "@/lib/sound";
import styles from "./sound-chapter.module.css";

/**
 * One cue, playable from a real button, with the result printed beside it
 * so the page says what happened whether or not the visitor heard it. The
 * button owns its cue (`data-cue`), which keeps the provider's press cue
 * from sounding on top of the one being demonstrated.
 */
export function SoundCueButton({ cue, label }: { cue: Cue; label: string }) {
  const [result, setResult] = useState<PlayResult | null>(null);
  const name = label.toLowerCase();
  async function demo() {
    setResult(await playAfterUnlock(cue));
  }
  return (
    <div className={styles.cueAction}>
      <Button variant="secondary" onClick={demo} data-cue={cue}>
        Play {name}
      </Button>
      <p className={styles.cueResult} role="status" aria-live="polite">
        {result ? describePlayResult(result, `${name} cue`) : "Not played yet."}
      </p>
    </div>
  );
}
