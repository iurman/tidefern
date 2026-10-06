"use client";
import { useId } from "react";
import { formatCalendarDate } from "./format-date";
import styles from "./invitation-card.module.css";

export interface InvitationCardProps {
  /** Who was invited, as the person wrote it. */
  name: string;
  /** The day the invitation was sent, `YYYY-MM-DD`. */
  sentOn: string;
  /** Withdrawing is one step; the token stops working at once. */
  onWithdraw?: () => void;
  /** The withdrawal is running; the action reads "Withdrawing" and keeps its width. */
  loading?: boolean;
  /** Says what to do next ("The invitation has expired. Send a new one."). */
  error?: string;
  disabled?: boolean;
}

/**
 * A pending invitation on /sharing (DESIGN.md 3.7). The card carries no
 * link that accepts: the invited person accepts after signing in, by a
 * POST on their side, so nothing on this screen can be clicked into an
 * acceptance by mistake. Withdraw is the only action.
 */
export function InvitationCard({
  name,
  sentOn,
  onWithdraw,
  loading = false,
  error,
  disabled = false,
}: InvitationCardProps) {
  const headingId = useId();
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <div className={styles.text}>
        <h3 id={headingId} className={styles.name}>
          {name}
        </h3>
        <p className={styles.meta}>
          Sent {formatCalendarDate(sentOn)}. Waiting for {name} to sign in and accept.
        </p>
        <p className={styles.error} aria-live="polite">
          {error}
        </p>
      </div>
      <button
        type="button"
        className={styles.withdraw}
        disabled={disabled}
        aria-disabled={loading || undefined}
        aria-busy={loading || undefined}
        onClick={() => {
          if (loading) return;
          onWithdraw?.();
        }}
      >
        <span className={styles.labels}>
          <span className={loading ? styles.hiddenLabel : undefined} aria-hidden={loading}>
            Withdraw
          </span>
          <span className={loading ? undefined : styles.hiddenLabel} aria-hidden={!loading}>
            Withdrawing
          </span>
        </span>
      </button>
    </article>
  );
}
