import { describe, expect, it } from "vitest";
import {
  AUTH_BASE_PATH,
  CLOSING_PATH,
  SIGNED_IN_PATH,
  WELCOME_PATH,
  passkeyAutofillAvailable,
  passkeysAvailable,
  safeNextPath,
  signInPathFor,
  signedInPath,
} from "./auth-client";

describe("passkeysAvailable", () => {
  it("is true only when the browser exposes PublicKeyCredential", () => {
    expect(passkeysAvailable(undefined)).toBe(false);
    expect(passkeysAvailable({})).toBe(false);
    expect(passkeysAvailable({ PublicKeyCredential: {} })).toBe(true);
  });
});

describe("passkeyAutofillAvailable", () => {
  it("is false without the conditional mediation check", async () => {
    expect(await passkeyAutofillAvailable(undefined)).toBe(false);
    expect(await passkeyAutofillAvailable({ PublicKeyCredential: {} })).toBe(false);
  });

  it("returns what the browser answers", async () => {
    const yes = { PublicKeyCredential: { isConditionalMediationAvailable: async () => true } };
    const no = { PublicKeyCredential: { isConditionalMediationAvailable: async () => false } };
    expect(await passkeyAutofillAvailable(yes)).toBe(true);
    expect(await passkeyAutofillAvailable(no)).toBe(false);
  });

  it("reads a throwing check as no", async () => {
    const broken = {
      PublicKeyCredential: {
        isConditionalMediationAvailable: async () => {
          throw new Error("not here");
        },
      },
    };
    expect(await passkeyAutofillAvailable(broken)).toBe(false);
  });
});

describe("the client", () => {
  it("calls the same base path the server mounts", () => {
    expect(AUTH_BASE_PATH).toBe("/api/auth");
  });
});

describe("the entry paths", () => {
  it("name the routes the layouts send people to", () => {
    expect(SIGNED_IN_PATH).toBe("/today");
    expect(WELCOME_PATH).toBe("/welcome");
    expect(CLOSING_PATH).toBe("/closing");
  });
});

describe("safeNextPath", () => {
  it("keeps a page path on this origin", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/journey")).toBe("/journey");
    expect(safeNextPath("/log/2026-10-05")).toBe("/log/2026-10-05");
    expect(safeNextPath("/")).toBe("/");
  });

  it("refuses anything that could leave the origin or reach past a page", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "settings",
      "//elsewhere.example",
      "//elsewhere.example/settings",
      "/\\elsewhere.example",
      "\\\\elsewhere.example",
      "/\t/elsewhere.example",
      "/\n/elsewhere.example",
      "/ /elsewhere.example",
      "https://elsewhere.example/settings",
      "javascript:alert(1)",
      "/settings?tab=profile",
      "/sharing#invitation=abc",
      "/a/../b",
      "/%2e%2e/elsewhere",
      "/%2F%2Felsewhere.example",
      "/%2f%2felsewhere.example",
      "/%5Celsewhere.example",
      "/%5celsewhere.example",
      "/%252F%252Felsewhere.example",
      "/%09/elsewhere.example",
      "/settings%3Ftab=profile",
      "/sharing%23invitation=abc",
      "/\\/elsewhere.example",
      "http:/elsewhere.example",
      "data:text/html,hi",
      "/\u0000/elsewhere.example",
      "/\u3000elsewhere.example",
      "/api/v1/me/export",
      "/api",
      `/${"a".repeat(512)}`,
    ]) {
      expect(safeNextPath(raw), String(raw)).toBeNull();
    }
  });
});

describe("signInPathFor", () => {
  it("names the page asked for as the next path, encoded once", () => {
    expect(signInPathFor("/settings")).toBe("/sign-in?next=%2Fsettings");
    expect(signInPathFor("/family/018f5e7a-5eed-7000-8000-000000000001")).toBe(
      "/sign-in?next=%2Ffamily%2F018f5e7a-5eed-7000-8000-000000000001",
    );
    expect(signInPathFor("/log/2026-10-05")).toBe("/sign-in?next=%2Flog%2F2026-10-05");
  });

  it("leaves next off for Today and for anything that is not a safe page path", () => {
    for (const requested of [
      null,
      undefined,
      "",
      "/today",
      "//elsewhere.example",
      "/\\elsewhere.example",
      "/%2F%2Felsewhere.example",
      "https://elsewhere.example/settings",
      "/settings?tab=profile",
      "/api/v1/me",
    ]) {
      expect(signInPathFor(requested), String(requested)).toBe("/sign-in");
    }
  });

  it("round-trips: what the sign-in page reads back from next is the page asked for", () => {
    const href = signInPathFor("/journey");
    const next = new URL(href, "https://tidefern.invalid").searchParams.get("next");
    expect(signedInPath(null, next)).toBe("/journey");
  });
});

describe("signedInPath", () => {
  it("lands on Today by default", () => {
    expect(signedInPath(null, null)).toBe("/today");
    expect(signedInPath(null, undefined)).toBe("/today");
  });

  it("forwards an invitation token to the sharing screen's fragment, ahead of any next path", () => {
    expect(signedInPath("abc", null)).toBe("/sharing#invitation=abc");
    expect(signedInPath("abc", "/settings")).toBe("/sharing#invitation=abc");
  });

  it("returns to a safe next path and ignores an unsafe one", () => {
    expect(signedInPath(null, "/settings")).toBe("/settings");
    expect(signedInPath(null, "//elsewhere.example")).toBe("/today");
  });

  it("never builds a URL from a token the API could not have minted", () => {
    expect(signedInPath("a b", "/settings")).toBe("/settings");
    expect(signedInPath("", null)).toBe("/today");
  });
});
