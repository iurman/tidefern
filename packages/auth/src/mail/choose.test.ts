import { afterEach, describe, expect, test } from "vitest";

import { CaptureMailer, ConsoleMailer } from "../mailer";
import { capturedMail, setCaptureMailer } from "./capture";
import { chooseMailTransport, chooseMailer } from "./choose";
import { ResendMailer } from "./resend";

const RESEND = { RESEND_API_KEY: "re_live_key", EMAIL_FROM: "Tidefern <hello@tidefern.example>" };

afterEach(() => setCaptureMailer(undefined));

describe("chooseMailTransport", () => {
  test("Resend only on Vercel production with both variables", () => {
    expect(chooseMailTransport({ VERCEL_ENV: "production", ...RESEND })).toBe("resend");
    expect(chooseMailTransport({ VERCEL_ENV: "preview", ...RESEND })).toBe("console");
    expect(chooseMailTransport({ VERCEL_ENV: "development", ...RESEND })).toBe("console");
    expect(chooseMailTransport({ ...RESEND })).toBe("console");
  });

  test("production without any Resend configuration falls back to the console", () => {
    expect(chooseMailTransport({ VERCEL_ENV: "production" })).toBe("console");
  });

  test("production with half a Resend configuration is refused", () => {
    expect(() => chooseMailTransport({ VERCEL_ENV: "production", RESEND_API_KEY: "re_x" })).toThrow(
      /RESEND_API_KEY and EMAIL_FROM/,
    );
    expect(() =>
      chooseMailTransport({ VERCEL_ENV: "production", EMAIL_FROM: "a@b.example" }),
    ).toThrow(/RESEND_API_KEY and EMAIL_FROM/);
  });

  test("capture when E2E_MAIL_CAPTURE is exactly true and not on production", () => {
    expect(chooseMailTransport({ E2E_MAIL_CAPTURE: "true" })).toBe("capture");
    expect(chooseMailTransport({ VERCEL_ENV: "preview", E2E_MAIL_CAPTURE: "true" })).toBe(
      "capture",
    );
    expect(chooseMailTransport({ E2E_MAIL_CAPTURE: "1" })).toBe("console");
    expect(chooseMailTransport({ E2E_MAIL_CAPTURE: "TRUE" })).toBe("console");
    expect(chooseMailTransport({ E2E_MAIL_CAPTURE: "" })).toBe("console");
  });

  test("capture on production is refused even with Resend configured", () => {
    expect(() =>
      chooseMailTransport({ VERCEL_ENV: "production", E2E_MAIL_CAPTURE: "true", ...RESEND }),
    ).toThrow(/E2E_MAIL_CAPTURE must not be set when VERCEL_ENV is production/);
    expect(() =>
      chooseMailTransport({ VERCEL_ENV: "production", E2E_MAIL_CAPTURE: "true" }),
    ).toThrow(/E2E_MAIL_CAPTURE/);
  });

  test("the console transport everywhere else, including CI", () => {
    expect(chooseMailTransport({})).toBe("console");
    expect(chooseMailTransport({ VERCEL_ENV: "preview" })).toBe("console");
  });
});

describe("chooseMailer", () => {
  test("builds the transport the facts name", () => {
    expect(chooseMailer({ VERCEL_ENV: "production", ...RESEND })).toBeInstanceOf(ResendMailer);
    expect(chooseMailer({ E2E_MAIL_CAPTURE: "true" })).toBeInstanceOf(CaptureMailer);
    expect(chooseMailer({ VERCEL_ENV: "preview" })).toBeInstanceOf(ConsoleMailer);
  });

  test("the capture mailer it builds is the one capturedMail() reads", async () => {
    const mailer = chooseMailer({ E2E_MAIL_CAPTURE: "true" });
    await mailer.send({
      to: "a@example.com",
      subject: "Confirm your email",
      text: "https://tidefern.example/x",
    });
    expect(capturedMail()).toEqual([
      { to: "a@example.com", subject: "Confirm your email", link: "https://tidefern.example/x" },
    ]);
  });

  test("choosing another transport turns capture off", async () => {
    const capture = chooseMailer({ E2E_MAIL_CAPTURE: "true" });
    await capture.send({
      to: "a@example.com",
      subject: "Confirm your email",
      text: "https://tidefern.example/x",
    });
    expect(capturedMail()).toHaveLength(1);

    const lines: string[] = [];
    chooseMailer({}, { write: (line) => lines.push(line) });
    expect(capturedMail()).toEqual([]);
  });

  test("passes the injected fetch and sink through", async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return Response.json({ id: "x" });
    }) as typeof globalThis.fetch;
    const resend = chooseMailer({ VERCEL_ENV: "production", ...RESEND }, { fetch }) as ResendMailer;
    await resend.send({
      to: "a@example.com",
      subject: "Confirm your email",
      text: "https://tidefern.example/x",
    });
    expect(called).toBe(true);

    const lines: string[] = [];
    const console = chooseMailer({}, { write: (line) => lines.push(line) });
    await console.send({
      to: "a@example.com",
      subject: "Confirm your email",
      text: "https://tidefern.example/x",
    });
    expect(lines[0]).toBe('mail to=a@example.com subject="Confirm your email"');
  });
});
