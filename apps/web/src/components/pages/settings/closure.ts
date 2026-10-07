import type { components } from "@tidefern/api-client";

export type ClosureRequest = components["schemas"]["ClosureRequest"];

const DAY_MS = 86_400_000;

/**
 * Where an account's closure stands, as the locked view says it (GET
 * /v1/me/close, tasks E8 and I2):
 *
 * - `undo`: closed with the 7-day window, which is still open; the days
 *   left, counted up so the day it was closed reads 7;
 * - `deleting`: no undo any more, because the person chose delete now, the
 *   window has passed (the sweep runs the deletion when it next comes), or
 *   the deletion job has started;
 * - `none`: nothing is open.
 *
 * The undo is offered exactly when the API would accept it: a request still
 * `requested`, with an undo deadline that has not passed.
 */
export type ClosureView =
  | { kind: "undo"; daysLeft: number }
  | { kind: "deleting"; reason: "now" | "window-ended" | "started" }
  | { kind: "none" };

export function closureView(request: ClosureRequest | null, nowMs: number): ClosureView {
  if (request === null) return { kind: "none" };
  if (request.state === "in_progress") return { kind: "deleting", reason: "started" };
  if (request.state !== "requested") return { kind: "none" };
  if (request.mode === "now" || request.undoUntil === null)
    return { kind: "deleting", reason: "now" };
  const left = Date.parse(request.undoUntil) - nowMs;
  if (Number.isNaN(left) || left <= 0) return { kind: "deleting", reason: "window-ended" };
  return { kind: "undo", daysLeft: Math.ceil(left / DAY_MS) };
}
