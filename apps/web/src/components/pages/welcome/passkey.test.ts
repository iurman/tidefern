import { describe, expect, it } from "vitest";
import { welcomeCopy } from "./copy";
import { passkeyOutcome, passkeySentence } from "./passkey";

const error = (code: string | undefined, status = 400) => ({
  code,
  status,
  statusText: "BAD_REQUEST",
});

describe("what adding a passkey ended in", () => {
  it("reads a closed prompt from either code the ceremony uses for it", () => {
    expect(passkeyOutcome(error("ERROR_CEREMONY_ABORTED"))).toBe("closed");
    // Chromium's NotAllowedError, passed through by @simplewebauthn/browser.
    expect(passkeyOutcome(error("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"))).toBe("closed");
  });

  it("reads a passkey the authenticator already holds for this account", () => {
    expect(passkeyOutcome(error("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"))).toBe("already");
  });

  it("reads a sign-in older than the server's fresh window", () => {
    expect(passkeyOutcome(error("SESSION_NOT_FRESH", 403))).toBe("notFresh");
  });

  it("reads anything else, no answer included, as a failure to try again", () => {
    expect(passkeyOutcome(error("UNKNOWN_ERROR", 500))).toBe("failed");
    expect(passkeyOutcome(null)).toBe("failed");
    expect(passkeyOutcome(undefined)).toBe("failed");
  });

  it("says the next step for each", () => {
    expect(passkeySentence("closed")).toBe(welcomeCopy.passkey.closed);
    expect(passkeySentence("already")).toBe(welcomeCopy.passkey.already);
    expect(passkeySentence("notFresh")).toBe(welcomeCopy.passkey.notFresh);
    expect(passkeySentence("failed")).toBe(welcomeCopy.passkey.failed);
  });
});
