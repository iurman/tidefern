import { describe, expect, it } from "vitest";
import {
  FRESH_AUTH_MARGIN_MS,
  FRESH_AUTH_WINDOW_MS,
  freshForMs,
  problemFrom,
  refusalStep,
} from "./fresh-auth";

const signedIn = "2026-10-06T12:00:00.000Z";
const at = Date.parse(signedIn);

describe("the fresh sign-in window", () => {
  it("counts ten minutes from the sign-in, less a margin, on the server's clock", () => {
    expect(freshForMs(signedIn, at)).toBe(FRESH_AUTH_WINDOW_MS - FRESH_AUTH_MARGIN_MS);
    expect(freshForMs(signedIn, at + 5 * 60_000)).toBe(5 * 60_000 - FRESH_AUTH_MARGIN_MS);
  });

  it("is spent once the window has passed, and unknown without a session read", () => {
    expect(freshForMs(signedIn, at + FRESH_AUTH_WINDOW_MS)).toBe(0);
    expect(freshForMs(signedIn, at + 3 * 86_400_000)).toBe(0);
    expect(freshForMs(null, at)).toBeNull();
    expect(freshForMs(undefined, at)).toBeNull();
    expect(freshForMs("not a date", at)).toBeNull();
  });
});

describe("what a refusal asks of the page", () => {
  it("reads the problem body openapi-fetch parsed", () => {
    expect(problemFrom({ code: "unauthenticated", detail: "x", title: "t" }, 401)).toEqual({
      status: 401,
      code: "unauthenticated",
      detail: "x",
    });
    expect(problemFrom("plain text", 500)).toEqual({
      status: 500,
      code: undefined,
      detail: undefined,
    });
  });

  it("asks for a fresh sign-in on the ten-minute rule, never a retry", () => {
    expect(
      refusalStep({
        status: 401,
        code: "unauthenticated",
        detail: "fresh_authentication_required",
      }),
    ).toBe("fresh-auth");
  });

  it("goes to the locked view when the account started closing, and to sign in when the session is gone", () => {
    expect(refusalStep({ status: 401, code: "unauthenticated", detail: "account_closing" })).toBe(
      "closing",
    );
    expect(refusalStep({ status: 401, code: "unauthenticated" })).toBe("sign-in");
  });

  it("leaves every other refusal to the call that made it", () => {
    expect(
      refusalStep({ status: 409, code: "conflict", detail: "closure_in_progress" }),
    ).toBeNull();
    expect(refusalStep({ status: 500, code: "internal" })).toBeNull();
  });
});
