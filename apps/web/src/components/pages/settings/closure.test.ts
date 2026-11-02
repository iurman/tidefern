import { describe, expect, it } from "vitest";
import { closureView, type ClosureRequest } from "./closure";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const DAY = 86_400_000;

function request(overrides: Partial<ClosureRequest> = {}): ClosureRequest {
  return {
    id: "018f5e7a-5eed-7000-8000-0000000000aa",
    mode: "undo-window",
    state: "requested",
    requestedAt: new Date(NOW).toISOString(),
    undoUntil: new Date(NOW + 7 * DAY).toISOString(),
    deadlineAt: new Date(NOW + 45 * DAY).toISOString(),
    ...overrides,
  };
}

describe("where a closure stands", () => {
  it("offers the undo while the window is open, counting the days left up", () => {
    expect(closureView(request(), NOW)).toEqual({ kind: "undo", daysLeft: 7 });
    expect(closureView(request(), NOW + 1000)).toEqual({ kind: "undo", daysLeft: 7 });
    expect(closureView(request(), NOW + 6 * DAY + 1000)).toEqual({ kind: "undo", daysLeft: 1 });
  });

  it("offers no undo once the window has passed, as the API would refuse it", () => {
    expect(closureView(request(), NOW + 7 * DAY)).toEqual({
      kind: "deleting",
      reason: "window-ended",
    });
  });

  it("offers no undo for delete now, or once the deletion has started", () => {
    expect(closureView(request({ mode: "now", undoUntil: null }), NOW)).toEqual({
      kind: "deleting",
      reason: "now",
    });
    expect(closureView(request({ state: "in_progress" }), NOW)).toEqual({
      kind: "deleting",
      reason: "started",
    });
  });

  it("says nothing is closing when no request is open", () => {
    expect(closureView(null, NOW)).toEqual({ kind: "none" });
    expect(closureView(request({ state: "cancelled" }), NOW)).toEqual({ kind: "none" });
  });
});
