import { predictCycle, type CyclePrediction, type PeriodStart } from "./cycle";
import { addDays, compareDates, isCalendarDate, type CalendarDate } from "./dates";
import { GESTATION_DAYS, type DatingMethod } from "./pregnancy";

/**
 * Stage transitions and the pregnancy-ending rules of architecture 8.4. These
 * are pure functions over records: the API applies the returned record and
 * effects inside one transaction, and every client renders the projections
 * without recomputing who may see what. Getting any of this wrong either
 * reveals something she did not share or predicts nonsense, so each rule has
 * a test named after the behaviour it protects.
 */

/** Mirrors the `Stage` enum in `@tidefern/schemas`; core stays dependency free. */
export type Stage = "none" | "cycle" | "pregnancy" | "postpartum";

/** Why a pregnancy ended. Shown to nobody but her. */
export type EndedReason = "birth" | "loss" | "other";

export interface DueDateChange {
  previous: CalendarDate;
  next: CalendarDate;
  method: DatingMethod;
  /** ISO instant of the edit; it records when she acted, not a calendar fact. */
  changedAt: string;
}

export interface Pregnancy {
  id: string;
  subjectId: string;
  dueDate: CalendarDate;
  datingMethod: DatingMethod;
  /** ISO instant the record was created. */
  startedAt: string;
  /** Calendar date the pregnancy ended; period starts are compared against it. */
  endedAt: CalendarDate | null;
  endedReason: EndedReason | null;
  /** Every change ever made, oldest first, so the previous value stays visible to her. */
  dueDateChanges: DueDateChange[];
}

export interface EndPregnancyInput {
  endedAt: CalendarDate;
  reason: EndedReason;
}

/**
 * What the API must do alongside the record update, all in one transaction.
 * The names are deliberate: `cancelReminders` means every queued
 * `reminder.send` job for this pregnancy, and `notifyPartners` is always
 * false because an ending is hers to tell.
 */
export interface EndPregnancyEffects {
  stage: "postpartum" | "cycle";
  clearPredictions: true;
  cancelReminders: true;
  notifyPartners: false;
}

function stageForReason(reason: EndedReason): "postpartum" | "cycle" {
  return reason === "birth" ? "postpartum" : "cycle";
}

/** The stage a profile moves to once its pregnancy is over, or stays in while it continues. */
export function stageAfter(pregnancy: Pregnancy): Stage {
  if (pregnancy.endedAt === null) return "pregnancy";
  return stageForReason(pregnancy.endedReason ?? "other");
}

export function endPregnancy(
  pregnancy: Pregnancy,
  input: EndPregnancyInput,
): { pregnancy: Pregnancy; effects: EndPregnancyEffects } {
  if (!isCalendarDate(input.endedAt)) {
    throw new RangeError(`Invalid calendar date: ${input.endedAt}`);
  }
  if (pregnancy.endedAt !== null) {
    throw new Error("Pregnancy has already ended");
  }
  // Day 0 of gestation is the due date minus 280 days; an ending before it
  // would make every period ever logged count as a post-pregnancy start.
  if (compareDates(input.endedAt, addDays(pregnancy.dueDate, -GESTATION_DAYS)) < 0) {
    throw new RangeError("Ending date is before the pregnancy began");
  }
  const ended: Pregnancy = { ...pregnancy, endedAt: input.endedAt, endedReason: input.reason };
  return {
    pregnancy: ended,
    effects: {
      stage: stageForReason(input.reason),
      clearPredictions: true,
      cancelReminders: true,
      notifyPartners: false,
    },
  };
}

export interface DueDateChangeInput {
  next: CalendarDate;
  method: DatingMethod;
  changedAt: string;
}

