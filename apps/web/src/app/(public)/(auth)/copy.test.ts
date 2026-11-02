import { describe, expect, it } from "vitest";
import { authCopy, describeAuthFailure, normalizeCode } from "./copy";

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

describe("describeAuthFailure", () => {
  it("names the next step for a wrong password on sign-in", () => {
    const text = describeAuthFailure(
      { code: "INVALID_EMAIL_OR_PASSWORD", status: 401, statusText: "Unauthorized" },
      "sign-in",
    );
    expect(text).toBe("That email and password do not match. Check both, or reset your password.");
  });

  it("uses the content inventory's sentence for an email already in use", () => {
    const text = describeAuthFailure(
      { code: "USER_ALREADY_EXISTS", status: 422, statusText: "Unprocessable" },
      "sign-up",
    );
    expect(text).toBe("That email is already in use. Sign in instead.");
  });

  it("tells an unverified person a fresh link is on its way", () => {
    const text = describeAuthFailure(
      { code: "EMAIL_NOT_VERIFIED", status: 403, statusText: "Forbidden" },
      "sign-in",
    );
    expect(text).toContain("Confirm your email first");
  });

  it("points an expired reset link back to the request form", () => {
    const text = describeAuthFailure(
      { code: "INVALID_TOKEN", status: 400, statusText: "Bad Request" },
      "new-password",
    );
    expect(text).toBe("This link has expired. Request a new one.");
  });

  it("treats a rate limit as a wait, whatever the code", () => {
    const text = describeAuthFailure({ status: 429, statusText: "Too Many Requests" }, "sign-in");
    expect(text).toContain("Wait a minute");
  });

  it("reads a missing or zero-status error as a connection problem", () => {
    expect(describeAuthFailure(null, "sign-in")).toContain("Check your connection");
    expect(describeAuthFailure({ status: 0, statusText: "" }, "reset-request")).toContain(
      "Check your connection",
    );
  });

  it("offers the password path when a passkey ceremony is closed", () => {
    const text = describeAuthFailure(
      { code: "AUTH_CANCELLED", status: 400, statusText: "Bad Request" },
      "passkey",
    );
    expect(text).toContain("sign in with your password");
  });

  it("keeps an unknown passkey failure on the passkey path", () => {
    const text = describeAuthFailure(
      { code: "SOMETHING_NEW", status: 400, statusText: "Bad Request" },
      "passkey",
    );
    expect(text).toContain("passkey");
    const user = describeAuthFailure(
      { code: "USER_NOT_FOUND", status: 404, statusText: "Not Found" },
      "passkey",
    );
    expect(user).toContain("passkey");
  });

  it("separates a server fault from a bad input for an unknown code", () => {
    expect(
      describeAuthFailure({ code: "NEW_CODE", status: 500, statusText: "Error" }, "sign-in"),
    ).toContain("our side");
    expect(
      describeAuthFailure({ code: "NEW_CODE", status: 400, statusText: "Bad" }, "sign-in"),
    ).toContain("Check what you entered");
  });

  it("never ends a sentence without a next step", () => {
    const codes = [
      "USER_ALREADY_EXISTS",
      "INVALID_EMAIL",
      "PASSWORD_TOO_SHORT",
      "PASSWORD_TOO_LONG",
      "INVALID_EMAIL_OR_PASSWORD",
      "EMAIL_NOT_VERIFIED",
      "INVALID_TOKEN",
      "INVALID_CODE",
      "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
      "INVALID_TWO_FACTOR_COOKIE",
      "AUTH_CANCELLED",
      undefined,
    ];
    for (const code of codes) {
      const text = describeAuthFailure({ code, status: 400, statusText: "Bad" }, "sign-in");
      expect(text, code ?? "unknown").toMatch(
        /\b(Sign in|Check|Choose|Request|Wait|Try again|Confirm|Reload)\b/,
      );
    }
  });
});

describe("normalizeCode", () => {
  it("drops the spaces an authenticator app or a saved list may carry", () => {
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("ab12-cd34")).toBe("ab12-cd34");
  });
});

describe("authCopy", () => {
  it("carries no health word and no em dash", () => {
    for (const text of strings(authCopy)) {
      expect(text).not.toContain(String.fromCharCode(0x2014));
      for (const word of HEALTH_WORDS) {
        expect(text.toLowerCase(), text).not.toContain(word);
      }
    }
  });

  it("gives every pending state a present-tense sentence of its own", () => {
    const pending = [
      authCopy.signUp.pending,
      authCopy.signIn.pending,
      authCopy.signIn.passkeyPending,
      authCopy.signIn.twoFactor.pending,
      authCopy.reset.pending,
      authCopy.newPassword.pending,
    ];
    for (const text of pending) expect(text).toMatch(/ing\b/);
    expect(new Set(pending).size).toBe(pending.length);
  });
});
