import { describe, expect, test } from "vitest";

import { CaptureMailer, ConsoleMailer } from "./mailer";

const LINK = "https://tidefern.example/api/auth/verify-email?token=abc";

describe("ConsoleMailer", () => {
  test("writes the recipient, the subject and the body to the given sink", async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer((line) => lines.push(line));
    await mailer.send({ to: "someone@example.com", subject: "Confirm your email", text: LINK });
    expect(lines).toEqual(['mail to=someone@example.com subject="Confirm your email"', LINK]);
  });
});

describe("CaptureMailer", () => {
  test("records messages in order and returns the newest", async () => {
    const mailer = new CaptureMailer();
    await mailer.send({ to: "a@example.com", subject: "Confirm your email", text: "first" });
    await mailer.send({ to: "b@example.com", subject: "Confirm your email", text: "second" });
    expect(mailer.messages.map((m) => m.text)).toEqual(["first", "second"]);
    expect(mailer.last()?.text).toBe("second");
    expect(mailer.last("a@example.com")?.text).toBe("first");
    expect(mailer.last("nobody@example.com")).toBeUndefined();
  });

  test("keeps only the newest messages up to its capacity", async () => {
    const mailer = new CaptureMailer(2);
    for (const text of ["one", "two", "three"]) {
      await mailer.send({ to: "a@example.com", subject: "Confirm your email", text });
    }
    expect(mailer.messages.map((m) => m.text)).toEqual(["two", "three"]);
  });

  test("clears and refuses a capacity below one", async () => {
    const mailer = new CaptureMailer();
    await mailer.send({ to: "a@example.com", subject: "Confirm your email", text: "x" });
    mailer.clear();
    expect(mailer.messages).toHaveLength(0);
    expect(mailer.last()).toBeUndefined();
    expect(() => new CaptureMailer(0)).toThrow(RangeError);
    expect(() => new CaptureMailer(1.5)).toThrow(RangeError);
  });
});
