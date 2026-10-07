"use client";
import { useId } from "react";
import {
  CURRENT_SHARING_DESCRIPTION_VERSION,
  SHARING_DESCRIPTIONS,
  type ShareCategory,
  type ShareLevel,
} from "@tidefern/schemas";
import { InlineFeedback } from "./inline-feedback";
import { Switch } from "./switch";
import styles from "./grant-row.module.css";

/**
 * The plain words shown before a category can be turned on
 * (docs/design/CONTENT.md, sharing descriptions), read from the versioned
 * catalog in packages/schemas, so the version a grant records names the
 * text the owner read. Nouns, not values: a category never shows what was
 * logged, only what the switch would reveal.
 */
export const grantCopy: Readonly<Record<ShareCategory, { label: string; description: string }>> =
  SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION].categories;

export const privateNotesSentence = "Private notes are never shared.";

/**
 * The words for a grant's level (architecture 8.1: summary, read,
 * contribute). An owner input: docs/design/CONTENT.md, the /sharing
 * subsection, lists them for approval.
 */
export const grantLevelCopy: Readonly<Record<ShareLevel, string>> = {
  summary: "summary",
  read: "read",
  contribute: "read and add",
};

/** The line an on grant shows under its description: "Level: summary". */
export function grantLevelText(level: ShareLevel): string {
  return `Level: ${grantLevelCopy[level]}`;
}

export interface GrantRowProps {
  label: string;
  /** What turning the switch on reveals, read before the switch and attached to it. */
  description: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** The change is being saved; the switch reads "Saving" and ignores presses. */
  loading?: boolean;
  /** Says what to do next ("We could not save this change. Try again."). */
  error?: string;
  /** The level an on grant holds ("Level: summary"); shown only while the switch is on. */
  level?: string;
  /** One more plain line read with the switch, such as why it cannot be turned on yet. */
  note?: string;
  /** The outcome of the change just saved ("Alex can now see your cycle status."), with its cue. */
  done?: string;
}

/**
 * One category on a person's card: its name, the plain description of what
 * it reveals, and the switch. Turning it off revokes in that one step; no
 * confirmation stands between the person and taking access back.
 */
export function GrantRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  loading = false,
  error,
  level,
  note,
  done,
}: GrantRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  const levelId = useId();
  const noteId = useId();
  const showLevel = checked && level !== undefined;
  const describedBy = [descriptionId, showLevel ? levelId : null, note ? noteId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
        {showLevel ? (
          <p id={levelId} className={styles.level}>
            {level}
          </p>
        ) : null}
        {note ? (
          <p id={noteId} className={styles.note}>
            {note}
          </p>
        ) : null}
        <p className={styles.error} aria-live="polite">
          {error}
        </p>
        {done && !error ? (
          <InlineFeedback tone="success" cue>
            {done}
          </InlineFeedback>
        ) : null}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        loading={loading}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      />
    </div>
  );
}
