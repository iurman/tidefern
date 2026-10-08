"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { InvitationAcceptInput, type HouseholdChoice } from "@tidefern/schemas";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { browserApiClient } from "@/lib/api-browser";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { takeInvitationFragment } from "@/lib/invitation-fragment";
import { sharingCopy } from "./copy";
import { attempt, describeAcceptRefusal, goTo, leaveFor, settledByServer } from "./problems";
import styles from "./sharing.module.css";

const copy = sharingCopy.accept;

/** Whether a token has the shape the accept route takes (the API stays the judge of whether it is real). */
export function acceptableToken(token: string): boolean {
  return InvitationAcceptInput.shape.token.safeParse(token).success;
}

/** Whether a location hash came from an invitation link at all, token or not. */
function namesInvitation(hash: string): boolean {
  return hash.startsWith("#") && new URLSearchParams(hash.slice(1)).has("invitation");
}

type Panel =
  | { kind: "none" }
  | { kind: "incomplete" }
  | { kind: "ready"; error?: string }
  | { kind: "choose"; handOver: boolean; error?: string }
  | { kind: "not-open" }
  | { kind: "joined"; householdId: string | null }
  | { kind: "stayed" };

/** The step a press is for: the first call, or the second with the household choice. */
type Step = "first" | HouseholdChoice;

export interface AcceptInvitationProps {
  /** The owner's name for each household the people list shows, to say whose household was joined. */
  householdOwners: Readonly<Record<string, string>>;
  /**
   * The page could not read its lists. The panel then says so itself,
   * under it, because the next step depends on the panel: while it holds a
   * token, a reload would lose the invitation (the fragment is already out
   * of the address bar), so the sentence asks for the acceptance first.
   */
  readFailed?: boolean;
}

/**
 * The acceptance panel above People, for a page opened from an invitation
 * link (`/sharing#invitation=<token>`, the path the mail links). On mount
 * it reads the fragment and takes it out of the address bar (G10's
 * `takeInvitationFragment`), keeps the token in memory only, and accepts
 * only when the signed-in person presses Accept, by POST with the token in
 * the body (architecture 8.3). It never sends a token of the wrong shape,
 * and it never says which of expired, withdrawn or sent to another address
 * an invitation that cannot be used is, as the API never does. An invitee
 * who already belongs to a household chooses to move or to stay. Renders
 * nothing when the page was not opened from a link, except the failed
 * read's sentence when `readFailed` asks for it.
 */
