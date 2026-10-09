import { expect, test } from "@playwright/test";
import {
  LIMITER_MARGIN_MS,
  LIMITER_WINDOW_MS,
  limiterPath,
  nextSlot,
  parseBuckets,
  type Bucket,
} from "./limiter";

/**
 * The pure model of Better Auth's sign-in limiter that paces the suite
 * (./limiter.ts). It needs no server and no page, so it answers the same on
 * every server; Vitest only collects `src/`, so it lives with the suite.
 */

const quiet = LIMITER_WINDOW_MS + LIMITER_MARGIN_MS;

test("the first three requests in a chain go at once and the fourth waits for the chain to go quiet", () => {
  let bucket: Bucket | undefined;
  const sent: number[] = [];
  for (const at of [0, 2_000, 4_000]) {
    const slot = nextSlot(bucket, at);
    expect(slot.waitMs, `the request at ${at}`).toBe(0);
    bucket = slot.next;
    sent.push(at);
  }
  expect(bucket).toEqual({ count: 3, last: 4_000 });
  const fourth = nextSlot(bucket, 6_000);
  expect(fourth.waitMs).toBe(4_000 + quiet - 6_000);
  expect(fourth.next).toEqual({ count: 1, last: 4_000 + quiet });
});

test("the count only starts again after a full quiet window, as Better Auth's lastRequest moves with every request", () => {
  // Requests every six seconds never leave ten quiet seconds, so the count keeps rising.
  let bucket: Bucket | undefined;
  bucket = nextSlot(bucket, 0).next;
  bucket = nextSlot(bucket, 6_000).next;
  bucket = nextSlot(bucket, 12_000).next;
  expect(bucket.count).toBe(3);
  expect(nextSlot(bucket, 18_000).waitMs).toBeGreaterThan(0);
  // A quiet window and the margin after the last one: a new chain.
  expect(nextSlot(bucket, 12_000 + quiet)).toEqual({
    waitMs: 0,
    next: { count: 1, last: 12_000 + quiet },
  });
});

test("a quiet gap shorter than the margin still counts as the same chain, so the model never undercounts", () => {
  const bucket: Bucket = { count: 3, last: 0 };
  const slot = nextSlot(bucket, LIMITER_WINDOW_MS + 100);
  expect(slot.waitMs).toBe(quiet - (LIMITER_WINDOW_MS + 100));
});

test("the limiter path is the auth path the server keys its rows on, and only the limited ones count", () => {
  expect(limiterPath("http://127.0.0.1:3251/api/auth/sign-in/email")).toBe("/sign-in/email");
  expect(limiterPath("/api/auth/sign-up/email?x=1")).toBe("/sign-up/email");
  expect(limiterPath("/api/auth/change-password")).toBe("/change-password");
  expect(limiterPath("/api/auth/get-session")).toBeNull();
  expect(limiterPath("/api/auth/passkey/generate-authenticate-options")).toBeNull();
  expect(limiterPath("/api/v1/me")).toBeNull();
});

test("the buckets kept between workers read back as written, and anything else is dropped", () => {
  const written = { "/sign-in/email": { count: 2, last: 1_000 } };
  expect(parseBuckets(JSON.stringify(written))).toEqual(written);
  expect(
    parseBuckets(
      JSON.stringify({ "/sign-up/email": { count: "3", last: 1 }, "/x": null, "/y": { count: 1 } }),
    ),
  ).toEqual({});
  expect(parseBuckets("[]")).toEqual({});
  expect(() => parseBuckets("not json")).toThrow();
});
