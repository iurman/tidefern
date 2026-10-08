"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { CURRENT_SHARING_DESCRIPTION_VERSION } from "@tidefern/schemas";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { grantLevelText } from "@/components/ui/grant-row";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { PersonCard } from "@/components/ui/person-card";
import { TextLink } from "@/components/ui/text-link";
import { browserApiClient } from "@/lib/api-browser";
import { grantPhrase, joinNames, sharingCopy as copy } from "./copy";
import { FreshSignIn } from "./fresh-sign-in";
import { GrantConfirm, type GrantConfirmTarget } from "./grant-confirm";
import { InvitationList } from "./invitation-list";
import { INVITE_EMAIL_ID, InviteForm } from "./invite-form";
import type { GrantView, PersonView, ReceivedView, SharingView } from "./people";
import {
  attempt,
  describeChangeFailure,
  describeRemoveFailure,
  goTo,
  isCoGuardianRefusal,
  isStale,
  leaveFor,
  needsFreshSignIn,
} from "./problems";
import styles from "./sharing.module.css";

/**
 * The version of the sharing policy a grant records (`GrantSetInput.policyVersion`).
 * The words the owner reads on a card before she chooses (each category's
 * description, a child's own row, the notify switch's label and sentence)
 * are that policy, and the descriptions catalog versions all of them, so
 * the two versions are one until a sharing policy text of its own exists;
 * the seed records the same value. The page's closing line, "Private notes
 * are never shared." (DESIGN.md 3.7), names what no grant can reach.
 */
export const SHARING_POLICY_VERSION = CURRENT_SHARING_DESCRIPTION_VERSION;

/** One control on one person's card: a grant row by its key, the notify switch, or the removal. */
interface Target {
  personId: string;
  key: string;
}

type Outcome = Target & { kind: "done" | "error"; text: string; coGuardian?: boolean };

/**
 * One value per person's card, so a change on one card never clears or
 * overrides the pending state or the outcome of a change on another.
 */
type PerPerson<T> = Readonly<Record<string, T>>;

/** The map with one person's entry set, or removed when `value` is undefined. */
function withEntry<T>(map: PerPerson<T>, personId: string, value: T | undefined): PerPerson<T> {
  const next = { ...map };
  if (value === undefined) delete next[personId];
  else next[personId] = value;
  return next;
}

function same(a: Target | undefined, personId: string, key: string): boolean {
  return a !== undefined && a.personId === personId && a.key === key;
}

/** The co-guardian refusal, worded for one child or several. */
function coGuardianText(person: PersonView): string {
  const [only, ...more] = person.coGuardianOf;
  if (only !== undefined && more.length === 0) return copy.remove.coGuardianOne(person.name, only);
  return copy.remove.coGuardianSeveral(person.name, joinNames(person.coGuardianOf));
}

/** The consequence the removal dialog names, which depends on who owns the household. */
function removalText(person: PersonView): string {
  if (person.removal === "owner") return copy.remove.owner(person.name);
  if (person.removal === "member") return copy.remove.member(person.name);
  return copy.remove.grants(person.name);
}

/** The line under the notify switch: why it cannot be pressed, or why it tells nobody yet. */
function notifyNoteFor(person: PersonView): string | undefined {
  if (person.notifyMode === "disabled") return copy.notify.needsCycle(person.name);
  if (person.notifyMode === "unsent") return copy.notify.unsent(person.name);
  return undefined;
}

