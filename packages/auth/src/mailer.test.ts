import { describe, expect, test } from "vitest";

import { CaptureMailer, ConsoleMailer } from "./mailer";
import { passwordResetEmail, reminderEmail, verificationEmail } from "./mail/templates";

const TOKEN = "tok3n_Zq8xV2b9LmN4pR7sT1uW6yA0cE5gH";
const LINK = `https://tidefern.example/api/auth/verify-email?token=${TOKEN}&callbackURL=%2Ftoday`;

describe("ConsoleMailer", () => {
  test("writes the recipient, the subject and the body with every link withheld", async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer((line) => lines.push(line));
    await mailer.send({ to: "someone@example.com", subject: "Confirm your email", text: LINK });
    expect(lines).toEqual([
      'mail to=someone@example.com subject="Confirm your email"',
      "https://tidefern.example/[link withheld]",
      expect.stringContaining("E2E_MAIL_CAPTURE=true"),
    ]);
  });

  test("never prints a token, in a query, a path or a fragment, from any template", async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer((line) => lines.push(line));
    const messages = [
      verificationEmail(LINK),
      passwordResetEmail(`https://tidefern.example/api/auth/reset-password/${TOKEN}?callbackURL=x`),
      {
        subject: "You have an invitation to Tidefern",
        text: `Open this link to see it:\n\nhttps://tidefern.example/sharing#invitation=${TOKEN}`,
      },
      reminderEmail(`http://localhost:3000/today?t=${TOKEN}`, "Ada"),
    ];
    for (const message of messages) await mailer.send({ to: "a@example.com", ...message });
    const printed = lines.join("\n");
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain("invitation=");
    expect(printed).not.toContain("reset-password");
    expect(printed).toContain("http://localhost:3000/[link withheld]");
    expect(printed).toContain("Hi Ada,");
    expect(lines.filter((line) => line.startsWith("mail to="))).toHaveLength(4);
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
