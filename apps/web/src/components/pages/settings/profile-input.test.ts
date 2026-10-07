import { describe, expect, it } from "vitest";
import {
  describeOutcome,
  ifMatchFor,
  normalizeDisplayName,
  outcomeOf,
  pointsToJourney,
  profileBody,
  snapshotOf,
  type ProfileSnapshot,
} from "./profile-input";

const saved: ProfileSnapshot = {
  displayName: "Noor",
  timeZone: "Europe/Berlin",
  stage: "cycle",
  weekStart: 7,
  units: "imperial",
  notificationDetail: "detailed",
  version: 4,
};

describe("the profile body a settings group sends", () => {
  it("resends every field, so a units change cannot reset the detail level or the week start", () => {
    expect(profileBody(saved, { units: "metric" })).toEqual({
      displayName: "Noor",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      weekStart: 7,
      units: "metric",
      notificationDetail: "detailed",
    });
    expect(profileBody(saved, { notificationDetail: "gentle" })).toMatchObject({
      units: "imperial",
      weekStart: 7,
      notificationDetail: "gentle",
    });
  });

  it("tells clearing the name apart from leaving it out", () => {
    expect(profileBody(saved, { displayName: null }).displayName).toBeNull();
    expect(profileBody(saved, { timeZone: "Asia/Tokyo" })).toMatchObject({
      displayName: "Noor",
      timeZone: "Asia/Tokyo",
    });
  });

  it("never sends the version or anything outside the six fields", () => {
    expect(Object.keys(profileBody(saved, {})).sort()).toEqual([
      "displayName",
      "notificationDetail",
      "stage",
      "timeZone",
      "units",
      "weekStart",
    ]);
  });

  it("keeps only the fields of a profile the API answered with", () => {
    const answered = { ...saved, ageAttestedAt: "x", createdAt: "y", updatedAt: "z" };
    expect(snapshotOf(answered)).toEqual(saved);
  });

  it("quotes the version for If-Match the way the ETag carries it", () => {
    expect(ifMatchFor(12)).toBe('"12"');
  });

  it("trims the name and keeps nothing as no name", () => {
    expect(normalizeDisplayName("  Noor  ")).toBe("Noor");
    expect(normalizeDisplayName("   ")).toBeNull();
  });
});

describe("what a save means", () => {
  it("maps each refusal the route answers to its own outcome", () => {
    expect(outcomeOf({ kind: "refused", status: 409, detail: "stale_version" })).toEqual({
      kind: "stale",
    });
    expect(outcomeOf({ kind: "refused", status: 422, detail: "stage_needs_record" })).toEqual({
      kind: "stage-needs-record",
    });
    expect(outcomeOf({ kind: "refused", status: 422, detail: "stage_locked_by_record" })).toEqual({
      kind: "stage-locked-by-record",
    });
    expect(outcomeOf({ kind: "refused", status: 422 })).toEqual({ kind: "invalid" });
    expect(outcomeOf({ kind: "refused", status: 429 })).toEqual({ kind: "rate-limited" });
    expect(outcomeOf({ kind: "refused", status: 503 })).toEqual({ kind: "server" });
    expect(outcomeOf({ kind: "unreachable" })).toEqual({ kind: "network" });
  });

  it("leaves for sign-in on a lost session and for the locked view on a closing account", () => {
    expect(outcomeOf({ kind: "refused", status: 401 })).toEqual({ kind: "signed-out" });
    expect(outcomeOf({ kind: "refused", status: 401, detail: "account_closing" })).toEqual({
      kind: "closing",
    });
    expect(describeOutcome({ kind: "signed-out" })).toBeNull();
    expect(describeOutcome({ kind: "closing" })).toBeNull();
  });

  it("says the next step for every save that did not land, and points stage refusals to Journey", () => {
    expect(describeOutcome({ kind: "stale" })).toMatch(/loaded the latest/);
    expect(describeOutcome({ kind: "stage-needs-record" })).toMatch(/starts in Journey/);
    expect(describeOutcome({ kind: "stage-locked-by-record" })).toMatch(/Journey sets your stage/);
    expect(describeOutcome({ kind: "network" })).toMatch(/Check your connection/);
    expect(pointsToJourney({ kind: "stage-needs-record" })).toBe(true);
    expect(pointsToJourney({ kind: "stale" })).toBe(false);
  });
});
