"use client";
import styles from "./device-row.module.css";
import { formatCalendarDate } from "./format-date";

export interface DeviceRowProps {
  /** The browser and platform as the audit recorded them ("Firefox on Linux"). */
  browser: string;
  /** The last day a request arrived from this device, `YYYY-MM-DD`. */
  lastSeen: string;
  /** This is the browser the person is reading on. */
  current?: boolean;
  /** How many other devices are signed in; the current row offers to sign them all out. */
  othersCount?: number;
  /** Signs this one device out. */
  onRevoke?: () => void;
  /** Signs every other device out, offered on the current row only. */
  onRevokeOthers?: () => void;
  /** A revocation is running; the action reads "Signing out" and keeps its width. */
  loading?: boolean;
  /** Says what to do next ("We could not sign this device out. Try again."). */
  error?: string;
  disabled?: boolean;
}

/**
 * One signed-in device in Settings (DESIGN.md 3.8): the browser, when it
 * was last seen, and the revoke actions. The current row carries the
 * "sign out other devices" action; when there is nothing else signed in it
 * says so with the empty-state words from CONTENT.md instead of an action.
 */
export function DeviceRow({
  browser,
  lastSeen,
  current = false,
  othersCount = 0,
  onRevoke,
  onRevokeOthers,
  loading = false,
  error,
  disabled = false,
}: DeviceRowProps) {
  const onlyThis = current && othersCount === 0;
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={styles.name}>
          {browser}
          {current ? <span className={styles.badge}>This browser</span> : null}
        </p>
        <p className={styles.meta}>Last seen {formatCalendarDate(lastSeen)}</p>
        {onlyThis ? (
          <p className={styles.meta}>
            Only this device. Other signed-in browsers and phones appear here so you can sign them
            out.
          </p>
        ) : null}
        <p className={styles.error} aria-live="polite">
          {error}
        </p>
      </div>
      <div className={styles.actions}>
        {current && othersCount > 0 && onRevokeOthers ? (
          <button
            type="button"
            className={styles.action}
            disabled={disabled}
            aria-disabled={loading || undefined}
            aria-busy={loading || undefined}
            onClick={() => {
              if (loading) return;
              onRevokeOthers();
            }}
          >
            <span className={styles.labels}>
              <span className={loading ? styles.hiddenLabel : undefined} aria-hidden={loading}>
                Sign out {othersCount === 1 ? "the other device" : `${othersCount} other devices`}
              </span>
              <span className={loading ? undefined : styles.hiddenLabel} aria-hidden={!loading}>
                Signing out
              </span>
            </span>
          </button>
        ) : null}
        {onRevoke ? (
          <button
            type="button"
            className={styles.action}
            disabled={disabled}
            aria-disabled={loading || undefined}
            aria-busy={loading || undefined}
            onClick={() => {
              if (loading) return;
              onRevoke();
            }}
          >
            <span className={styles.labels}>
              <span className={loading ? styles.hiddenLabel : undefined} aria-hidden={loading}>
                Sign out this device
              </span>
              <span className={loading ? undefined : styles.hiddenLabel} aria-hidden={!loading}>
                Signing out
              </span>
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
