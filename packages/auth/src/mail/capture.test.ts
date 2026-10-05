import { afterEach, describe, expect, test } from "vitest";

import { CaptureMailer } from "../mailer";
import { capturedMail, clearCapturedMail, linkIn, setCaptureMailer } from "./capture";
import { verificationEmail } from "./templates";

const LINK = "https://tidefern.example/api/auth/verify-email?token=abc&callbackURL=%2F";

afterEach(() => setCaptureMailer(undefined));

describe("capturedMail", () => {
  test("is empty while capture is off", () => {
    expect(capturedMail()).toEqual([]);
    expect(() => clearCapturedMail()).not.toThrow();
  });

  test("returns the recipient, the subject and the link of each captured message", async () => {
    const mailer = new CaptureMailer();
    setCaptureMailer(mailer);
    await mailer.send({ to: "a@example.com", ...verificationEmail(LINK) });
    await mailer.send({
      to: "b@example.com",
      subject: "Reset your Tidefern password",
      text: "no link here",
    });

    expect(capturedMail()).toEqual([
      { to: "a@example.com", subject: "Confirm your email", link: LINK },
      { to: "b@example.com", subject: "Reset your Tidefern password", link: undefined },
    ]);
    expect(capturedMail().at(-1)).not.toHaveProperty("text");
  });

  test("clears every captured message", async () => {
    const mailer = new CaptureMailer();
    setCaptureMailer(mailer);
    await mailer.send({ to: "a@example.com", ...verificationEmail(LINK) });
    expect(capturedMail()).toHaveLength(1);

    clearCapturedMail();
    expect(capturedMail()).toEqual([]);
    expect(mailer.messages).toHaveLength(0);

    await mailer.send({ to: "a@example.com", ...verificationEmail(LINK) });
    expect(capturedMail()).toHaveLength(1);
  });
});

describe("linkIn", () => {
  test("finds the first absolute link and keeps its query string", () => {
    expect(linkIn(`before\n\n${LINK}\n\nafter https://other.example/`)).toBe(LINK);
    expect(linkIn("http://localhost:3000/verify?token=t and more")).toBe(
      "http://localhost:3000/verify?token=t",
    );
    expect(linkIn("nothing to click")).toBeUndefined();
  });
});