export function AcceptInvitation({ householdOwners, readFailed = false }: AcceptInvitationProps) {
  const router = useRouter();
  const headingId = useId();
  const token = useRef<string | null>(null);
  // One Idempotency-Key per step, kept only while the step's last answer was lost, so a retry
  // replays an acceptance that went through instead of meeting the closed invitation's 404.
  const keys = useRef<Partial<Record<Step, string>>>({});
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [busy, setBusy] = useState<Step | null>(null);
  const [, startRefresh] = useTransition();

  useEffect(() => {
    const opened = namesInvitation(window.location.hash);
    // Strict mode runs this twice in development: both reads get the same token, removed once.
    const taken = takeInvitationFragment();
    if (!opened) return;
    let cancelled = false;
    // The state lands a microtask later, as the devices list does with its first read.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (taken !== null && acceptableToken(taken)) {
        token.current = taken;
        setPanel({ kind: "ready" });
      } else {
        setPanel({ kind: "incomplete" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** One POST for a step, under the step's key; a key the server settled is dropped after. */
  async function send(step: Step, held: string) {
    const key = (keys.current[step] ??= browserApiClient().newId());
    const result = await attempt(() =>
      browserApiClient().POST("/api/v1/sharing/invitations/accept", {
        body: step === "first" ? { token: held } : { token: held, household: step },
        headers: { "Idempotency-Key": key },
      }),
    );
    if (!result.ok && settledByServer(result)) delete keys.current[step];
    return result;
  }

  async function accept(step: Step) {
    const held = token.current;
    if (held === null || busy !== null) return;
    setBusy(step);
    let result = await send(step, held);
    if (!result.ok && result.replayed && result.status < 500) {
      // A refusal stored under this key by an earlier press whose answer was lost. A replay
      // carries no detail, so a choice to make would read as a plain failure; a refusal
      // changed nothing, so asking again under a new key gets the refusal itself.
      result = await send(step, held);
    }
    setBusy(null);
    if (result.ok) {
      // A replayed answer carries no body; the step says what it was.
      const joined = result.data?.joined ?? step !== "stay";
      token.current = null;
      setPanel(
        joined
          ? { kind: "joined", householdId: result.data?.householdId ?? null }
          : { kind: "stayed" },
      );
      startRefresh(() => router.refresh());
      return;
    }
    const leave = leaveFor(result);
    if (leave !== null) {
      // Back through sign-in with the token in the fragment, which the sign-in form forwards here.
      goTo(leave === SIGN_IN_PATH ? `${SIGN_IN_PATH}#invitation=${held}` : leave);
      return;
    }
    const refusal = describeAcceptRefusal(result);
    if (refusal.kind === "choose") setPanel({ kind: "choose", handOver: false });
    else if (refusal.kind === "hand-over") setPanel({ kind: "choose", handOver: true });
    else if (refusal.kind === "not-open") {
      token.current = null;
      setPanel({ kind: "not-open" });
    } else {
      setPanel((current) =>
        current.kind === "choose"
          ? { ...current, error: refusal.sentence }
          : { kind: "ready", error: refusal.sentence },
      );
    }
  }

  // Shown on load, not after a press, so it plays no cue (DESIGN.md 7: cues answer actions).
  const failure = readFailed ? (
    <InlineFeedback tone="error">
      {panel.kind === "ready" || panel.kind === "choose"
        ? sharingCopy.loadFailedHolding
        : sharingCopy.loadFailed}
    </InlineFeedback>
  ) : null;

  if (panel.kind === "none") return failure;

  const owner =
    panel.kind === "joined" && panel.householdId !== null
      ? (householdOwners[panel.householdId] ?? null)
      : null;

  return (
    <>
      <section className={styles.accept} aria-labelledby={headingId}>
        <h2 id={headingId} className={styles.sectionHeading}>
          {copy.heading}
        </h2>
        {panel.kind === "ready" ? (
          <>
            <p className={styles.lede}>{copy.lede}</p>
            {panel.error ? (
              <InlineFeedback tone="error" cue>
                {panel.error}
              </InlineFeedback>
            ) : null}
            <div className={styles.actions}>
              <Button
                onClick={() => void accept("first")}
                loading={busy === "first"}
                loadingText={copy.pending}
              >
                {copy.action}
              </Button>
            </div>
          </>
        ) : null}
        {panel.kind === "choose" ? (
          <>
            <p className={styles.lede}>{copy.choice}</p>
            {panel.handOver ? (
              <InlineFeedback tone="error" cue>
                {copy.handOver}
              </InlineFeedback>
            ) : null}
            {panel.error ? (
              <InlineFeedback tone="error" cue>
                {panel.error}
              </InlineFeedback>
            ) : null}
            <div className={styles.actions}>
              {panel.handOver ? null : (
                <Button
                  onClick={() => void accept("move")}
                  loading={busy === "move"}
                  loadingText={copy.pending}
                >
                  {copy.move}
                </Button>
              )}
              <Button
                variant={panel.handOver ? "primary" : "secondary"}
                onClick={() => void accept("stay")}
                loading={busy === "stay"}
                loadingText={copy.pending}
              >
                {copy.stay}
              </Button>
            </div>
          </>
        ) : null}
        {panel.kind === "joined" ? (
          <InlineFeedback tone="success" cue>
            {copy.joined(owner)}
          </InlineFeedback>
        ) : null}
        {panel.kind === "stayed" ? (
          <InlineFeedback tone="info">{copy.stayed}</InlineFeedback>
        ) : null}
        {panel.kind === "not-open" ? (
          <InlineFeedback tone="error" cue>
            {copy.notOpen}
          </InlineFeedback>
        ) : null}
        {panel.kind === "incomplete" ? (
          // Shown on load, not after a press, so it plays no cue (DESIGN.md 7: cues answer actions).
          <InlineFeedback tone="error">{copy.incomplete}</InlineFeedback>
        ) : null}
      </section>
      {failure}
    </>
  );
}
