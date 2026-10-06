"use client";
import { useEffect, useRef, useState } from "react";
import { play } from "@/lib/sound";
import { Button } from "./button";
import styles from "./copy-code.module.css";

export type CopyStatus = "idle" | "copied" | "failed";

export interface CopyCodeProps {
  code: string;
  /** Names the block for assistive technology: "Usage", "Theme variables". */
  label?: string;
  /** Shown as a caption above the code, for example "css" or "tsx". */
  language?: string;
  /** The status to start from; a page that already knows the clipboard is blocked can say so. */
  status?: CopyStatus;
  disabled?: boolean;
  className?: string;
}

const messages: Record<CopyStatus, string> = {
  idle: "",
  copied: "Copied",
  failed: "Copy failed. Select the text and copy it yourself.",
};

/** How long the status text stays before the region clears, so a second copy is announced again. */
const STATUS_RESET_MS = 4000;

/**
 * A code block with a copy button for the reference chapters. The result is
 * always visible text in a polite live region, and the success or error cue
 * plays once beside it, which is the one place a component plays a cue
 * itself (COMPONENTS.md, rules that hold everywhere).
 */
export function CopyCode({
  code,
  label = "Code",
  language,
  status: initialStatus = "idle",
  disabled = false,
  className,
}: CopyCodeProps) {
  const [status, setStatus] = useState<CopyStatus>(initialStatus);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const empty = code.length === 0;

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    let next: CopyStatus;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      next = "copied";
    } catch {
      next = "failed";
    }
    setStatus(next);
    play(next === "copied" ? "success" : "error");
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus("idle"), STATUS_RESET_MS);
  }

  const classes = [styles.copyCode, className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-status={status}>
      <div className={styles.bar}>
        <span className={styles.language}>{language ?? label}</span>
        <span className={styles.status} role="status" aria-live="polite">
          {messages[status]}
        </span>
        <Button variant="quiet" onClick={copy} disabled={disabled || empty}>
          Copy
        </Button>
      </div>
      {empty ? (
        <p className={styles.nothing}>Nothing to copy yet.</p>
      ) : (
        <pre className={styles.pre} tabIndex={0} aria-label={label}>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