/** An ISO instant the runtime can parse; the history row keeps it verbatim. */
function isInstant(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Replaces the due date and appends the change to history. The same date
 * again is not a change, so nothing is appended. Week numbers and reminder
 * dates are derived from `dueDate`, so they follow without extra bookkeeping.
 * An ended pregnancy keeps its dates: nothing week-shaped is generated after
 * a loss, and a paused partner view must not change under her.
 */
export function changeDueDate(pregnancy: Pregnancy, input: DueDateChangeInput): Pregnancy {
  if (!isCalendarDate(input.next)) throw new RangeError(`Invalid calendar date: ${input.next}`);
  if (!isInstant(input.changedAt)) throw new RangeError("Invalid instant for changedAt");
  if (pregnancy.endedAt !== null) throw new Error("Pregnancy has already ended");
  if (input.next === pregnancy.dueDate && input.method === pregnancy.datingMethod) {
    return pregnancy;
  }
  const change: DueDateChange = {
    previous: pregnancy.dueDate,
    next: input.next,
    method: input.method,
    changedAt: input.changedAt,
  };
  return {
    ...pregnancy,
    dueDate: input.next,
    datingMethod: input.method,
    dueDateChanges: [...pregnancy.dueDateChanges, change],
  };
}

export type PregnancyViewer = "owner" | "partner";

/** Her own view: the whole record plus whether it is still active. */
export type OwnerPregnancyView = Pregnancy & { status: "active" | "ended" };

/**
 * A grantee's view carries only what `pregnancy.overview` covers: the due
 * date, from which a client derives the week. Once the pregnancy has ended the
 * view is the neutral paused state with no dates at all, until she shares
 * again or revokes the grant.
 */
export type PartnerPregnancyView =
  { status: "active"; id: string; dueDate: CalendarDate } | { status: "paused" };

export function projectPregnancy(pregnancy: Pregnancy, viewer: "owner"): OwnerPregnancyView;
export function projectPregnancy(pregnancy: Pregnancy, viewer: "partner"): PartnerPregnancyView;
export function projectPregnancy(
  pregnancy: Pregnancy,
  viewer: PregnancyViewer,
): OwnerPregnancyView | PartnerPregnancyView;
export function projectPregnancy(
  pregnancy: Pregnancy,
  viewer: PregnancyViewer,
): OwnerPregnancyView | PartnerPregnancyView {
  const ended = pregnancy.endedAt !== null;
  if (viewer === "owner") return { ...pregnancy, status: ended ? "ended" : "active" };
  if (ended) return { status: "paused" };
  return { status: "active", id: pregnancy.id, dueDate: pregnancy.dueDate };
}

/**
 * The cycle prediction after a pregnancy: none while it continues, none after
 * it ends until a period start dated after `endedAt` is logged, and from then
 * on `predictCycle` with `since`, which widens the first estimate to at least
 * five days of uncertainty.
 */
export function cyclePredictionAfter(
  starts: PeriodStart[],
  pregnancy: Pregnancy,
): CyclePrediction | null {
  if (pregnancy.endedAt === null) return null;
  return predictCycle(starts, { since: pregnancy.endedAt });
}

/** The one action on the quiet `/today` card after a pregnancy ends; no fertile window is drawn beside it. */
export const QUIET_CARD_ACTION = "log a period when it comes";

export type BodyQuestionId = "last_period_start" | "due_date" | "dating_method" | "birth_date";

export interface BodyQuestion {
  id: BodyQuestionId;
  prompt: string;
  /** She may skip it and log later; the empty state carries the next action. */
  optional: boolean;
}

const LAST_PERIOD_START: BodyQuestion = {
  id: "last_period_start",
  prompt: "When did your last period start?",
  optional: true,
};

/**
 * Onboarding questions by stage. Someone with the `none` stage is here for
 * somebody else and is never asked about her own body.
 */
export function bodyQuestionsFor(stage: Stage): BodyQuestion[] {
  switch (stage) {
    case "none":
      return [];
    case "cycle":
      return [LAST_PERIOD_START];
    case "pregnancy":
      return [
        { id: "due_date", prompt: "When is your due date?", optional: false },
        { id: "dating_method", prompt: "How was that date worked out?", optional: false },
      ];
    case "postpartum":
      return [
        { id: "birth_date", prompt: "When was the birth?", optional: false },
        {
          id: "last_period_start",
          prompt: "If a period has come since, when did it start?",
          optional: true,
        },
      ];
  }
}