function Received({ name, rows }: { name: string; rows: readonly ReceivedView[] }) {
  const headingId = useId();
  return (
    <section className={styles.received} aria-labelledby={headingId}>
      <h4 id={headingId} className={styles.receivedHeading}>
        {copy.received.heading(name)}
      </h4>
      <ul className={styles.receivedList}>
        {rows.map((row) => (
          <li key={row.key}>
            <span className={styles.receivedLabel}>{row.label}</span>
            <span className={styles.receivedLevel}>{grantLevelText(row.level)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{copy.received.note(name)}</p>
    </section>
  );
}

/**
 * The people half of /sharing and the invitations under it (DESIGN.md 3.7
 * and 5.2). Turning a category on opens the confirm step and then sets it
 * with PUT /api/v1/sharing/grants/{personId} (fresh authentication,
 * If-Match on the person's version); turning one off is one DELETE with no
 * step; the notify switch is its own PUT; removing a person is one DELETE
 * behind the card's own dialog. Every change shows its real outcome, then
 * the page reads again (`router.refresh()`), so nothing on screen is a
 * value the API did not return. All of it runs in the browser through the
 * typed client: the API refuses a mutation without the browser's origin.
 * The invite form shows only to someone the API lets invite; a member of a
 * household someone else owns is told who can instead.
 */
export function SharingBoard({ view }: { view: SharingView }) {
  const router = useRouter();
  const peopleHeadingId = useId();
  const sharedHeadingId = useId();
  const invitationsHeadingId = useId();
  const [isRefreshing, startRefresh] = useTransition();
  // The control whose request is in flight, the control whose change the page is reading
  // again, and the last outcome, each kept per person.
  const [busy, setBusy] = useState<PerPerson<Target>>({});
  const [settled, setSettled] = useState<PerPerson<Target>>({});
  const [outcomes, setOutcomes] = useState<PerPerson<Outcome>>({});
  // Once a read finishes, no control waits on it any more; adjusted while rendering
  // (not in an effect) so a later read never brings back an old pending state.
  const [wasRefreshing, setWasRefreshing] = useState(false);
  if (wasRefreshing !== isRefreshing) {
    setWasRefreshing(isRefreshing);
    if (!isRefreshing) setSettled({});
  }
  const [freshAuthFor, setFreshAuthFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<(GrantConfirmTarget & { person: PersonView }) | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  // Whether the confirm step is open, kept in a ref by the handlers that open and close it,
  // because grant() reads it after an await and the state in its closure may predate an Escape.
  const confirmShown = useRef(false);

  function openConfirm(next: GrantConfirmTarget & { person: PersonView }) {
    confirmShown.current = true;
    setConfirm(next);
    setConfirmError(undefined);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    confirmShown.current = false;
    setConfirmOpen(false);
    setConfirmError(undefined);
  }

  const pending = (personId: string, key: string) =>
    same(busy[personId], personId, key) || (isRefreshing && same(settled[personId], personId, key));
  const personBusy = (personId: string) =>
    busy[personId] !== undefined || (isRefreshing && settled[personId] !== undefined);

  function begin(target: Target) {
    setBusy((map) => withEntry(map, target.personId, target));
    setOutcomes((map) => withEntry(map, target.personId, undefined));
    setFreshAuthFor((personId) => (personId === target.personId ? null : personId));
    setNotice(null);
  }

  /** Ends one person's request; another card's request in flight keeps its own state. */
  function finish(target: Target) {
    setBusy((map) => withEntry(map, target.personId, undefined));
  }

  function setOutcome(next: Outcome) {
    setOutcomes((map) => withEntry(map, next.personId, next));
  }

  /** Reads the page again after a change; the changed control keeps its pending state until then. */
  function refresh(target: Target) {
    setSettled((map) => withEntry(map, target.personId, target));
    startRefresh(() => router.refresh());
  }

  /** Leaves for sign-in or the closing view when the session is gone; true when it did. */
  function left(result: Parameters<typeof leaveFor>[0]): boolean {
    const destination = leaveFor(result);
    if (destination === null) return false;
    goTo(destination);
    return true;
  }

  function changeGrant(person: PersonView, row: GrantView, checked: boolean) {
    if (personBusy(person.id)) return;
    if (checked) {
      openConfirm({ person, personName: person.name, row });
      return;
    }
    void revoke(person, row);
  }

  async function grant() {
    if (confirm === null) return;
    const { person, row } = confirm;
    // A request on this person's card is still in flight; the confirm button shows it as
    // pending (its `loading`), so a press now has nothing new to do.
    if (personBusy(person.id)) return;
    const target = { personId: person.id, key: row.key };
    begin(target);
    setConfirmError(undefined);
    const result = await attempt(() =>
      browserApiClient().PUT("/api/v1/sharing/grants/{personId}", {
        params: { path: { personId: person.id }, header: { "if-match": `"${person.version}"` } },
        body: {
          grants: [
            {
              category: row.category,
              level: row.offer,
              ...(row.childId === undefined ? {} : { childId: row.childId }),
            },
          ],
          policyVersion: SHARING_POLICY_VERSION,
          descriptionVersion: CURRENT_SHARING_DESCRIPTION_VERSION,
        },
      }),
    );
    finish(target);
    if (result.ok) {
      closeConfirm();
      setOutcome({
        ...target,
        kind: "done",
        text: copy.grant.on(person.name, grantPhrase(row.category, row.childName)),
      });
      refresh(target);
      return;
    }
    if (left(result)) return;
    if (needsFreshSignIn(result)) {
      // Not something a retry can fix: close the step and show the next one on the card.
      closeConfirm();
      setFreshAuthFor(person.id);
      return;
    }
    if (isStale(result)) {
      closeConfirm();
      setOutcome({ ...target, kind: "error", text: describeChangeFailure(result) });
      refresh(target);
      return;
    }
    // The step stays open to try again; if it was closed meanwhile, the row says it instead.
    if (confirmShown.current) setConfirmError(describeChangeFailure(result));
    else setOutcome({ ...target, kind: "error", text: describeChangeFailure(result) });
  }

  async function revoke(person: PersonView, row: GrantView) {
    const target = { personId: person.id, key: row.key };
    begin(target);
    const result = await attempt(() =>
      browserApiClient().DELETE("/api/v1/sharing/grants/{personId}/{category}", {
        params: {
          path: { personId: person.id, category: row.category },
          ...(row.childId === undefined ? {} : { query: { childId: row.childId } }),
        },
      }),
    );
    finish(target);
    if (result.ok) {
      setOutcome({
        ...target,
        kind: "done",
        text: copy.grant.off(person.name, grantPhrase(row.category, row.childName)),
      });
      refresh(target);
      return;
    }
    if (left(result)) return;
    setOutcome({ ...target, kind: "error", text: describeChangeFailure(result) });
    if (isStale(result)) refresh(target);
  }

  async function setNotify(person: PersonView, checked: boolean) {
    if (personBusy(person.id)) return;
    const target = { personId: person.id, key: "notify" };
    begin(target);
    const result = await attempt(() =>
      browserApiClient().PUT("/api/v1/sharing/notify", {
        params: { header: { "if-match": `"${person.version}"` } },
        body: { personId: person.id, notify: checked },
      }),
    );
    finish(target);
    if (result.ok) {
      setOutcome({
        ...target,
        kind: "done",
        text: checked ? copy.notify.on(person.name) : copy.notify.off(person.name),
      });
      refresh(target);
      return;
    }
    if (left(result)) return;
    setOutcome({ ...target, kind: "error", text: describeChangeFailure(result) });
    if (isStale(result)) refresh(target);
  }

  async function remove(person: PersonView) {
    if (personBusy(person.id)) return;
    const target = { personId: person.id, key: "remove" };
    begin(target);
    const result = await attempt(() =>
      browserApiClient().DELETE("/api/v1/sharing/people/{personId}", {
        params: { path: { personId: person.id } },
      }),
    );
    finish(target);
    if (result.ok) {
      setNotice(
        person.removal === "owner"
          ? copy.remove.left(person.name)
          : copy.remove.removed(person.name),
      );
      refresh(target);
      return;
    }
    if (left(result)) return;
    if (isCoGuardianRefusal(result)) {
      setOutcome({
        ...target,
        kind: "error",
        coGuardian: true,
        text: coGuardianText(person),
      });
      return;
    }
    setOutcome({ ...target, kind: "error", text: describeRemoveFailure(result, person.name) });
    if (result.status === 404) refresh(target);
  }

  function said(personId: string, key: string, kind: Outcome["kind"]): string | undefined {
    const outcome = outcomes[personId];
    return outcome !== undefined && outcome.kind === kind && same(outcome, personId, key)
      ? outcome.text
      : undefined;
  }

  function removeError(person: PersonView): ReactNode {
    const text = said(person.id, "remove", "error");
    if (text === undefined) return undefined;
    if (!outcomes[person.id]?.coGuardian) return text;
    return (
      <>
        {text} <TextLink href="/family">{copy.remove.familyLink}</TextLink>
      </>
    );
  }

  const { people } = view;

  return (
    <>
      {/* Above the list, so it stays when the person removed was the last one in it. */}
      {notice !== null ? (
        <InlineFeedback tone="success" cue>
          {notice}
        </InlineFeedback>
      ) : null}
      {people.length === 0 ? (
        <EmptyState
          heading={copy.empty.heading}
          why={copy.empty.why}
          action={
            <Button
              variant="secondary"
              onClick={() => document.getElementById(INVITE_EMAIL_ID)?.focus()}
            >
              {copy.empty.action}
            </Button>
          }
          className={styles.empty}
        />
      ) : (
        <section className={styles.section} aria-labelledby={peopleHeadingId}>
          <h2 id={peopleHeadingId} className={styles.sectionHeading}>
            {copy.people}
          </h2>
          <div className={styles.people}>
            {people.map((person) => (
              <PersonCard
                key={person.id}
                name={person.name}
                relation={person.relation}
                since={person.since ?? undefined}
                today={view.today ?? undefined}
                grants={person.rows.map((row) => ({
                  category: row.category,
                  id: row.key,
                  ...(row.childName === undefined ? {} : { childName: row.childName }),
                  checked: row.on,
                  ...(row.level === null ? {} : { level: grantLevelText(row.level) }),
                  loading: pending(person.id, row.key),
                  error: said(person.id, row.key, "error"),
                  done: said(person.id, row.key, "done"),
                }))}
                notify={person.notify}
                notifyHidden={person.notifyMode === "hidden"}
                notifyDisabled={person.notifyMode === "disabled"}
                notifyNote={notifyNoteFor(person)}
                notifyLoading={pending(person.id, "notify")}
                notifyError={said(person.id, "notify", "error")}
                notifyDone={said(person.id, "notify", "done")}
                onGrantChange={(grant, checked) => {
                  const row = person.rows.find((candidate) => candidate.key === grant.id);
                  if (row !== undefined) changeGrant(person, row, checked);
                }}
                onNotifyChange={(checked) => void setNotify(person, checked)}
                onRemove={() => void remove(person)}
                removeConsequence={<p>{removalText(person)}</p>}
                removeError={removeError(person)}
                errorCue
                loading={pending(person.id, "remove")}
                showPrivateNotes={false}
                className={styles.personCard}
              >
                {freshAuthFor === person.id ? (
                  <FreshSignIn sentence={copy.freshAuth.grant} />
                ) : null}
                {person.received.length > 0 ? (
                  <Received name={person.name} rows={person.received} />
                ) : null}
              </PersonCard>
            ))}
          </div>
        </section>
      )}

      {view.sharedWithYou.length > 0 ? (
        <section className={styles.section} aria-labelledby={sharedHeadingId}>
          <h2 id={sharedHeadingId} className={styles.sectionHeading}>
            {copy.sharedWithYou}
          </h2>
          <div className={styles.sharedCard}>
            <ul className={styles.receivedList}>
              {view.sharedWithYou.map((row) => (
                <li key={row.key}>
                  <span className={styles.receivedLabel}>{row.label}</span>
                  <span className={styles.receivedLevel}>{grantLevelText(row.level)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.note}>{copy.sharedWithYouNote}</p>
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby={invitationsHeadingId}>
        <h2 id={invitationsHeadingId} className={styles.sectionHeading}>
          {copy.invitations}
        </h2>
        <InvitationList invitations={view.invitations} />
        {view.invite.by === "self" ? (
          <InviteForm />
        ) : (
          <p className={styles.lede}>{copy.invite.ownerOnly(view.invite.owner)}</p>
        )}
      </section>

      <p className={styles.privateNotes}>{copy.privateNotes}</p>

      <GrantConfirm
        open={confirmOpen}
        target={confirm}
        onClose={closeConfirm}
        onConfirm={() => void grant()}
        loading={confirm !== null && personBusy(confirm.person.id)}
        error={confirmError}
      />
    </>
  );
}
