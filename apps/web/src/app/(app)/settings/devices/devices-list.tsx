"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeviceRow } from "@/components/ui/device-row";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { authClient, freshAuthRequired, sessionGone, SIGN_IN_PATH } from "@/lib/auth-client";
import type { SettingsCallError } from "@/lib/auth-client";
import { describeRevokeFailure, devicesCopy as copy } from "./copy";
import styles from "./devices.module.css";
import { toDevices, type DeviceFacts, type SessionFacts } from "./sessions";

type List =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "fresh-auth" }
  | { kind: "ready"; devices: DeviceFacts[] };

/** Which confirmation is open: one device by its token, or every other device. */
type Confirm = { kind: "none" } | { kind: "one"; device: DeviceFacts } | { kind: "others" };

type Outcome =
  | { kind: "none" }
  | { kind: "done"; sentence: string }
  | { kind: "failed"; sentence: string }
  | { kind: "fresh-auth" };

function leaveForSignIn() {
  // A full navigation, so the sign-in page starts from a clean server render.
  window.location.assign(SIGN_IN_PATH);
}

/** The time zone the browser reads dates in; the profile's zone arrives with task H7. */
function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * What the two reads on mount came back with: `gone` means the cookie names
 * no session, `fresh-auth` that Better Auth's own freshness rule on
 * `list-sessions` wants a newer sign-in before it lists anything.
 */
type Loaded =
  | { kind: "gone" }
  | { kind: "failed" }
  | { kind: "fresh-auth" }
  | { kind: "ready"; devices: DeviceFacts[] };

async function readDevices(): Promise<Loaded> {
  const [current, sessions] = await Promise.all([
    authClient.getSession(),
    authClient.listSessions(),
  ]);
  const sessionsError = sessions.error as SettingsCallError | null;
  const currentError = current.error as SettingsCallError | null;
  if (sessionGone(sessionsError) || sessionGone(currentError)) return { kind: "gone" };
  if (freshAuthRequired(sessionsError)) return { kind: "fresh-auth" };
  if (sessionsError !== null || sessions.data === null) return { kind: "failed" };
  // Both reads feed the list: without the current session nothing could say which
  // row is this browser, so a failed read is a failed load, not a list of strangers.
  if (currentError !== null) return { kind: "failed" };
  if (current.data === null) return { kind: "gone" };
  const currentId = current.data.session.id;
  const rows: SessionFacts[] = sessions.data.map((session) => ({
    id: session.id,
    token: session.token,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    userAgent: session.userAgent,
  }));
  return { kind: "ready", devices: toDevices(rows, currentId, viewerTimeZone()) };
}

/**
 * The devices list (DESIGN.md 3.8): every session from Better Auth's
 * `listSessions`, each a `DeviceRow`, the current one first. Revoking one
 * device or every other device is confirmed in a `Dialog` before the call
 * is made; a refusal for a stale sign-in (the API's ten-minute rule, or
 * Better Auth's own freshness rule) is shown as the next step to sign in
 * again rather than as a failure to retry. A 401 with no such detail
 * means the session is gone, and the page sends the person to sign in.
 */
