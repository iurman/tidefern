import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { and, eq } from "drizzle-orm";
import { schema, withActor } from "@tidefern/db";
import type { ActorDatabase } from "@tidefern/db";
import { uuidv7 } from "@tidefern/core";

import type { ApiEnv } from "../context";
import { problem } from "../problem";
import type { ProblemCode } from "../problem";
import { IDEMPOTENCY_IN_FLIGHT_MAX_MS, IDEMPOTENCY_TTL_MS, isMutation } from "./limits";
import { routeTemplate } from "./route";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
/** Set to `true` on every answer served from a stored row instead of the handler. */
export const IDEMPOTENCY_REPLAYED_HEADER = "Idempotency-Replayed";

/** The `detail` values of the problems this middleware answers. */
export const IDEMPOTENCY_KEY_REQUIRED = "idempotency_key_required";
export const IDEMPOTENCY_KEY_INVALID = "idempotency_key_invalid";
export const IDEMPOTENCY_KEY_IN_FLIGHT = "idempotency_key_in_flight";
export const IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused";

export interface IdempotencyOptions {
  /** The clock, for tests. */
  now?: (() => number) | undefined;
  /** How long a row answers replays; `IDEMPOTENCY_TTL_MS` unless a test narrows it. */
  ttlMs?: number | undefined;
  /** How long an `in_flight` row blocks its key; `IDEMPOTENCY_IN_FLIGHT_MAX_MS` unless a test narrows it. */
  inFlightMaxMs?: number | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredRow = typeof schema.idempotencyKeys.$inferSelect;

/** The problem code a replayed problem status maps to; a status outside the contract replays as an empty body. */
const CODES_BY_STATUS: Record<number, ProblemCode> = {
  400: "validation_failed",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "validation_failed",
  426: "upgrade_required",
  429: "rate_limited",
};

function sha256(...parts: (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

/**
 * What a replay must match: the method, the concrete path and the body
 * bytes. The path is part of it so one key cannot replay a create against
 * a different parent; the hash is all that is stored.
 */
export function requestFingerprint(method: string, path: string, body: ArrayBuffer): string {
  return sha256(method.toUpperCase(), "\n", path, "\n", new Uint8Array(body));
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
  if (code === "23505" || causeCode === "23505") return true;
  return /idempotency_keys_actor_key_unique/.test(error.message);
}

/** The top-level `id` of a JSON body when it is a UUID; the created resource, by the contract's shape. */
function resourceIdIn(bytes: ArrayBuffer, contentType: string | null): string | null {
  if (contentType === null || !contentType.includes("json")) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const id = (parsed as { id?: unknown }).id;
    return typeof id === "string" && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * The `Idempotency-Key` rule of architecture 5.3 on every `/v1` mutation.
 * A `POST` must carry the header (a UUID; 400 otherwise), the other
 * mutations may. The middleware claims a row for the actor and key before
 * the handler runs, so two concurrent retries cannot both execute: the
 * second sees the first's `in_flight` row and gets the 409 problem. A
 * finished row answers a replay with the same method, path and body from
 * what was stored (the status, and for a created resource its id and
 * location), a different body with the same key is the 409 problem, and a
 * row older than the window is dropped and the request runs again, as is
 * an `in_flight` row older than `IDEMPOTENCY_IN_FLIGHT_MAX_MS`, which a
 * function that died before its `done` update left behind. A handler
 * answer of 5xx releases the row, so a client may retry it. No request or
 * response body is ever stored, only their hashes.
 */
export function idempotency(
  db: ActorDatabase | undefined,
  options: IdempotencyOptions = {},
): MiddlewareHandler<ApiEnv> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? IDEMPOTENCY_TTL_MS;
  const inFlightMaxMs = options.inFlightMaxMs ?? IDEMPOTENCY_IN_FLIGHT_MAX_MS;

  return async (c, next) => {
    const actor = c.var.actor;
    if (!isMutation(c.req.method) || actor === null) return next();

    const key = c.req.header(IDEMPOTENCY_KEY_HEADER);
    if (key === undefined) {
      if (c.req.method.toUpperCase() !== "POST") return next();
      return problem(c, 400, "validation_failed", {
        detail: IDEMPOTENCY_KEY_REQUIRED,
        errors: [{ path: IDEMPOTENCY_KEY_HEADER, message: "A UUID is required on this request." }],
      });
    }
    if (!UUID.test(key)) {
      return problem(c, 400, "validation_failed", {
        detail: IDEMPOTENCY_KEY_INVALID,
        errors: [{ path: IDEMPOTENCY_KEY_HEADER, message: "The key must be a UUID." }],
      });
    }

    const actorId = actor.id;
    const startedAt = now();
    const requestHash = requestFingerprint(c.req.method, c.req.path, await c.req.arrayBuffer());
    const route = `${c.req.method.toUpperCase()} ${routeTemplate(c)}`;

    /** Inserts the row, or returns the one that refused the insert. */
    const claim = async (): Promise<{ id: string } | { existing: StoredRow }> => {
      const id = uuidv7();
      try {
        await withActor(
          actorId,
          (tx) =>
            tx.insert(schema.idempotencyKeys).values({
              id,
              actorId,
              key: key.toLowerCase(),
              route,
              requestHash,
              createdAt: new Date(startedAt),
              updatedAt: new Date(startedAt),
            }),
          db,
        );
        return { id };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      const [existing] = await withActor(
        actorId,
        (tx) =>
          tx
            .select()
            .from(schema.idempotencyKeys)
            .where(
              and(
                eq(schema.idempotencyKeys.actorId, actorId),
                eq(schema.idempotencyKeys.key, key.toLowerCase()),
              ),
            )
            .limit(1),
        db,
      );
      // The row went between the refused insert and the read: claim again.
      return existing === undefined ? claim() : { existing };
    };

    const forget = (id: string) =>
      withActor(
        actorId,
        (tx) => tx.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.id, id)),
        db,
      );

    /** A row past the window, or an `in_flight` row nothing can still be running, is gone. */
    const abandoned = (existing: StoredRow): boolean => {
      const age = startedAt - existing.createdAt.getTime();
      return age >= ttlMs || (existing.state === "in_flight" && age >= inFlightMaxMs);
    };

    let claimed = await claim();
    if ("existing" in claimed && abandoned(claimed.existing)) {
      await forget(claimed.existing.id);
      claimed = await claim();
    }

    if ("existing" in claimed) {
      const stored = claimed.existing;
      if (stored.state === "in_flight") {
        return problem(c, 409, "conflict", { detail: IDEMPOTENCY_KEY_IN_FLIGHT });
      }
      if (stored.requestHash !== requestHash) {
        return problem(c, 409, "conflict", { detail: IDEMPOTENCY_KEY_REUSED });
      }
      return replay(c, stored);
    }

    const rowId = claimed.id;

    try {
      await next();
    } catch (error) {
      await forget(rowId);
      throw error;
    }

    const response = c.res;
    if (response.status >= 500) {
      await forget(rowId);
      return;
    }
    const bytes = await response.clone().arrayBuffer();
    const resourceId =
      response.status < 300 ? resourceIdIn(bytes, response.headers.get("content-type")) : null;
    await withActor(
      actorId,
      (tx) =>
        tx
          .update(schema.idempotencyKeys)
          .set({
            state: "done",
            responseStatus: response.status,
            responseHash: sha256(new Uint8Array(bytes)),
            resourceId,
            updatedAt: new Date(now()),
          })
          .where(eq(schema.idempotencyKeys.id, rowId)),
      db,
    );
  };
}

/** Answers from the stored row: the status, and for a created resource its id and location. */
function replay(c: Parameters<MiddlewareHandler<ApiEnv>>[0], stored: StoredRow): Response {
  c.header(IDEMPOTENCY_REPLAYED_HEADER, "true");
  const status = stored.responseStatus ?? 500;
  if (status >= 400) {
    const code = CODES_BY_STATUS[status];
    if (code !== undefined) {
      return problem(c, status as Parameters<typeof problem>[1], code);
    }
    return c.body(null, status as StatusCode);
  }
  if (stored.resourceId !== null) {
    if (status === 201) c.header("Location", `${c.req.path}/${stored.resourceId}`);
    return c.json({ id: stored.resourceId }, status as 200 | 201);
  }
  return c.body(null, status as StatusCode);
}
