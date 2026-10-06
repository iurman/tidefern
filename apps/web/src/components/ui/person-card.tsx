"use client";
import { useId, useState } from "react";
import type { ShareCategory } from "@tidefern/schemas";
import { Dialog } from "./dialog";
import { formatCalendarDate } from "./format-date";
import { GrantRow, grantCopy, privateNotesSentence } from "./grant-row";
import styles from "./person-card.module.css";

export interface PersonGrant {
  category: ShareCategory;
  /** The child's name for a `child` grant; one grant per child. */
  childName?: string;
  checked: boolean;
  /** This grant's change is being saved. */
  loading?: boolean;
  /** Says what to do next for this grant. */
  error?: string;
}

export interface PersonCardProps {
  name: string;
  /** In the person's own words: "partner", "grandparent". */
  relation: string;
  /** The sharing start date, `YYYY-MM-DD`. */
  since: string;
  grants: PersonGrant[];
  /** "Tell [name] when my period starts". */
  notify: boolean;
  onGrantChange?: (grant: PersonGrant, checked: boolean) => void;
  onNotifyChange?: (checked: boolean) => void;
  /** Removing the person revokes every grant at once; the card asks first and names the consequence. */
  onRemove?: () => void;
  /** The removal is running; the remove action reads "Removing" and keeps its width. */
  loading?: boolean;
  /** A card-level message that says what to do next. */
  error?: string;
  disabled?: boolean;
  notifyLoading?: boolean;
}

function grantLabel(grant: PersonGrant): { label: string; description: string } {
  if (grant.category === "child" && grant.childName) {
    return {
      label: grant.childName,
      description: `Everything logged for ${grant.childName}: feeds, sleep, growth, milestones and photos.`,
    };
  }
  return grantCopy[grant.category];
}

/**
 * One person on /sharing (DESIGN.md 3.7): who they are, since when, every
 * category with its plain description and switch, the notify switch with
 * its one-line explanation, and the one-step remove action behind a
 * destructive dialog. The card is a surface, never warmth, so no person
 * reads as highlighted.
 */
export function PersonCard({
  name,
  relation,
  since,
  grants,
  notify,
  onGrantChange,
  onNotifyChange,
  onRemove,
  loading = false,
  error,
  disabled = false,
  notifyLoading = false,
}: PersonCardProps) {
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h3 id={headingId} className={styles.name}>
          {name}
        </h3>
        <p className={styles.meta}>
          {relation}, since {formatCalendarDate(since)}
        </p>
      </header>
      <p className={styles.error} aria-live="polite">
        {error}
      </p>
      <ul className={styles.grants}>
        {grants.map((grant) => {
          const copy = grantLabel(grant);
          return (
            <li key={grant.childName ? `${grant.category}:${grant.childName}` : grant.category}>
              <GrantRow
                label={copy.label}
                description={copy.description}
                checked={grant.checked}
                onChange={(checked) => onGrantChange?.(grant, checked)}
                disabled={disabled}
                loading={grant.loading}
                error={grant.error}
              />
            </li>
          );
        })}
        <li className={styles.notify}>
          <GrantRow
            label={`Tell ${name} when my period starts`}
            description="The message says only that there is something new in Tidefern."
            checked={notify}
            onChange={onNotifyChange}
            disabled={disabled}
            loading={notifyLoading}
          />
        </li>
      </ul>
      <footer className={styles.foot}>
        <p className={styles.note}>{privateNotesSentence}</p>
        <button
          type="button"
          className={styles.remove}
          disabled={disabled}
          aria-disabled={loading || undefined}
          aria-busy={loading || undefined}
          onClick={() => {
            if (loading) return;
            setConfirming(true);
          }}
        >
          <span className={styles.labels}>
            <span className={loading ? styles.hiddenLabel : undefined} aria-hidden={loading}>
              Remove {name}
            </span>
            <span className={loading ? undefined : styles.hiddenLabel} aria-hidden={!loading}>
              Removing
            </span>
          </span>
        </button>
      </footer>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${name}?`}
        variant="destructive"
        confirmLabel={`Remove ${name}`}
        pendingLabel="Removing"
        cancelLabel="Keep sharing"
        loading={loading}
        onConfirm={() => {
          setConfirming(false);
          onRemove?.();
        }}
      >
        <p>
          {name} loses access to everything you share, right now. What {name} added to your record
          stays with you.
        </p>
      </Dialog>
    </article>
  );
}
