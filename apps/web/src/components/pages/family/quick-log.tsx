"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { MeasurementInput } from "@/components/ui/measurement-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { browserApiClient } from "@/lib/api-browser";
import { failureLine, familyCopy } from "./copy";
import { Elapsed } from "./elapsed";
import {
  attemptFor,
  endSleep,
  keepsAttempt,
  logEvent,
  removeEvent,
  type Attempt,
  type Failure,
  type NewEvent,
  type Result,
} from "./mutations";
import type { ChildEvent, DiaperContents, FeedMethod, FeedSide, UnitSystem } from "./types";
import styles from "./family.module.css";

const copy = familyCopy.log;

/** How long Undo stays after a log (DESIGN.md 5.1 step 5). */
export const UNDO_WINDOW_MS = 10_000;

/** The API's largest bottle (ChildEventInput.quantityMl). */
const MAX_ML = 2000;

type Sheet = "feed" | "sleep" | "diaper";

export interface QuickLogProps {
  childId: string;
  childName: string;
  /** Today in the profile's zone, from the API: the day every event here is filed under. */
  today: string;
  units: UnitSystem;
  /** She may undo, which is a delete: guardians alone. */
  canDelete: boolean;
  /** The sleep going on now, which the Sleep control ends instead of starting another. */
  ongoingSleep: Pick<ChildEvent, "id" | "date" | "startedAt" | "note" | "version"> | null;
  /** Its start as a time of day in the profile's zone, from the server. */
  ongoingSince: string | null;
}

interface Notice {
  tone: "success" | "error";
  text: string;
  id: number;
  /** The event the Undo deletes, while the window is open. */
  undo?: string;
}

interface Timer {
  startedAt: string;
  /** Frozen at the press of Stop, so a retry sends the same feed. */
  endedAt: string | null;
}

const methodOptions = (["breast", "bottle", "solids"] as const).map((value) => ({
  value,
  label: copy.methods[value],
}));
const sideOptions = (["left", "right", "both"] as const).map((value) => ({
  value,
  label: copy.sides[value],
}));
const contentOptions = (["wet", "dirty", "mixed"] as const).map((value) => ({
  value,
  label: copy.contentOptions[value],
}));

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Quick logging for one child (DESIGN.md 3.6): Feed, Sleep and Diaper
 * below the summary card, each opening the shared bottom sheet (a centered
 * dialog from 1024 px). A breast feed's timer runs on the client and is
 * posted once, at Stop, with both instants; it keeps running if the sheet is
 * closed. A sleep starts now and stays open until it is ended here. Every
 * write goes through the browser client with its attempt kept across
 * retries of the same body, shows "Saving" while it runs, closes the sheet
 * with a short line and an Undo (guardians) when it lands, keeps the sheet
 * open with what to do next when it does not, and re-reads the page with
 * `router.refresh()`, so the card only ever shows what the API returned.
 */
