"use client";
import { useEffect, useState } from "react";
import { describeQuietHours } from "@/lib/quiet-hours";
import { audioState, isQuietNow, onAudioState, quietHours, soundLevel } from "@/lib/sound";
import styles from "./sound-chapter.module.css";

type State = AudioContextState | "none" | "reading";

const meaning: Record<State, string> = {
  reading: "Reading the state.",
  none: "No audio context exists yet. Nothing has been created, so nothing can sound.",
  suspended:
    "The context exists but the browser has not let it run; the next activation-granting input resumes it.",
  running: "The context is running. Cues can sound.",
  interrupted:
    "The platform paused the context (iOS, after backgrounding); the next input resumes it.",
  closed: "The context was closed.",
};

function readActivation(): boolean | null {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return activation ? activation.hasBeenActive : null;
}

/**
 * The unlock rule, live: the shared context's state as the library reports
 * it, the page's sticky activation, the level on the root, and the quiet
 * hours on this device. Nothing here creates a context; it only listens.
 */
export function SoundContextState() {
  const [state, setState] = useState<State>("reading");
  const [activated, setActivated] = useState<boolean | null>(null);
  const [level, setLevel] = useState<string>("reading");
  const [quiet, setQuiet] = useState<{ sentence: string; now: boolean } | null>(null);

  useEffect(() => {
    const refresh = () => {
      setState(audioState());
      setActivated(readActivation());
      setLevel(soundLevel());
      setQuiet({ sentence: describeQuietHours(quietHours()), now: isQuietNow() });
    };
    refresh();
    const unsubscribe = onAudioState(refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-sound"],
    });
    document.addEventListener("click", refresh, true);
    return () => {
      unsubscribe();
      observer.disconnect();
      document.removeEventListener("click", refresh, true);
    };
  }, []);

  return (
    <dl className={styles.state}>
      <div>
        <dt>Audio context</dt>
        <dd>
          <code data-audio-state={state}>{state}</code> {meaning[state]}
        </dd>
      </div>
      <div>
        <dt>Sticky activation</dt>
        <dd>
          {activated === null
            ? "This browser does not report user activation."
            : activated
              ? "Yes: the page has had an activation-granting input, so a client navigation can start the context on mount."
              : "Not yet: no activation-granting input so far, so the first hover stays silent by design."}
        </dd>
      </div>
      <div>
        <dt>Level on the root</dt>
        <dd>
          <code>data-sound=&quot;{level}&quot;</code>
        </dd>
      </div>
      <div>
        <dt>Quiet hours on this device</dt>
        <dd>
          {quiet
            ? `${quiet.sentence}.${quiet.now ? " Silent right now." : ""}`
            : "Reading the quiet hours."}
        </dd>
      </div>
    </dl>
  );
}
