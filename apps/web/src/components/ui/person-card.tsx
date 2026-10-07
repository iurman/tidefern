"use client";
import { useId, useState, type ReactNode } from "react";
import type { ShareCategory } from "@tidefern/schemas";
import { Dialog } from "./dialog";
import { formatCalendarDate } from "./format-date";
import { GrantRow, grantCopy, privateNotesSentence } from "./grant-row";
import styles from "./person-card.module.css";

export interface PersonGrant {
  category: ShareCategory;
  /** A stable key when the label alone could repeat, such as a child's id. */
  id?: string;
  /** The child's name for a `child` grant; one grant per child. */
  childName?: string;
  checked: boolean;
  /** The level an on grant holds, in words ("Level: summary"); shown only while it is on. */
  level?: string;
  /** This grant's change is being saved. */
  loading?: boolean;
  /** Says what to do next for this grant. */
  error?: string;
  /** The outcome of this grant's last change, shown under its row. */
  done?: string;
}

export interface PersonCardProps {
  name: string;
  /** In the person's own words: "partner", "grandparent". */
  relation: string;
  /** The sharing start date, `YYYY-MM-DD`; left out when nothing is shared yet. */
  since?: string;
  /** Today, `YYYY-MM-DD`: a `since` in another year then shows its year. */
  today?: string;
  grants: PersonGrant[];
  /** "Tell [name] when my period starts". */
  notify: boolean;
  /** Leaves the notify row out, for someone it cannot apply to. */
  notifyHidden?: boolean;
  /** Shows the notify row but lets nobody press it; `notifyNote` says why. */
  notifyDisabled?: boolean;
  /** One plain line under the notify row's sentence, such as what turns it on. */
  notifyNote?: string;
  /** Says what to do next for the notify switch. */
  notifyError?: string;
  /** The outcome of the notify switch's last change. */
  notifyDone?: string;
  onGrantChange?: (grant: PersonGrant, checked: boolean) => void;
  onNotifyChange?: (checked: boolean) => void;
  /** Removing the person revokes every grant at once; the card asks first and names the consequence. */
  onRemove?: () => void;
  /** What removing this person does, which depends on who owns the household; the default suits a partner. */
  removeConsequence?: ReactNode;
  /** Says what to do next when removing the person failed or was refused. */
  removeError?: ReactNode;
  /** The removal is running; the remove action reads "Removing" and keeps its width. */
  loading?: boolean;
  /** A card-level message that says what to do next. */
  error?: ReactNode;
  disabled?: boolean;
  notifyLoading?: boolean;
  /** The per-card private-notes line; a page that says it once for every card turns it off. */
  showPrivateNotes?: boolean;
  /** More about this person under the switches, such as what they share with you. */
  children?: ReactNode;
}

/**
 * A grant row's name and plain words: the category's own from the catalog,
 * or for one child the child's name and the child sentence with the name in
 * it. Exported so a confirm step quotes exactly what the row shows.
 */
export function personGrantCopy(grant: Pick<PersonGrant, "category" | "childName">): {
  label: string;
  description: string;
} {
  if (grant.category === "child" && grant.childName) {
    return {
      label: grant.childName,
      description: `Everything logged for ${grant.childName}: feeds, sleep, growth, milestones and photos.`,
    };
  }
  return grantCopy[grant.category];
}

function grantKey(grant: PersonGrant): string {
  if (grant.id) return grant.id;
  return grant.childName ? `${grant.category}:${grant.childName}` : grant.category;
}

/** "Mar 2", or "Dec 29, 2025" when the date falls in another year than today. */
function sinceText(since: string, today: string | undefined): string {
  const otherYear = today !== undefined && today.slice(0, 4) !== since.slice(0, 4);
  return formatCalendarDate(since, otherYear ? "full" : "monthDay");
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
  today,
  grants,
  notify,
  notifyHidden = false,
  notifyDisabled = false,
  notifyNote,
  notifyError,
  notifyDone,
  onGrantChange,
  onNotifyChange,
  onRemove,
  removeConsequence,
  removeError,
  loading = false,
  error,
  disabled = false,
  notifyLoading = false,
  showPrivateNotes = true,
  children,
}: PersonCardProps) {
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const showList = grants.length > 0 || !notifyHidden;
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h3 id={headingId} className={styles.name}>
          {name}
        </h3>
        <p className={styles.meta}>
          {since ? `${relation}, since ${sinceText(since, today)}` : relation}
        </p>
      </header>
      <div className={styles.error} aria-live="polite">
        {error}
      </div>
      {showList ? (
        <ul className={styles.grants}>
          {grants.map((grant) => {
            const copy = personGrantCopy(grant);
            return (
              <li key={grantKey(grant)}>
                <GrantRow
                  label={copy.label}
                  description={copy.description}
                  checked={grant.checked}
                  onChange={(checked) => onGrantChange?.(grant, checked)}
                  disabled={disabled}
                  loading={grant.loading}
                  error={grant.error}
                  level={grant.level}
                  done={grant.done}
                />
              </li>
            );
          })}
          {notifyHidden ? null : (
            <li className={styles.notify}>
              <GrantRow
                label={`Tell ${name} when my period starts`}
                description="The message says only that there is something new in Tidefern."
                checked={notify}
                onChange={onNotifyChange}
                disabled={disabled || notifyDisabled}
                loading={notifyLoading}
                note={notifyNote}
                error={notifyError}
                done={notifyDone}
              />
            </li>
          )}
        </ul>
      ) : null}
      {children}
      <footer className={styles.foot}>
        {showPrivateNotes ? <p className={styles.note}>{privateNotesSentence}</p> : null}
        <div className={styles.removeError} aria-live="polite">
          {removeError}
        </div>
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
        {removeConsequence ?? (
          <p>
            {name} loses access to everything you share, right now. What {name} added to your record
            stays with you.
          </p>
        )}
      </Dialog>
    </article>
  );
}
