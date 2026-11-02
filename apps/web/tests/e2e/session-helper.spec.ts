import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { TEST_ONLY_AUTH_SECRET, cannedSessionCookieValue, retryAfterMs } from "./session";

/**
 * The pure pieces of the shared session helper (task G10). They live with
 * the browser suite because Vitest only collects `src/`, and they need no
 * server and no page, so they answer the same on every server.
 */

const repository = resolve(__dirname, "../../../..");

/**
 * Reads a cookie value the way better-call 1.4's `getSignedCookie` does
 * when Better Auth's `getSession` reads the session cookie: decoded, the
 * signature after the last dot, 44 base64 characters ending in `=`,
 * checked with HMAC-SHA256 under the secret. The token when it verifies,
 * false when the signature is wrong, null when it is not shaped like one.
 */
async function readAsBetterAuth(
  cookieValue: string,
  secret: string,
): Promise<string | false | null> {
  const value = decodeURIComponent(cookieValue);
  const at = value.lastIndexOf(".");
  if (at < 1) return null;
  const token = value.slice(0, at);
  const signature = value.slice(at + 1);
  if (signature.length !== 44 || !signature.endsWith("=")) return null;
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await webcrypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64"),
    new TextEncoder().encode(token),
  );
  return verified ? token : false;
}

/** Runs `body` with BETTER_AUTH_SECRET set to `value` (or unset), then restores it. */
async function withSecret(value: string | undefined, body: () => Promise<void>) {
  const saved = process.env.BETTER_AUTH_SECRET;
  if (value === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = value;
  try {
    await body();
  } finally {
    if (saved === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = saved;
  }
}

test("the canned session cookie is signed so Better Auth reads its token, and only under that secret", async () => {
  await withSecret(undefined, async () => {
    expect(await readAsBetterAuth(cannedSessionCookieValue(), TEST_ONLY_AUTH_SECRET)).toBe(
      "e2e-canned",
    );
    expect(
      await readAsBetterAuth(cannedSessionCookieValue(), `${TEST_ONLY_AUTH_SECRET}-other`),
    ).toBe(false);
  });
});

test("the canned session cookie follows the process's own secret when it has one", async () => {
  const local = "a-secret-for-this-test-only-0123456789abcdef";
  await withSecret(local, async () => {
    expect(await readAsBetterAuth(cannedSessionCookieValue(), local)).toBe("e2e-canned");
  });
});

test("the helper's test-only secret is the one CI gives every server it starts", async () => {
  const workflow = await readFile(resolve(repository, ".github/workflows/ci.yml"), "utf8");
  const declared = /^\s+BETTER_AUTH_SECRET: (\S+)$/m.exec(workflow)?.[1];
  expect(declared).toBe(TEST_ONLY_AUTH_SECRET);
});

test("a 429 is waited out for the seconds the limiter names and half a second more", () => {
  const answer = (headers: Record<string, string>) => ({ headers: () => headers });
  expect(retryAfterMs(answer({ "x-retry-after": "3" }))).toBe(3_500);
  // No usable header: Better Auth's own window, ten seconds.
  expect(retryAfterMs(answer({}))).toBe(10_500);
  expect(retryAfterMs(answer({ "x-retry-after": "soon" }))).toBe(10_500);
  expect(retryAfterMs(answer({ "x-retry-after": "0" }))).toBe(10_500);
});
