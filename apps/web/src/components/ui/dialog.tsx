"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./dialog.module.css";

export interface DialogProps {
  open: boolean;
  /** Called when the dialog closes for any reason: Escape, Cancel, or the app setting `open` false. */
  onClose: () => void;
  title: string;
  /** The body. For the destructive variant it names the consequence in plain words. */
  children: ReactNode;
  variant?: "default" | "destructive";
  /** The primary action's label; it says what happens ("Remove Alex"), never "OK". */
  confirmLabel?: string;
  onConfirm?: () => void;
  cancelLabel?: string;
  /** While the action runs the confirm button shows `pendingLabel` at the same width and ignores presses. */
  loading?: boolean;
  pendingLabel?: string;
  /** Shown beneath the body in a polite live region; it says what to do next. */
  error?: string;
  disabled?: boolean;
  /** Draws the open panel in the page flow instead of the top layer. Documentation only. */
  inline?: boolean;
}

/**
 * A native `<dialog>` on the overlay tier (architecture 13.6): the browser
 * owns the top layer, the focus trap, Escape and the return of focus to the
 * element that opened it; this component owns the scrim (the page color at
 * 40 percent), the panel and the two actions. The destructive variant colors
 * the confirm button with the danger role and expects the body to name the
 * consequence.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  variant = "default",
  confirmLabel,
  onConfirm,
  cancelLabel = "Cancel",
  loading = false,
  pendingLabel = "Saving",
  error,
  disabled = false,
  inline = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || inline) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Browsers differ on what showModal focuses; Cancel first keeps the first Enter harmless.
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, inline]);

  const confirmClass =
    variant === "destructive"
      ? `${styles.button} ${styles.destructive}`
      : `${styles.button} ${styles.primary}`;

  return (
    <dialog
      ref={ref}
      open={inline ? true : undefined}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div id={bodyId} className={styles.body}>
          {children}
        </div>
        <p className={styles.error} aria-live="polite">
          {error}
        </p>
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            disabled={disabled}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          {confirmLabel ? (
            <button
              type="button"
              className={confirmClass}
              disabled={disabled}
              aria-disabled={loading || undefined}
              aria-busy={loading || undefined}
              onClick={() => {
                if (loading) return;
                onConfirm?.();
              }}
            >
              <span className={styles.labels}>
                <span className={loading ? styles.hiddenLabel : undefined} aria-hidden={loading}>
                  {confirmLabel}
                </span>
                <span className={loading ? undefined : styles.hiddenLabel} aria-hidden={!loading}>
                  {pendingLabel}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
