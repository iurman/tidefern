"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { feedbackIcons, feedbackNames, type FeedbackTone } from "./inline-feedback";
import styles from "./toast.module.css";

/** A success toast never leaves on its own before this; the others never leave on their own. */
export const MIN_AUTO_DISMISS_MS = 6000;

export interface ToastProps {
  tone: FeedbackTone;
  /** The visible sentence; success is short, an error names the next step. */
  children: ReactNode;
  /** At most one follow-up, usually an undo, rendered as given. */
  action?: ReactNode;
  /** Called after the person dismisses it or the timer ends; without it the toast hides itself. */
  onDismiss?: () => void;
  /**
   * Success only: the toast leaves on its own after this many milliseconds,
   * never fewer than six seconds, and the clock stops while the pointer is
   * over it or focus is inside it. Errors and notes stay until dismissed.
   */
  autoDismissMs?: number;
  className?: string;
}

/**
 * A message about something that happened away from where the person is
 * looking. It arrives without motion or sound (DESIGN.md section 7), carries
 * one dismiss control, and stacks inside a ToastRegion on the toast tier.
 */
export function Toast({
  tone,
  children,
  action,
  onDismiss,
  autoDismissMs = MIN_AUTO_DISMISS_MS,
  className,
}: ToastProps) {
  const [open, setOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(Math.max(MIN_AUTO_DISMISS_MS, autoDismissMs));
  const startedAt = useRef(0);
  const automatic = tone === "success";

  function dismiss() {
    setOpen(false);
    onDismiss?.();
  }

  useEffect(() => {
    if (!automatic || paused || !open) return;
    startedAt.current = Date.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
    // dismiss is stable for the toast's life; the timer restarts only when the pause changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatic, paused, open]);

  if (!open) return null;

  const classes = [styles.toast, className].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      data-tone={tone}
      data-paused={paused || undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <Icon name={feedbackIcons[tone]} className={styles.icon} />
      <div className={styles.body}>
        <span className="sr-only">{feedbackNames[tone]}: </span>
        <span className={styles.text}>{children}</span>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      <button type="button" className={styles.dismiss} onClick={dismiss}>
        <Icon name="close" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}

export interface ToastItem {
  /**
   * Names the action the toast reports, so a second toast for the same
   * action replaces the first instead of stacking beside it.
   */
  id: string;
  tone: FeedbackTone;
  text: ReactNode;
  action?: ReactNode;
  autoDismissMs?: number;
}

export interface ToastRegionProps {
  toasts: ToastItem[];
  onDismiss?: (id: string) => void;
  /** Fixed to the bottom of the viewport on the toast tier; false keeps it in flow for a reference page. */
  fixed?: boolean;
}

/**
 * The one place toasts live: a named region at `--elevation-z-toast`, above
 * the overlay tier and the tab bar, with safe-area padding on phones.
 */
export function ToastRegion({ toasts, onDismiss, fixed = true }: ToastRegionProps) {
  const seen = new Set<string>();
  const unique = toasts.filter((toast) => {
    if (seen.has(toast.id)) return false;
    seen.add(toast.id);
    return true;
  });
  return (
    <div
      className={styles.region}
      role="region"
      aria-label="Notifications"
      data-fixed={fixed || undefined}
    >
      {unique.map((toast) => (
        <Toast
          key={toast.id}
          tone={toast.tone}
          action={toast.action}
          autoDismissMs={toast.autoDismissMs}
          onDismiss={onDismiss ? () => onDismiss(toast.id) : undefined}
        >
          {toast.text}
        </Toast>
      ))}
    </div>
  );
}