export function QuickLog({
  childId,
  childName,
  today,
  units,
  canDelete,
  ongoingSleep,
  ongoingSince,
}: QuickLogProps) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [method, setMethod] = useState<FeedMethod | null>(null);
  const [side, setSide] = useState<FeedSide | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [timer, setTimer] = useState<Timer | null>(null);
  const [contents, setContents] = useState<DiaperContents | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  const [fieldError, setFieldError] = useState<{ method?: string; amount?: string }>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [undoing, setUndoing] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  /** A sleep's start, frozen at the first press of Start sleep so a retry sends the same sleep. */
  const sleepStart = useRef<string | null>(null);
  /** One write at a time; a ref, because a second press can land before React re-renders. */
  const busy = useRef(false);
  const lines = useRef(0);

  useEffect(() => {
    // An Undo she started keeps its control until it answers, even past the window.
    if (notice?.undo === undefined || undoing) return undefined;
    const timeout = window.setTimeout(
      () => setNotice((current) => (current === null ? null : { ...current, undo: undefined })),
      UNDO_WINDOW_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [notice?.undo, notice?.id, undoing]);

  function nextId(): number {
    lines.current += 1;
    return lines.current;
  }

  function open(next: Sheet) {
    setSheet(next);
    setError(null);
    setFieldError({});
  }

  function close() {
    setSheet(null);
    setError(null);
    setFieldError({});
    sleepStart.current = null;
  }

  /**
   * Sends one write. On success: the sheet closes, the line says so and the
   * page reads again. On failure the sheet stays open with what to do next;
   * the attempt is kept only when the request may have landed.
   */
  async function run<T>(
    send: () => Promise<Result<T>>,
    lineFor: (failure: Failure) => string,
    onSuccess: (value: T) => Notice,
  ): Promise<boolean> {
    if (busy.current) return false;
    setError(null);
    if (offline()) {
      setError({ text: familyCopy.failure.offline, id: nextId() });
      return false;
    }
    busy.current = true;
    setPending(true);
    const result = await send();
    busy.current = false;
    setPending(false);
    if (result.ok) {
      attempt.current = null;
      sleepStart.current = null;
      setSheet(null);
      setNotice(onSuccess(result.value));
      router.refresh();
      return true;
    }
    if (!keepsAttempt(result)) attempt.current = null;
    setError({ text: lineFor(result), id: nextId() });
    return false;
  }

  function create(body: NewEvent, kind: "feed" | "sleep" | "diaper"): Promise<boolean> {
    const client = browserApiClient();
    const current = attemptFor(client, attempt.current, body);
    attempt.current = current;
    return run(
      () => logEvent(client, childId, body, current),
      (failure) => failureLine(failure, copy.failed[kind]),
      (eventId) => ({
        tone: "success",
        text: copy.saved[kind],
        id: nextId(),
        ...(canDelete ? { undo: eventId } : {}),
      }),
    );
  }

  async function saveFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (method === null) {
      setFieldError({ method: copy.chooseMethod });
      return;
    }
    if (method === "bottle" && volume !== null && (volume < 1 || volume > MAX_ML)) {
      setFieldError({
        amount: units === "imperial" ? copy.amountTooMuchImperial : copy.amountTooMuch,
      });
      return;
    }
    setFieldError({});
    const timed = method === "breast" && timer !== null;
    const endedAt = timed ? (timer.endedAt ?? new Date().toISOString()) : null;
    if (timed && timer.endedAt === null) setTimer({ ...timer, endedAt });
    const body: NewEvent = {
      kind: "feed",
      date: today,
      feedMethod: method,
      ...(method === "breast" && side !== null ? { side } : {}),
      ...(method === "bottle" && volume !== null ? { quantityMl: volume } : {}),
      ...(timed && endedAt !== null ? { startedAt: timer.startedAt, endedAt } : {}),
    };
    if (await create(body, "feed")) {
      setMethod(null);
      setSide(null);
      setVolume(null);
      setTimer(null);
    }
  }

  async function saveDiaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: NewEvent = {
      kind: "diaper",
      date: today,
      ...(contents === null ? {} : { diaperContents: contents }),
    };
    if (await create(body, "diaper")) setContents(null);
  }

  async function saveSleep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ongoingSleep === null) {
      sleepStart.current ??= new Date().toISOString();
      await create({ kind: "sleep", date: today, startedAt: sleepStart.current }, "sleep");
      return;
    }
    const client = browserApiClient();
    await run(
      () => endSleep(client, childId, ongoingSleep, new Date().toISOString()),
      // A sleep ended or changed elsewhere answers 409: Try again would only meet it again.
      (failure) =>
        failure.kind === "conflict"
          ? copy.sleepConflict
          : failureLine(failure, copy.failed.endSleep),
      () => ({ tone: "success", text: copy.sleepEnded, id: nextId() }),
    );
  }

  async function undo(eventId: string) {
    if (busy.current) return;
    busy.current = true;
    setUndoing(true);
    const result = await removeEvent(browserApiClient(), childId, eventId);
    busy.current = false;
    setUndoing(false);
    if (result.ok) {
      setNotice({ tone: "success", text: copy.undone, id: nextId() });
      router.refresh();
      return;
    }
    setNotice({
      tone: "error",
      text: failureLine(result, copy.undoFailed),
      id: nextId(),
      undo: eventId,
    });
  }

  const timing = timer !== null && timer.endedAt === null;
  const title =
    sheet === "feed"
      ? copy.feedTitle(childName)
      : sheet === "diaper"
        ? copy.diaperTitle(childName)
        : ongoingSleep !== null
          ? copy.endSleepTitle(childName)
          : copy.sleepTitle(childName);
  // The space sits outside the hidden words, so every accessible name reads "Feed for Ilo".
  const suffix = (
    <>
      {" "}
      <span className="sr-only">{copy.forChild(childName)}</span>
    </>
  );
  const failure =
    error === null ? null : (
      <InlineFeedback key={error.id} tone="error" cue>
        {error.text}
      </InlineFeedback>
    );

  return (
    <div className={styles.log}>
      <div className={styles.logActions}>
        <Button variant="secondary" onClick={() => open("feed")}>
          {copy.feed}
          {suffix}
        </Button>
        <Button variant="secondary" onClick={() => open("sleep")}>
          {ongoingSleep !== null ? copy.endSleep : copy.sleep}
          {suffix}
        </Button>
        <Button variant="secondary" onClick={() => open("diaper")}>
          {copy.diaper}
          {suffix}
        </Button>
      </div>
      {timer !== null && sheet !== "feed" ? (
        <p className={styles.timerLine}>
          {timing ? copy.timerRunning : copy.timerStopped}{" "}
          <Elapsed start={timer.startedAt} end={timer.endedAt} className={styles.tabular} />
        </p>
      ) : null}
      {notice !== null ? (
        <div className={styles.notice}>
          <InlineFeedback key={notice.id} tone={notice.tone} cue>
            {notice.text}
          </InlineFeedback>
          {notice.undo !== undefined ? (
            <Button
              variant="quiet"
              icon="undo"
              className={styles.steady}
              loading={undoing}
              loadingText={copy.undoing}
              onClick={() => void undo(notice.undo as string)}
            >
              {copy.undo}
            </Button>
          ) : null}
        </div>
      ) : null}
      <BottomSheet open={sheet !== null} onClose={close} title={title}>
        {sheet === "feed" ? (
          <form className={styles.sheetForm} onSubmit={saveFeed} noValidate>
            <SegmentedControl<FeedMethod | "">
              label={copy.method}
              options={methodOptions}
              value={method ?? ""}
              onChange={(value) => {
                setMethod(value === "" ? null : value);
                setFieldError({});
              }}
              error={fieldError.method}
              disabled={timing}
            />
            {method === "breast" ? (
              <>
                <SegmentedControl<FeedSide | "">
                  label={copy.side}
                  options={sideOptions}
                  value={side ?? ""}
                  onChange={(value) => setSide(value === "" ? null : value)}
                />
                <div className={styles.timer}>
                  <p className={styles.timerLabel}>{copy.timer}</p>
                  <p className={styles.timerValue}>
                    {timer === null ? (
                      <span className={styles.tabular}>00:00</span>
                    ) : (
                      <Elapsed
                        start={timer.startedAt}
                        end={timer.endedAt}
                        className={styles.tabular}
                      />
                    )}
                  </p>
                  <p className={styles.help}>{copy.timerHelp}</p>
                  <div className={styles.sheetActions}>
                    {timer === null ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setTimer({ startedAt: new Date().toISOString(), endedAt: null })
                        }
                      >
                        {copy.startTimer}
                      </Button>
                    ) : (
                      <Button variant="quiet" onClick={() => setTimer(null)} disabled={pending}>
                        {copy.cancelTimer}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : null}
            {method === "bottle" ? (
              <MeasurementInput
                label={copy.amount}
                help={copy.amountHelp}
                kind="volume"
                value={volume}
                onChange={setVolume}
                defaultUnit={units}
                error={fieldError.amount}
              />
            ) : null}
            {failure}
            <div className={styles.sheetActions}>
              <Button
                type="submit"
                className={styles.steady}
                loading={pending}
                loadingText={copy.saving}
              >
                {timing ? copy.stopTimer : copy.save}
              </Button>
            </div>
          </form>
        ) : null}
        {sheet === "diaper" ? (
          <form className={styles.sheetForm} onSubmit={saveDiaper} noValidate>
            <SegmentedControl<DiaperContents | "">
              label={copy.contents}
              options={contentOptions}
              value={contents ?? ""}
              onChange={(value) => setContents(value === "" ? null : value)}
            />
            <p className={styles.help}>{copy.contentsHelp}</p>
            {failure}
            <div className={styles.sheetActions}>
              <Button
                type="submit"
                className={styles.steady}
                loading={pending}
                loadingText={copy.saving}
              >
                {copy.save}
              </Button>
            </div>
          </form>
        ) : null}
        {sheet === "sleep" ? (
          <form className={styles.sheetForm} onSubmit={saveSleep} noValidate>
            <p className={styles.sheetText}>
              {ongoingSleep !== null && ongoingSince !== null
                ? copy.asleepSince(ongoingSince)
                : copy.sleepStarts(childName)}
            </p>
            {failure}
            <div className={styles.sheetActions}>
              <Button
                type="submit"
                className={styles.steady}
                loading={pending}
                loadingText={ongoingSleep !== null ? copy.ending : copy.starting}
              >
                {ongoingSleep !== null ? copy.endSleepAction : copy.startSleep}
              </Button>
            </div>
          </form>
        ) : null}
      </BottomSheet>
    </div>
  );
}
