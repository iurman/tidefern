"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { haptic, hapticsAvailable, hapticSpec, type HapticKind } from "@/lib/sound";
import styles from "./sound-chapter.module.css";

const kinds: readonly { kind: HapticKind; label: string }[] = [
  { kind: "tap", label: "Tap" },
  { kind: "select", label: "Select" },
  { kind: "success", label: "Success" },
  { kind: "error", label: "Error" },
];

/** Vibration support never changes while a page is open. */
function neverChanges(): () => void {
  return () => {};
}

/**
 * The live haptic support note and one button per pattern. `navigator.vibrate`
 * exists in Chromium on Android and nowhere on iOS; the page says which this
 * browser is, and what pressing did, in words.
 */
export function SoundHaptics() {
  // The server cannot know the browser, so it renders the checking sentence and the client reads it once.
  const available = useSyncExternalStore(neverChanges, hapticsAvailable, () => null);
  const [result, setResult] = useState<string>("Nothing tried yet.");

  function tryPattern(kind: HapticKind, label: string) {
    const pattern = hapticSpec(kind).join(", ");
    const fired = haptic(kind);
    setResult(
      fired
        ? `${label}: the browser accepted the pattern ${pattern} ms. A phone that supports it vibrated; a desktop accepts and does nothing.`
        : available
          ? `${label}: the browser refused the pattern ${pattern} ms, which happens outside a trusted tap.`
          : `${label}: this browser has no vibration API, so nothing happened. Nothing in Tidefern depends on it.`,
    );
  }

  return (
    <div className={styles.haptics}>
      <p
        className={styles.hapticsSupport}
        data-haptics={available === null ? "" : String(available)}
      >
        {available === null
          ? "Checking for navigator.vibrate."
          : available
            ? "navigator.vibrate is available in this browser."
            : "navigator.vibrate is not available in this browser (Safari, including every iOS browser, has no web vibration API)."}
      </p>
      <div className={styles.hapticsButtons}>
        {kinds.map(({ kind, label }) => (
          <Button key={kind} variant="secondary" onClick={() => tryPattern(kind, label)}>
            Try {label.toLowerCase()}
          </Button>
        ))}
      </div>
      <p className={styles.cueResult} role="status" aria-live="polite">
        {result}
      </p>
    </div>
  );
}
