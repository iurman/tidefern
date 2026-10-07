"use client";
import { todayIn, weekStartFor } from "@tidefern/core";
import type { PregnancyDatingInput, Stage } from "@tidefern/schemas";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { TideLine } from "@/components/public/tide-line";
import { Button } from "@/components/ui/button";
import type { Processor } from "@/components/ui/consent-record";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { browserApiClient } from "@/lib/api-browser";
import { authClient, passkeysAvailable, SIGN_IN_PATH, SIGNED_IN_PATH } from "@/lib/auth-client";
import type { PasskeyHost } from "@/lib/auth-client";
import { invitationLanding, takeInvitationFragment } from "@/lib/invitation-fragment";
import { haptic, play } from "@/lib/sound";
import { CONSENT_CATEGORIES, asksConsent } from "./consent";
import { ConsentStep } from "./consent-step";
import { joinWords, welcomeCopy } from "./copy";
import { dateEntryIn } from "./date-entry";
import { dateOrderFor } from "./dates";
import type { DateOrder } from "./dates";
import { DatesStep } from "./dates-step";
import {
  EMPTY_DRAFT,
  checkAgreements,
  checkDates,
  checkStage,
  checkZone,
  displayNameFrom,
} from "./draft";
import type { Draft, FieldErrors } from "./draft";
import { leaveTo } from "./leave";
import { PasskeyStep } from "./passkey-step";
import { StageStep } from "./stage-step";
import { StepIndicator } from "./step-indicator";
import { stepAfter, stepBefore, stepName, stepsFor } from "./steps";
import type { StepId } from "./steps";
import {
  addChild,
  createProfile,
  planWrites,
  recordConsent,
  startPregnancy,
  writePeriodDay,
} from "./writes";
import type { WriteFailure, WriteId, WriteOutcome } from "./writes";
import { browserZone, ZoneStep } from "./zone-step";
import styles from "./welcome-flow.module.css";

const copy = welcomeCopy;
const actions = welcomeCopy.actions;

/** Nothing here changes while a page is open, so there is nothing to subscribe to. */
function subscribeToNothing() {
  return () => {};
}

/** The first day of her week from the browser's locale (core), Monday when it names none. */
function localWeekStart(): number {
  try {
    return weekStartFor(navigator.language);
  } catch {
    return 1;
  }
}

/** One write's key and record id, minted once for the body it was minted for. */
interface Intent {
  body: string;
  key: string;
  id: string;
}

interface Progress {
  /** The write running now. */
  current: WriteId | null;
  /** The writes that landed, in order, for the "saved so far" line. */
  done: readonly WriteId[];
  /** The consent's categories as recorded, so a changed stage asks again. */
  consentFor: string | null;
  /** The write that stopped the run; cleared when a retry starts, so each failure is new. */
  failure: { write: WriteId; failure: WriteFailure } | null;
}

const NO_PROGRESS: Progress = { current: null, done: [], consentFor: null, failure: null };

const DONE: WriteOutcome = { ok: true };

export interface WelcomeFlowProps {
  /** The server's instant when it rendered the page, ISO 8601: today and the offsets are read at it. */
  now: string;
  /** Every processor the consent names, with what it receives. */
  processors: Processor[];
}

/**
 * Onboarding (task H1, DESIGN.md 3.2): time zone, stage, the dates core asks
 * for that stage, the collection consent as its own step with the terms and
 * the age beneath it, and an optional passkey. One column at every width.
 *
 * Saving order (the brief's ruling): steps 1 to 3 are held in memory only,
 * never in storage, and the page says so. The consent step writes the
 * consent, then the profile with the age attestation, then her dates, her
 * pregnancy or her child, each with its own pending line and failure, and a
 * retry that resumes at the write that failed, never repeating one that
 * landed and sending the same key and record id for the same body. Until
 * the profile is saved she can still go back; after it, the earlier steps
 * are settled and a fact that will not save can be skipped and added later.
 *
 * An `#invitation=` fragment is taken out of the address bar on mount and
 * held here only, and onboarding then ends on the sharing screen with it
 * instead of Today.
 */
