import { describe, expect, test } from "vitest";

import { passwordResetEmail, verificationEmail } from "./email";

const LINK = "https://tidefern.example/api/auth/verify-email?token=abc&callbackURL=%2F";

// Words that must never appear in mail; the subjects and bodies are generic.
const HEALTH_WORDS = /cycle|period|pregnan|baby|child|symptom|ovulat|due date|growth/i;

function urlsIn(text: string): string[] {
  return text.match(/https?:\/\/\S+/g) ?? [];
}

describe("verificationEmail", () => {
  test("uses the generic subject and carries the link and nothing else", () => {
    const mail = verificationEmail(LINK);
    expect(mail.subject).toBe("Confirm your email");
    expect(urlsIn(mail.text)).toEqual([LINK]);
    expect(mail.text).not.toMatch(HEALTH_WORDS);
    expect(mail.subject).not.toMatch(HEALTH_WORDS);
  });

  test("escapes the link inside the html anchor", () => {
    const mail = verificationEmail(LINK);
    expect(mail.html).toContain(
      'href="https://tidefern.example/api/auth/verify-email?token=abc&amp;callbackURL=%2F"',
    );
    expect(mail.html).not.toContain("&callbackURL");
    expect(mail.html).not.toMatch(HEALTH_WORDS);
  });
});

describe("passwordResetEmail", () => {
  test("uses the generic subject, carries the link and says other sessions end", () => {
    const mail = passwordResetEmail(LINK);
    expect(mail.subject).toBe("Reset your Tidefern password");
    expect(urlsIn(mail.text)).toEqual([LINK]);
    expect(mail.text).toContain("signs you out everywhere else");
    expect(mail.text).not.toMatch(HEALTH_WORDS);
    expect(mail.html).not.toMatch(HEALTH_WORDS);
  });
});

describe("link validation", () => {
  test("refuses anything that is not an absolute http or https URL", () => {
    expect(() => verificationEmail("/verify?token=abc")).toThrow(TypeError);
    expect(() => verificationEmail("javascript:alert(1)")).toThrow(TypeError);
    expect(() => passwordResetEmail("tidefern://reset")).toThrow(TypeError);
    expect(() => passwordResetEmail("")).toThrow(TypeError);
  });
});
