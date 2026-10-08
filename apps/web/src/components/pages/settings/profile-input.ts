import type { NotificationDetail, Stage, Units } from "@tidefern/schemas";
import { settingsCopy } from "./copy";

/**
 * The profile as Settings edits it (task E2's `PUT /v1/me/profile`): the
 * route replaces the whole record and fills every field a body leaves out
 * with its default (units metric, notification detail generic, week start
 * Monday, no display name). So a group that changed one field still sends
 * all of them, taken from the last profile the API returned, with If-Match
 * set to that profile's version.
 */

/** Every field the PUT replaces. Week start is not shown in Settings, but it is always resent. */
export interface ProfileFields {
  displayName: string | null;
  timeZone: string;
  stage: Stage;
  weekStart: number;
  units: Units;
  notificationDetail: NotificationDetail;
}

/** The profile as last read or saved, with the version the next If-Match carries. */
export interface ProfileSnapshot extends ProfileFields {
  version: number;
}

/** What one group changes; everything it leaves out keeps its saved value. */
export type ProfileChange = Partial<ProfileFields>;

/** The longest display name the API keeps (packages/schemas ProfileInput). */
export const DISPLAY_NAME_MAX = 80;

/** The fields of a profile the API answered with, without its timestamps. */
export function snapshotOf(profile: ProfileSnapshot): ProfileSnapshot {
  return {
    displayName: profile.displayName,
    timeZone: profile.timeZone,
    stage: profile.stage,
    weekStart: profile.weekStart,
    units: profile.units,
    notificationDetail: profile.notificationDetail,
    version: profile.version,
  };
}

/**
 * The body of the next PUT: the whole record, every field resent from the
 * saved profile with the change on top. A display name of null is a change
 * (clearing the name), so it is told apart from a change that leaves the
 * name out.
 */
export function profileBody(saved: ProfileFields, change: ProfileChange): ProfileFields {
  return {
    displayName: change.displayName !== undefined ? change.displayName : saved.displayName,
    timeZone: change.timeZone ?? saved.timeZone,
    stage: change.stage ?? saved.stage,
    weekStart: change.weekStart ?? saved.weekStart,
    units: change.units ?? saved.units,
    notificationDetail: change.notificationDetail ?? saved.notificationDetail,
  };
}

/** The If-Match value: the version quoted, the way the profile's ETag carries it. */
export function ifMatchFor(version: number): string {
  return `"${version}"`;
}

/** The display name as the API keeps it: trimmed, and null when nothing is left. */
export function normalizeDisplayName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** What one PUT came back with, before it means anything to the page. */
export type PutAnswer =
  | { kind: "saved"; profile: ProfileSnapshot }
  | { kind: "refused"; status: number; detail?: string | undefined }
  | { kind: "unreachable" };

/** What a save means for the person on the page. */
export type SaveOutcome =
  | { kind: "saved"; profile: ProfileSnapshot }
  | { kind: "stale" }
  | { kind: "stage-needs-record" }
  | { kind: "stage-locked-by-record" }
  | { kind: "invalid" }
  | { kind: "rate-limited" }
  | { kind: "signed-out" }
  | { kind: "closing" }
  | { kind: "server" }
  | { kind: "network" };

/** The `detail` values the profile route and the session middleware answer with (packages/api). */
const STALE_VERSION = "stale_version";
const STAGE_NEEDS_RECORD = "stage_needs_record";
const STAGE_LOCKED_BY_RECORD = "stage_locked_by_record";
const ACCOUNT_CLOSING = "account_closing";

export function outcomeOf(answer: PutAnswer): SaveOutcome {
  if (answer.kind === "saved") return answer;
  if (answer.kind === "unreachable") return { kind: "network" };
  const { status, detail } = answer;
  if (status === 401)
    return detail === ACCOUNT_CLOSING ? { kind: "closing" } : { kind: "signed-out" };
  if (status === 409 && detail === STALE_VERSION) return { kind: "stale" };
  if (status === 422 && detail === STAGE_NEEDS_RECORD) return { kind: "stage-needs-record" };
  if (status === 422 && detail === STAGE_LOCKED_BY_RECORD)
    return { kind: "stage-locked-by-record" };
  if (status === 429) return { kind: "rate-limited" };
  if (status >= 500) return { kind: "server" };
  return { kind: "invalid" };
}

/**
 * The sentence under a group after a save that did not land: what to do
 * next, never only that it failed. Null where the page acts instead (a
 * save, or a session that is gone or closing, which leaves the page).
 */
export function describeOutcome(outcome: SaveOutcome): string | null {
  const failure = settingsCopy.failure;
  switch (outcome.kind) {
    case "saved":
    case "signed-out":
    case "closing":
      return null;
    case "stale":
      return failure.stale;
    case "stage-needs-record":
      return failure.stageNeedsRecord;
    case "stage-locked-by-record":
      return failure.stageLockedByRecord;
    case "invalid":
      return failure.invalid;
    case "rate-limited":
      return failure.rateLimited;
    case "server":
      return failure.server;
    case "network":
      return failure.network;
  }
}

/** Whether the refusal is about the stage, which Journey decides; the group then links there. */
export function pointsToJourney(outcome: SaveOutcome): boolean {
  return outcome.kind === "stage-needs-record" || outcome.kind === "stage-locked-by-record";
}
