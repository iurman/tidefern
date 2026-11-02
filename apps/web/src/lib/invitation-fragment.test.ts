import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INVITATION_LANDING_PATH,
  invitationLanding,
  invitationTokenFrom,
  takeInvitationFragment,
  type FragmentHost,
} from "./invitation-fragment";

/** A token shaped like the API's: 32 random bytes as base64url, 43 characters. */
const minted = "q3Zr7Hc1-_b9Kx0LmN2pQ4sT6uV8wY0aB1cD3eF5gH7";

/** A fake window whose replaceState writes the new path back, as a browser does. */
function host(hash: string, pathname = "/sign-in", search = "") {
  const location = { hash, pathname, search };
  const replaceState = vi.fn((_: unknown, __: string, url?: string | URL | null) => {
    const next = new URL(String(url), "https://tidefern.example");
    location.hash = next.hash;
    location.pathname = next.pathname;
    location.search = next.search;
  });
  return { host: { location, history: { replaceState } } satisfies FragmentHost, replaceState };
}

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("invitationTokenFrom", () => {
  it("reads the token of an invitation fragment", () => {
    expect(invitationTokenFrom("#invitation=abc")).toBe("abc");
    expect(invitationTokenFrom(`#invitation=${minted}`)).toBe(minted);
    expect(invitationTokenFrom("#invitation=abc&other=1")).toBe("abc");
  });

  it("answers null for no fragment, another fragment, or anything that is not a token", () => {
    for (const hash of [
      "",
      "#",
      "invitation=abc",
      "#other=abc",
      "#invitation=",
      "#invitation=a%20b",
      "#invitation=a+b",
      "#invitation=%3Cscript%3E",
      "#invitation=abc.def",
      `#invitation=${"a".repeat(129)}`,
    ]) {
      expect(invitationTokenFrom(hash), hash).toBeNull();
    }
  });
});

describe("invitationLanding", () => {
  it("puts the token back in the sharing screen's fragment, never in a query", () => {
    expect(invitationLanding("abc")).toBe("/sharing#invitation=abc");
    expect(invitationLanding(minted)).toBe(`${INVITATION_LANDING_PATH}#invitation=${minted}`);
  });

  it("refuses a value the API could not have minted", () => {
    expect(invitationLanding("")).toBeNull();
    expect(invitationLanding("abc?next=//elsewhere.example")).toBeNull();
    expect(invitationLanding("a#b")).toBeNull();
  });
});

describe("takeInvitationFragment", () => {
  it("returns the token at once and removes the fragment a task later, keeping path and query", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/sign-in?next=%2Fsettings#invitation=abc");
    expect(takeInvitationFragment()).toBe("abc");
    // Still there while the page's mount effects run, before Next.js has folded replaceState in.
    expect(window.location.hash).toBe("#invitation=abc");
    vi.runAllTimers();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/sign-in");
    expect(window.location.search).toBe("?next=%2Fsettings");
  });

  it("removes it through the replaceState in place when the removal runs, not the one at the call", () => {
    vi.useFakeTimers();
    const { host: fake, replaceState: native } = host("#invitation=abc", "/sign-in", "?next=%2Fa");
    expect(takeInvitationFragment(fake)).toBe("abc");
    // Next.js's root router swaps in its own replaceState in an effect that runs after the page's.
    const integrated = vi.fn((data: unknown, unused: string, url?: string | URL | null) =>
      native(data, unused, url),
    );
    fake.history.replaceState = integrated;
    vi.runAllTimers();
    expect(integrated).toHaveBeenCalledTimes(1);
    expect(integrated).toHaveBeenCalledWith(null, "", "/sign-in?next=%2Fa");
    expect(fake.location).toEqual({ hash: "", pathname: "/sign-in", search: "?next=%2Fa" });
  });

  it("leaves the address bar alone when the page was not opened from an invitation", () => {
    vi.useFakeTimers();
    const { host: fake, replaceState } = host("#section-2");
    expect(takeInvitationFragment(fake)).toBeNull();
    vi.runAllTimers();
    expect(replaceState).not.toHaveBeenCalled();
    expect(fake.location.hash).toBe("#section-2");
  });

  it("removes a malformed invitation fragment too, and hands back nothing", () => {
    vi.useFakeTimers();
    const { host: fake, replaceState } = host("#invitation=%3Cscript%3E", "/welcome");
    expect(takeInvitationFragment(fake)).toBeNull();
    vi.runAllTimers();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(fake.location).toEqual({ hash: "", pathname: "/welcome", search: "" });
  });

  // Changed on purpose in G10's review: the removal now waits a task for Next.js's router (see
  // takeInvitationFragment), so a second read before it, such as React strict mode's second
  // effect run in development, gets the same token instead of null. One removal still happens,
  // and a read after it finds nothing.
  it("hands the same token to a read before the removal, removes once, and finds nothing after", () => {
    vi.useFakeTimers();
    const { host: fake, replaceState } = host(`#invitation=${minted}`, "/sharing");
    expect(takeInvitationFragment(fake)).toBe(minted);
    expect(takeInvitationFragment(fake)).toBe(minted);
    vi.runAllTimers();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(takeInvitationFragment(fake)).toBeNull();
  });

  it("never logs the token", () => {
    vi.useFakeTimers();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    window.history.replaceState(null, "", `/sharing#invitation=${minted}`);
    takeInvitationFragment();
    vi.runAllTimers();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
