import { describe, expect, it } from "vitest";
import { AUTH_BASE_PATH, passkeyAutofillAvailable, passkeysAvailable } from "./auth-client";

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