export function WelcomeFlow({ now, processors }: WelcomeFlowProps) {
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  // The server counts the passkey step, as almost every browser has WebAuthn,
  // so the count only changes on hydration in a browser without it.
  const passkeys = useSyncExternalStore(
    subscribeToNothing,
    () => passkeysAvailable(window as unknown as PasskeyHost),
    () => true,
  );
  const order = useSyncExternalStore(
    subscribeToNothing,
    () => dateOrderFor(navigator.language),
    (): DateOrder => "mdy",
  );
  const suggestion = useSyncExternalStore(subscribeToNothing, browserZone, () => null);

  const headingId = useId();
  const [step, setStep] = useState<StepId>("zone");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [refusals, setRefusals] = useState(0);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  /** Whether she has moved between steps: focus and the panel's entrance follow a move, never the load. */
  const [moved, setMoved] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const invitation = useRef<string | null>(null);
  const intents = useRef(new Map<WriteId, Intent>());
  const landed = useRef(new Set<WriteId>());
  const skipped = useRef(new Set<WriteId>());
  const consentFor = useRef<string | null>(null);
  const running = useRef(false);
  const dating = useRef<PregnancyDatingInput | null>(null);
  const displayName = useRef<string | null | undefined>(undefined);

  const steps = stepsFor(draft.stage, passkeys);
  const today = draft.timeZone === "" ? null : todayIn(draft.timeZone, new Date(now));
  const writing = progress.current !== null;
  const settled = progress.done.includes("profile");

  useEffect(() => {
    // React runs mount effects twice in development and both reads return the token: keep the first.
    const token = takeInvitationFragment();
    if (token !== null && invitation.current === null) invitation.current = token;
  }, []);

  useEffect(() => {
    if (!moved) return;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [step, moved]);

  useEffect(() => {
    if (refusals === 0) return;
    // The first field that stops her takes focus, which reads its error out. Not the time zone
    // combobox: focus opens its list over the error line, so focus stays put and the line shows.
    formRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"]:not([role="combobox"]), fieldset[data-invalid] input',
      )
      ?.focus();
  }, [refusals]);

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function chooseStage(stage: Stage) {
    if (stage === draft.stage) return;
    // Another stage lists other categories, so its consent is asked again unless already recorded.
    update({ stage, consent: progress.consentFor === JSON.stringify(CONSENT_CATEGORIES[stage]) });
  }

  function goTo(next: StepId) {
    setMoved(true);
    setErrors({});
    setStep(next);
  }

  /** Shows what stops her, with the error cue once beside the words (DESIGN.md 7). */
  function refuse(found: FieldErrors) {
    setErrors(found);
    setRefusals((count) => count + 1);
    play("error");
    haptic("error");
  }

  function finish() {
    const landing = invitation.current === null ? null : invitationLanding(invitation.current);
    leaveTo(landing ?? SIGNED_IN_PATH);
  }

  function intentFor(write: WriteId, body: unknown): Intent {
    const json = JSON.stringify(body);
    const held = intents.current.get(write);
    if (held !== undefined && held.body === json) return held;
    const client = browserApiClient();
    const fresh: Intent = { body: json, key: client.newId(), id: client.newId() };
    intents.current.set(write, fresh);
    return fresh;
  }

  /** The name she signed up with, as the profile's display name; null when it cannot be read. */
  async function profileName(): Promise<string | null> {
    if (displayName.current === undefined) {
      try {
        const { data } = await authClient.getSession();
        displayName.current = displayNameFrom(data?.user?.name);
      } catch {
        displayName.current = null;
      }
    }
    return displayName.current;
  }

  async function perform(write: WriteId, stage: Stage): Promise<WriteOutcome> {
    const client = browserApiClient();
    switch (write) {
      case "consent": {
        const categories = CONSENT_CATEGORIES[stage];
        const outcome = await recordConsent(client, {
          categories,
          key: intentFor("consent", categories).key,
        });
        if (outcome.ok) consentFor.current = JSON.stringify(categories);
        return outcome;
      }
      case "profile":
        return createProfile(client, {
          displayName: await profileName(),
          timeZone: draft.timeZone,
          stage,
          weekStart: localWeekStart(),
        });
      case "start":
        return draft.start === null
          ? DONE
          : writePeriodDay(client, { date: draft.start, flow: draft.startFlow });
      case "pregnancy": {
        const input = dating.current;
        if (input === null) return { ok: false, failure: { cause: "refused", status: 0 } };
        const intent = intentFor("pregnancy", input);
        return startPregnancy(client, { id: intent.id, key: intent.key, dating: input });
      }
      case "child": {
        if (draft.birth === null) return { ok: false, failure: { cause: "refused", status: 0 } };
        const child = { displayName: draft.childName.trim(), dateOfBirth: draft.birth };
        const intent = intentFor("child", child);
        return addChild(client, { id: intent.id, key: intent.key, ...child });
      }
      case "since":
        return draft.since === null
          ? DONE
          : writePeriodDay(client, { date: draft.since, flow: draft.sinceFlow });
    }
  }

  async function runWrites(stage: Stage) {
    if (running.current) return;
    running.current = true;
    const consentKey = JSON.stringify(CONSENT_CATEGORIES[stage]);
    const plan = planWrites({
      stage,
      consent: asksConsent(stage),
      start: draft.start !== null,
      since: draft.since !== null,
    });
    setProgress((current) => ({ ...current, failure: null }));
    for (const write of plan) {
      const already =
        write === "consent" ? consentFor.current === consentKey : landed.current.has(write);
      if (already || skipped.current.has(write)) continue;
      setProgress((current) => ({ ...current, current: write }));
      const outcome = await perform(write, stage);
      if (!outcome.ok) {
        running.current = false;
        setProgress((current) => ({
          ...current,
          current: null,
          failure: { write, failure: outcome.failure },
        }));
        return;
      }
      landed.current.add(write);
      // `current` stays set until the next write replaces it, so the button never flickers back.
      setProgress((current) => ({
        ...current,
        done: current.done.includes(write) ? current.done : [...current.done, write],
        consentFor: write === "consent" ? consentKey : current.consentFor,
      }));
    }
    running.current = false;
    setProgress((current) => ({ ...current, current: null }));
    if (stepAfter(steps, "consent") === "passkey") goTo("passkey");
    else finish();
  }

  function skip() {
    const failure = progress.failure;
    if (failure === null || draft.stage === null) return;
    skipped.current.add(failure.write);
    void runWrites(draft.stage);
  }

  function onContinue() {
    if (writing) return;
    switch (step) {
      case "zone": {
        const checked = checkZone(draft);
        if (!checked.ok) return refuse(checked.errors);
        break;
      }
      case "stage": {
        const checked = checkStage(draft);
        if (!checked.ok) return refuse(checked.errors);
        break;
      }
      case "dates": {
        if (today === null) return;
        const checked = checkDates(draft, today, (key) => dateEntryIn(formRef.current, key));
        if (!checked.ok) return refuse(checked.errors);
        dating.current = checked.dating ?? null;
        break;
      }
      case "consent": {
        if (draft.stage === null) return;
        const checked = checkAgreements(draft, asksConsent(draft.stage));
        if (!checked.ok) return refuse(checked.errors);
        setErrors({});
        void runWrites(draft.stage);
        return;
      }
      case "passkey":
        return finish();
    }
    const next = stepAfter(steps, step);
    if (next !== null) goTo(next);
  }

  function back() {
    const previous = stepBefore(steps, step);
    if (previous === null) return;
    // Going back puts the failure away; Continue on the consent step resumes the writes.
    setProgress((current) => ({ ...current, failure: null }));
    goTo(previous);
  }

  const stage = draft.stage;
  const failure = step === "consent" ? progress.failure : null;
  // True until the first write is sent; from then on something may already be saved.
  const nothingSent = progress.done.length === 0 && progress.current === null && failure === null;
  const signedOut = failure?.failure.cause === "session";
  const factFailed = failure !== null && failure.write !== "consent" && failure.write !== "profile";
  const canSkip = factFailed && settled && !signedOut;
  const showBack =
    step !== "passkey" &&
    stepBefore(steps, step) !== null &&
    !(step === "consent" && settled) &&
    !writing;
  const primary =
    failure !== null
      ? actions.tryAgain
      : step === "consent" && stepAfter(steps, step) === null
        ? actions.finish
        : actions.continue;

  function heading(): string {
    switch (step) {
      case "zone":
        return copy.zone.heading;
      case "stage":
        return copy.stage.heading;
      case "dates":
        return copy.dates.heading;
      case "consent":
        return stage !== null && !asksConsent(stage)
          ? copy.consent.headingWithoutConsent
          : copy.consent.heading;
      case "passkey":
        return copy.passkey.heading;
    }
  }

  function body() {
    switch (step) {
      case "zone":
        return (
          <ZoneStep
            value={draft.timeZone}
            onChange={(timeZone) => update({ timeZone })}
            error={errors.zone}
            now={now}
            suggestion={suggestion}
          />
        );
      case "stage":
        return (
          <StageStep
            value={stage}
            onChange={chooseStage}
            error={errors.stage}
            labelledBy={headingId}
          />
        );
      case "dates":
        return today === null ? null : (
          <DatesStep draft={draft} update={update} errors={errors} today={today} order={order} />
        );
      case "consent":
        return stage === null ? null : (
          <ConsentStep
            stage={stage}
            draft={draft}
            update={update}
            errors={errors}
            processors={processors}
            recording={progress.current === "consent"}
            recorded={progress.consentFor === JSON.stringify(CONSENT_CATEGORIES[stage])}
            settled={settled}
            writing={writing}
          />
        );
      case "passkey":
        return <PasskeyStep onFinish={finish} />;
    }
  }

  function failureLines() {
    if (failure === null) return null;
    const writes = copy.writes;
    const sentence = signedOut
      ? writes.next.session
      : `${writes.failed[failure.write]} ${writes.next[failure.failure.cause]}`;
    const saved = progress.done.map((write) => writes.saved[write]);
    const later = canSkip ? writes.later[failure.write as keyof typeof writes.later] : undefined;
    return (
      <div className={styles.failure}>
        <InlineFeedback tone="error" cue>
          {sentence}
        </InlineFeedback>
        {saved.length > 0 ? (
          <p className={styles.note}>{writes.savedSoFar(joinWords(saved))}</p>
        ) : null}
        {later ? <p className={styles.note}>{later}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      {nothingSent && step !== "passkey" ? <p className={styles.memory}>{copy.memory}</p> : null}
      <StepIndicator
        steps={steps.map((id) => ({ id, name: stepName(id, stage) }))}
        current={step}
      />
      <TideLine className={styles.tide} />
      <form
        key={step}
        ref={formRef}
        className={styles.step}
        data-entering={moved ? true : undefined}
        method="post"
        noValidate
        inert={!hydrated}
        aria-labelledby={headingId}
        onSubmit={(event) => {
          event.preventDefault();
          onContinue();
        }}
      >
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
          {heading()}
        </h2>
        {body()}
        {step === "passkey" ? null : (
          <div className={styles.foot}>
            <div className={styles.actions}>
              {showBack ? (
                <Button type="button" variant="secondary" onClick={back}>
                  {actions.back}
                </Button>
              ) : null}
              {canSkip ? (
                <Button type="button" variant="secondary" onClick={skip}>
                  {actions.skip}
                </Button>
              ) : null}
              {signedOut ? (
                <Button href={SIGN_IN_PATH}>{actions.signInAgain}</Button>
              ) : (
                <Button type="submit" loading={writing} loadingText={actions.saving}>
                  {primary}
                </Button>
              )}
            </div>
            <p className={styles.status} role="status">
              {progress.current === null ? "" : copy.writes.pending[progress.current]}
            </p>
            {failureLines()}
          </div>
        )}
      </form>
    </div>
  );
}
