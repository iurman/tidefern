"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { settingsCopy as copy, signInAgainHref } from "./copy";
import styles from "./settings.module.css";

/**
 * Whether the session still counts as freshly signed in, from the
 * milliseconds the server measured at render (`freshForMs`): false at once
 * when none were left, false when the time runs out on the page, and false
 * when the API refused the action for it (`markStale`). Null means the page
 * could not tell, and the API decides on the press.
 */
export function useFreshWindow(freshForMs: number | null): [boolean, () => void] {
  const [fresh, setFresh] = useState(freshForMs === null || freshForMs > 0);
  useEffect(() => {
    if (freshForMs === null || freshForMs <= 0) return;
    const timer = window.setTimeout(() => setFresh(false), freshForMs);
    return () => window.clearTimeout(timer);
  }, [freshForMs]);
  const markStale = useCallback(() => setFresh(false), []);
  return [fresh, markStale];
}

/**
 * The step before an action that needs a sign-in from the last ten minutes
 * (architecture 6.1): the reason, and the way to sign in that returns here.
 * Shown as a note before the press, and as a failure, with its cue, when the
 * API refused a press.
 */
export function FreshAuthNotice({
  text,
  returnTo,
  refused,
}: {
  text: string;
  returnTo: string;
  refused: boolean;
}) {
  return (
    <div className={styles.feedback}>
      <InlineFeedback tone={refused ? "error" : "info"} cue={refused}>
        {text}
      </InlineFeedback>
      <Button href={signInAgainHref(returnTo)} variant="secondary">
        {copy.freshAuth.action}
      </Button>
    </div>
  );
}
