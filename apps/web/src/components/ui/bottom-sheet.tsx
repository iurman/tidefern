"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import styles from "./bottom-sheet.module.css";

export interface BottomSheetProps {
  open: boolean;
  /** Called when the sheet closes for any reason: Escape, the close button, or the app setting `open` false. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** The body is still arriving: it reads "Loading" and carries `aria-busy`. */
  loading?: boolean;
  /** Shown beneath the title in a polite live region; it says what to do next. */
  error?: string;
  /** Draws the open sheet in the page flow instead of the top layer. Documentation only. */
  inline?: boolean;
}

/**
 * A native `<dialog>` that rises from the bottom edge below 1024 px and
 * becomes a centered dialog from there (DESIGN.md 3.4). The handle is a
 * picture of the gesture, never the only way out: the close button sits
 * beside it and Escape works, so nothing depends on dragging (WCAG 2.5.7).
 * The body scrolls on its own with `overscroll-behavior: contain` so the
 * page beneath stays put.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  loading = false,
  error,
  inline = false,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const sheet = ref.current;
    if (!sheet || inline) return;
    if (open && !sheet.open) {
      sheet.showModal();
      // Browsers differ on what showModal focuses; the close button is the one sure way out.
      closeRef.current?.focus();
    } else if (!open && sheet.open) {
      sheet.close();
    }
  }, [open, inline]);

  return (
    <dialog
      ref={ref}
      open={inline ? true : undefined}
      className={styles.sheet}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className={styles.head}>
        <span className={styles.handle} aria-hidden="true" />
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          <Icon name="close" size={20} />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.error} aria-live="polite">
        {error}
      </p>
      <div className={styles.body} aria-busy={loading || undefined}>
        {loading ? <p className={styles.loading}>Loading</p> : children}
      </div>
    </dialog>
  );
}
