import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropInvitationFragment } from "./drop-invitation-fragment";

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("DropInvitationFragment", () => {
  it("takes an invitation fragment out of the address bar, keeping the path, and renders nothing", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/closing#invitation=abc");
    const { container } = render(<DropInvitationFragment />);
    expect(container).toBeEmptyDOMElement();
    vi.runAllTimers();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/closing");
  });

  it("leaves any other fragment alone", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/closing#export");
    render(<DropInvitationFragment />);
    vi.runAllTimers();
    expect(window.location.hash).toBe("#export");
  });
});
