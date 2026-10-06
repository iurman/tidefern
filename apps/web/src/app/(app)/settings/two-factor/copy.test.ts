import { describe, expect, it } from "vitest";
import { describeTwoFactorFailure, twoFactorCopy } from "./copy";

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
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("twoFactorCopy", () => {
  const all = strings(twoFactorCopy);

  it("names no health fact and carries no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const text of all) {
      expect(text).not.toContain(emDash);
      for (const word of HEALTH_WORDS) expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it("says the backup codes are shown once", () => {
    expect(twoFactorCopy.backup.shownOnce).toContain("shown once");
  });

  it("keeps the product words, never the protocol's", () => {
    for (const text of all) {
      expect(text).not.toMatch(/\bTOTP\b/);
      expect(text).not.toMatch(/two-factor/i);
    }
  });
});

describe("describeTwoFactorFailure", () => {
  it("names a wrong password and a wrong code as what to check next", () => {
    expect(
      describeTwoFactorFailure(
        { status: 400, statusText: "Bad", code: "INVALID_PASSWORD" },
        "password",
      ),
    ).toBe("That password did not match. Check it and try again.");
    expect(
      describeTwoFactorFailure(
        { status: 401, statusText: "Unauthorized", code: "INVALID_CODE" },
        "code",
      ),
    ).toContain("That code did not match");
  });

  it("points a stale sign-in at signing in again", () => {
    expect(
      describeTwoFactorFailure(
        { status: 403, statusText: "Forbidden", code: "SESSION_NOT_FRESH" },
        "password",
      ),
    ).toBe(twoFactorCopy.freshAuth.sentence);
  });

  it("asks for a reload when the account already has it on", () => {
    expect(
      describeTwoFactorFailure(
        { status: 400, statusText: "Bad", code: "TOTP_ALREADY_ENABLED" },
        "password",
      ),
    ).toContain("Reload the page");
  });

  it("reads a connection problem, a rate limit and a server problem", () => {
    expect(describeTwoFactorFailure(null, "password")).toContain("Check your connection");
    expect(describeTwoFactorFailure({ status: 429, statusText: "Too Many" }, "code")).toContain(
      "Wait a minute",
    );
    expect(describeTwoFactorFailure({ status: 503, statusText: "Down" }, "code")).toContain(
      "on our side",
    );
  });

  it("falls back by context", () => {
    expect(describeTwoFactorFailure({ status: 400, statusText: "Bad" }, "code")).toContain("code");
    expect(describeTwoFactorFailure({ status: 400, statusText: "Bad" }, "password")).toContain(
      "password",
    );
  });
});
