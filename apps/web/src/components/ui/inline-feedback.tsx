"use client";
import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { play } from "@/lib/sound";
import styles from "./inline-feedback.module.css";

export type FeedbackTone = "success" | "error" | "info";

/** The icon each tone pairs with its text; the toast uses the same three. */
export const feedbackIcons: Record<FeedbackTone, IconName> = {
  success: "check",
  error: "close",
  info: "today-marker",
};

/** The sr-only prefix that names the tone before the sentence is read. */
export const feedbackNames: Record<FeedbackTone, string> = {
  success: "Success",
  error: "Error",
  info: "Note",
};

export interface InlineFeedbackProps {
  tone: FeedbackTone;
  /** The visible sentence: short for success, the next step for an error. */
  children: ReactNode;
  /**
   * Plays the success or error cue once when the message mounts. The cue
   * never plays without the text beside it, which is why it lives here and
   * not in the caller.
   */
  cue?: boolean;
  className?: string;
}

/**
 * Feedback that stays beside the thing it is about: a saved day, a failed
 * request, a note under a field. One icon, one sentence, a polite live region
 * so assistive technology hears it without being interrupted.
 */
export function InlineFeedback({ tone, children, cue = false, className }: InlineFeedbackProps) {
  useEffect(() => {
    if (cue && tone !== "info") play(tone);
  }, [cue, tone]);
  const classes = [styles.feedback, styles[tone], className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="status" aria-live="polite" data-tone={tone}>
      <Icon name={feedbackIcons[tone]} className={styles.icon} />
      <span className="sr-only">{feedbackNames[tone]}: </span>
      <span className={styles.text}>{children}</span>
    </div>
  );
}
