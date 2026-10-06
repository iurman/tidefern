"use client";
import { useEffect, useState } from "react";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { prefersReducedMotion } from "@/lib/motion-tokens";

export type MotionPreference = "unknown" | "reduce" | "no-preference";

/**
 * The visitor's own reduced-motion preference, read through the same
 * function the app uses and kept live through the media query's change
 * event, with what the preference changes on this page. Rendered as the
 * shared inline feedback so the sentence sits in a polite live region.
 */
export function ReducedMotionStatus() {
  const [preference, setPreference] = useState<MotionPreference>("unknown");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPreference(prefersReducedMotion() ? "reduce" : "no-preference");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return (
    <InlineFeedback tone="info">
      <span data-reduced-motion={preference}>
        {preference === "unknown"
          ? "Reading your motion preference."
          : preference === "reduce"
            ? "Your browser reports prefers-reduced-motion: reduce. Every demo on this page arrives instantly and complete, nothing is hidden, and Replay still re-reads the constants."
            : "Your browser reports prefers-reduced-motion: no-preference. The demos animate at the durations printed beside them."}
      </span>
    </InlineFeedback>
  );
}
