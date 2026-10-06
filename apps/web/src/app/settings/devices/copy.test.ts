import { describe, expect, it } from "vitest";
import { freshAuthRequired, sessionGone } from "@/lib/auth-client";
import { describeRevokeFailure, devicesCopy } from "./copy";

const HEALTH_WORDS = [
  "period",
  "cycle",
  "pregnan",
  "fertile",
  "ovulation",
  "baby",
  "child",
  "symptom",
];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const fn = value as (count: number) => string;
    return [fn(1), fn(2)];
  }
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("devicesCopy", () => {
  const all = strings(devicesCopy);

  it("names no health fact and carries no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const text of all) {
      expect(text).not.toContain(emDash);
      for (const word of HEALTH_WORDS) expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it("counts the other devices in the confirmation and the result", () => {
    expect(devicesCopy.revokeOthers.title(1)).toBe("Sign out the other device?");
    expect(devicesCopy.revokeOthers.title(3)).toBe("Sign out 3 other devices?");
    expect(devicesCopy.revokeOthers.confirm(1)).toBe("Sign out the other device");
    expect(devicesCopy.revokeOthers.confirm(3)).toBe("Sign out 3 devices");
    expect(devicesCopy.revokeOthers.done(1)).toBe("The other device is signed out.");
    expect(devicesCopy.revokeOthers.done(3)).toBe("3 devices are signed out.");
  });

  it("says what is happening while a revocation runs", () => {
    expect(devicesCopy.revokeOne.pending).toBe("Signing out");
    expect(devicesCopy.revokeOthers.pending).toBe("Signing out");
  });
});

describe("freshAuthRequired and sessionGone", () => {
  const freshProblem = {
    status: 401,
    statusText: "Unauthorized",
    code: "unauthenticated",
    detail: "fresh_authentication_required",
  };
  const plain401 = { status: 401, statusText: "Unauthorized", code: "unauthenticated" };
  const notFresh = { status: 403, statusText: "Forbidden", code: "SESSION_NOT_FRESH" };

  it("reads the API's fresh-authentication detail on a 401", () => {
    expect(freshAuthRequired(freshProblem)).toBe(true);
    expect(sessionGone(freshProblem)).toBe(false);
  });

  it("reads Better Auth's own freshness refusal on a 403", () => {
    expect(freshAuthRequired(notFresh)).toBe(true);
    expect(sessionGone(notFresh)).toBe(false);
  });

  it("treats the API's and Better Auth's unauthenticated 401 as a session that is gone", () => {
    expect(freshAuthRequired(plain401)).toBe(false);
    expect(sessionGone(plain401)).toBe(true);
    expect(sessionGone({ status: 401, statusText: "Unauthorized", code: "UNAUTHORIZED" })).toBe(
      true,
    );
  });

  it("keeps a wrong one-time code on the page although it is also a 401", () => {
    expect(sessionGone({ status: 401, statusText: "Unauthorized", code: "INVALID_CODE" })).toBe(
      false,
    );
    expect(sessionGone({ status: 401, statusText: "Unauthorized" })).toBe(false);
  });

  it("answers false for no error at all", () => {
    expect(freshAuthRequired(null)).toBe(false);
    expect(sessionGone(undefined)).toBe(false);
  });
});

describe("describeRevokeFailure", () => {
  it("points a stale sign-in at signing in again", () => {
    const text = describeRevokeFailure({
      status: 401,
      statusText: "Unauthorized",
      detail: "fresh_authentication_required",
    });
    expect(text).toBe(devicesCopy.freshAuth.sentence);
    expect(text).toContain("Sign in again");
  });

  it("names a connection problem, a rate limit and a server problem", () => {
    expect(describeRevokeFailure(null)).toContain("Check your connection");
    expect(describeRevokeFailure({ status: 429, statusText: "Too Many" })).toContain(
      "Wait a minute",
    );
    expect(describeRevokeFailure({ status: 500, statusText: "Error" })).toContain("on our side");
  });

  it("tells the person a device already signed out needs a reload, not a retry", () => {
    expect(describeRevokeFailure({ status: 404, statusText: "Not Found" })).toContain("Reload");
    expect(
      describeRevokeFailure({ status: 400, statusText: "Bad", code: "SESSION_NOT_FOUND" }),
    ).toContain("already signed out");
  });

  it("asks for a retry for anything else", () => {
    expect(describeRevokeFailure({ status: 400, statusText: "Bad" })).toBe(
      "We could not sign that device out. Try again.",
    );
  });
});
