import { describe, expect, test, vi } from "vitest";

import { DEFAULT_RESEND_TIMEOUT_MS, RESEND_SEND_URL, ResendError, ResendMailer } from "./resend";

const MESSAGE = {
  to: "someone@example.com",
  subject: "Confirm your email",
  text: "https://tidefern.example/api/auth/verify-email?token=abc",
  html: '<a href="https://tidefern.example/api/auth/verify-email?token=abc">link</a>',
};

type FetchCall = { url: string; init: RequestInit };

function fetchAnswering(response: () => Response) {
  const calls: FetchCall[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function mailer(
  fetch: typeof globalThis.fetch,
  extra: Partial<ConstructorParameters<typeof ResendMailer>[0]> = {},
) {
  return new ResendMailer({
    apiKey: "re_test_key",
    from: "Tidefern <hello@tidefern.example>",
    fetch,
    ...extra,
  });
}

describe("ResendMailer request", () => {
  test("posts the message as JSON to the send endpoint with the bearer key", async () => {
    const { fetch, calls } = fetchAnswering(() => Response.json({ id: "email-id" }));
    const lines: string[] = [];
    await mailer(fetch, { log: (line) => lines.push(line) }).send(MESSAGE);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(RESEND_SEND_URL);
    expect(call?.url).toBe("https://api.resend.com/emails");
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).get("authorization")).toBe("Bearer re_test_key");
    expect(new Headers(call?.init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(call?.init.body))).toEqual({
      from: "Tidefern <hello@tidefern.example>",
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("leaves html out when the message has none", async () => {
    const { fetch, calls } = fetchAnswering(() => Response.json({ id: "email-id" }));
    await mailer(fetch, { log: () => {} }).send({
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty("html");
  });

  test("logs one line with a request id and never the message id or the recipient", async () => {
    const { fetch } = fetchAnswering(() => Response.json({ id: "email-id-from-resend" }));
    const lines: string[] = [];
    await mailer(fetch, { log: (line) => lines.push(line) }).send(MESSAGE);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^mail sent request=[0-9a-f-]{36}$/);
    expect(lines[0]).not.toContain("email-id-from-resend");
    expect(lines[0]).not.toContain(MESSAGE.to);
  });

  test("refuses to build without a key or a sender", () => {
    expect(() => new ResendMailer({ apiKey: "", from: "a@example.com" })).toThrow(TypeError);
    expect(() => new ResendMailer({ apiKey: "re_x", from: "" })).toThrow(TypeError);
  });
});

describe("ResendMailer failures", () => {
  test("a 4xx throws with the status and Resend's error name, never the recipient or body", async () => {
    const { fetch } = fetchAnswering(() =>
      Response.json(
        { statusCode: 422, name: "validation_error", message: `Invalid to: ${MESSAGE.to}` },
        { status: 422 },
      ),
    );
    const lines: string[] = [];
    const error = await mailer(fetch, { log: (line) => lines.push(line) })
      .send(MESSAGE)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ResendError);
    const resendError = error as ResendError;
    expect(resendError.kind).toBe("response");
    expect(resendError.status).toBe(422);
    expect(resendError.code).toBe("validation_error");
    expect(resendError.message).toBe("Resend answered 422 (validation_error)");
    expect(resendError.message).not.toContain(MESSAGE.to);
    expect(resendError.message).not.toContain("token=abc");
    expect(lines).toHaveLength(0);
  });

  test("an error name that is not a plain token is dropped from the message", async () => {
    const { fetch } = fetchAnswering(() =>
      Response.json({ name: `bad ${MESSAGE.to}` }, { status: 400 }),
    );
    const error = (await mailer(fetch, { log: () => {} })
      .send(MESSAGE)
      .catch((e: unknown) => e)) as ResendError;
    expect(error.message).toBe("Resend answered 400");
  });

  test("a 5xx without a JSON body still carries the status", async () => {
    const { fetch } = fetchAnswering(() => new Response("upstream", { status: 503 }));
    const error = (await mailer(fetch, { log: () => {} })
      .send(MESSAGE)
      .catch((e: unknown) => e)) as ResendError;
    expect(error.status).toBe(503);
    expect(error.message).toBe("Resend answered 503");
  });

  test("a network failure is reported as such", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;
    const error = (await mailer(fetch, { log: () => {} })
      .send(MESSAGE)
      .catch((e: unknown) => e)) as ResendError;
    expect(error).toBeInstanceOf(ResendError);
    expect(error.kind).toBe("network");
  });

  test("abandons a send that outlives the timeout", async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      const fetch = ((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          seen = init?.signal ?? undefined;
          seen?.addEventListener("abort", () => reject(seen?.reason));
        })) as unknown as typeof globalThis.fetch;

      const pending = mailer(fetch, { log: () => {}, timeoutMs: 50 })
        .send(MESSAGE)
        .catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(49);
      expect(seen?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);

      const error = (await pending) as ResendError;
      expect(error).toBeInstanceOf(ResendError);
      expect(error.kind).toBe("timeout");
      expect(error.message).toBe("Resend did not answer before the timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  test("the default timeout is ten seconds", () => {
    expect(DEFAULT_RESEND_TIMEOUT_MS).toBe(10_000);
  });
});