export function DevicesList() {
  const [list, setList] = useState<List>({ kind: "loading" });
  const [confirm, setConfirm] = useState<Confirm>({ kind: "none" });
  // Whether a dialog is open, kept in a ref by the handlers that open and close it, because
  // settle() reads it after an await and the state in its closure may predate an Escape press.
  const dialogOpen = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

  // The read is a plain promise and the state lands in its callback, so the
  // mount effect sets nothing itself and a read that outlives the page is dropped.
  const apply = useCallback((loaded: Loaded) => {
    if (loaded.kind === "gone") return leaveForSignIn();
    setList(loaded);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readDevices().then((loaded) => {
      if (!cancelled) apply(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  function reload() {
    setList({ kind: "loading" });
    readDevices().then(apply);
  }

  function open(next: Confirm) {
    setDialogError(undefined);
    setOutcome({ kind: "none" });
    dialogOpen.current = true;
    setConfirm(next);
  }

  function close() {
    // The native dialog may already be closed (Escape); the state follows it even mid-call,
    // and a call still in flight reports its outcome on the page instead.
    dialogOpen.current = false;
    setConfirm({ kind: "none" });
    setDialogError(undefined);
  }

  function settle(error: SettingsCallError | null, doneSentence: string) {
    setBusy(false);
    if (error === null) {
      close();
      setOutcome({ kind: "done", sentence: doneSentence });
      readDevices().then(apply);
      return;
    }
    if (sessionGone(error)) return leaveForSignIn();
    if (freshAuthRequired(error)) {
      // Not something a retry can fix: close the dialog and show the next step in place.
      close();
      setOutcome({ kind: "fresh-auth" });
      return;
    }
    const sentence = describeRevokeFailure(error);
    if (dialogOpen.current) setDialogError(sentence);
    else setOutcome({ kind: "failed", sentence });
  }

  async function revokeOne(device: DeviceFacts) {
    if (busy) return;
    setBusy(true);
    setDialogError(undefined);
    const { error } = await authClient.revokeSession({ token: device.token });
    settle(error as SettingsCallError | null, copy.revokeOne.done);
  }

  async function revokeOthers(count: number) {
    if (busy) return;
    setBusy(true);
    setDialogError(undefined);
    const { error } = await authClient.revokeOtherSessions();
    settle(error as SettingsCallError | null, copy.revokeOthers.done(count));
  }

  const devices = list.kind === "ready" ? list.devices : [];
  const othersCount = devices.filter((device) => !device.current).length;
  // The next step is a fresh sign-in whether the list itself or a revocation was refused.
  let freshAuth: string | null = null;
  if (list.kind === "fresh-auth") freshAuth = copy.freshAuth.list;
  else if (outcome.kind === "fresh-auth") freshAuth = copy.freshAuth.sentence;

  return (
    <>
      {freshAuth !== null ? (
        <div className={styles.feedback}>
          <InlineFeedback tone="error" cue>
            {freshAuth}
          </InlineFeedback>
          <div className={styles.feedbackAction}>
            <Button href={SIGN_IN_PATH} variant="secondary">
              {copy.freshAuth.action}
            </Button>
          </div>
        </div>
      ) : null}
      {outcome.kind === "done" ? (
        <InlineFeedback tone="success" cue className={styles.feedback}>
          {outcome.sentence}
        </InlineFeedback>
      ) : null}
      {outcome.kind === "failed" ? (
        <InlineFeedback tone="error" cue className={styles.feedback}>
          {outcome.sentence}
        </InlineFeedback>
      ) : null}

      {list.kind === "loading" ? (
        <p className={styles.pending} role="status" aria-live="polite" aria-busy="true">
          {copy.loading}
        </p>
      ) : null}

      {list.kind === "failed" ? (
        <div className={styles.feedback}>
          <InlineFeedback tone="error">{copy.loadFailed}</InlineFeedback>
          <div className={styles.feedbackAction}>
            <Button variant="secondary" onClick={reload}>
              {copy.reload}
            </Button>
          </div>
        </div>
      ) : null}

      {list.kind === "ready" && devices.length === 0 ? (
        <EmptyState
          heading={copy.none.heading}
          why={copy.none.why}
          action={
            <Button variant="secondary" onClick={reload}>
              {copy.reload}
            </Button>
          }
        />
      ) : null}

      {list.kind === "ready" && devices.length > 0 ? (
        <div className={styles.list} aria-busy={busy || undefined}>
          {devices.map((device) => (
            <DeviceRow
              key={device.id}
              browser={device.browser}
              lastSeen={device.lastSeen}
              current={device.current}
              othersCount={device.current ? othersCount : 0}
              onRevoke={() => open({ kind: "one", device })}
              onRevokeOthers={device.current ? () => open({ kind: "others" }) : undefined}
              disabled={busy}
            />
          ))}
        </div>
      ) : null}

      <Dialog
        open={confirm.kind === "one"}
        onClose={close}
        title={copy.revokeOne.title}
        variant="destructive"
        confirmLabel={copy.revokeOne.confirm}
        cancelLabel={copy.cancel}
        onConfirm={() => {
          if (confirm.kind === "one") void revokeOne(confirm.device);
        }}
        loading={busy}
        pendingLabel={copy.revokeOne.pending}
        error={dialogError}
      >
        {confirm.kind === "one" ? (
          <p>
            <strong>{confirm.device.browser}</strong>. {copy.revokeOne.body}
          </p>
        ) : (
          <p>{copy.revokeOne.body}</p>
        )}
      </Dialog>

      <Dialog
        open={confirm.kind === "others"}
        onClose={close}
        title={copy.revokeOthers.title(othersCount)}
        variant="destructive"
        confirmLabel={copy.revokeOthers.confirm(othersCount)}
        cancelLabel={copy.cancel}
        onConfirm={() => void revokeOthers(othersCount)}
        loading={busy}
        pendingLabel={copy.revokeOthers.pending}
        error={dialogError}
      >
        <p>{copy.revokeOthers.body}</p>
      </Dialog>
    </>
  );
}
