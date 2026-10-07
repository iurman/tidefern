import { describe, expect, test, vi } from "vitest";

import { createApp } from "../../app";
import type { CapturedMessage } from "./mail-capture";

/**
 * The browser suite's capture endpoint: absent unless the host passes the
 * hooks, and then the captured messages as recipient, subject and link,
 * with DELETE forgetting them. Off the OpenAPI document either way.
 */
const PATH = "/api/internal/e2e/mail";

// Synthetic addresses on the reserved test domain.
const MESSAGES: CapturedMessage[] = [
  {
    to: "first@example.test",
    subject: "Confirm your email",
    link: "http://127.0.0.1:3000/verify?token=a",
  },
  { to: "second@example.test", subject: "Reset your password", link: undefined },
];

describe("the mail capture endpoint", () => {
  test("is not mounted when the host passes no capture hooks", async () => {
    const app = createApp();
    expect((await app.request(PATH)).status).toBe(404);
    expect((await app.request(PATH, { method: "DELETE" })).status).toBe(404);
  });

  test("answers the captured messages, oldest first, and nothing cacheable", async () => {
    const app = createApp({ mailCapture: { read: () => MESSAGES, clear: () => undefined } });
    const response = await app.request(PATH);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      messages: [
        {
          to: "first@example.test",
          subject: "Confirm your email",
          link: "http://127.0.0.1:3000/verify?token=a",
        },
        { to: "second@example.test", subject: "Reset your password" },
      ],
    });
  });

  test("forgets the messages on DELETE", async () => {
    const clear = vi.fn();
    const app = createApp({ mailCapture: { read: () => [], clear } });
    const response = await app.request(PATH, { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  test("stays out of the contract", async () => {
    const app = createApp({ mailCapture: { read: () => [], clear: () => undefined } });
    const document = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(document.paths).some((path) => path.includes("internal"))).toBe(false);
  });
});
