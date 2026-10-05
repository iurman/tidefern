import { describe, expect, test } from "vitest";

import {
  passwordResetEmail,
  reminderEmail,
  securityNoticeEmail,
  verificationEmail,
} from "./templates";
import type { MailContent } from "./templates";

const APEX = "tidefern.example";
const LINK = `https://${APEX}/api/auth/verify-email?token=abc&callbackURL=%2F`;

// Words that must never appear in mail; the subjects and bodies are generic.
const HEALTH_WORDS = /cycle|period|pregnan|baby|child|symptom|ovulat|due date|growth/i;

// The short list the task names, asserted word by word against every template.
const FORBIDDEN = [
  "period",
  "cycle",
  "pregnancy",
  "pregnant",
  "fertile",
  "ovulation",
  "baby",
  "child",
  "symptom",
];

function urlsIn(text: string): string[] {
  return text.match(/https?:\/\/\S+/g) ?? [];
}

/** Every `href` and every bare URL in the html, with entities decoded. */
function htmlUrlsIn(html: string): string[] {
  return urlsIn(html.replaceAll("&amp;", "&").replaceAll('"', " ").replaceAll("<", " "));
}

const TEMPLATES: Record<string, (url: string) => MailContent> = {
  verificationEmail,
  passwordResetEmail,
  reminderEmail: (url) => reminderEmail(url, "Ada"),
  securityNoticeEmail: (url) => securityNoticeEmail(url, "Ada"),
};

describe("every template", () => {
  for (const [name, render] of Object.entries(TEMPLATES)) {
    test(`${name} carries no forbidden word in its subject or body`, () => {
      const mail = render(LINK);
      const haystacks = [mail.subject, mail.text, mail.html ?? ""].map((s) => s.toLowerCase());
      for (const word of FORBIDDEN) {
        for (const haystack of haystacks) expect(haystack).not.toContain(word);
      }
    });

    test(`${name} links only to https URLs on the apex`, () => {
      const mail = render(LINK);
      const links = [...urlsIn(mail.text), ...htmlUrlsIn(mail.html ?? "")];
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        const parsed = new URL(link);
        expect(parsed.protocol).toBe("https:");
        expect(parsed.hostname).toBe(APEX);
      }
    });
  }
});

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

describe("reminderEmail", () => {
  test("uses the generic subject and body at every detail level and greets by first name", () => {
    const mail = reminderEmail(`https://${APEX}/today`, "Ada");
    expect(mail.subject).toBe("Your Tidefern reminder");
    expect(mail.text).toContain("You have a reminder in Tidefern");
    expect(mail.text.startsWith("Hi Ada,")).toBe(true);
    expect(urlsIn(mail.text)).toEqual([`https://${APEX}/today`]);
    expect(mail.text).not.toMatch(HEALTH_WORDS);
    expect(mail.html).not.toMatch(HEALTH_WORDS);
  });

  test("greets without a name when none is given, and escapes the name in html", () => {
    expect(reminderEmail(`https://${APEX}/today`).text.startsWith("Hi,")).toBe(true);
    expect(reminderEmail(`https://${APEX}/today`, "   ").text.startsWith("Hi,")).toBe(true);
    const mail = reminderEmail(`https://${APEX}/today`, 'A<b>"da\nX');
    expect(mail.text.startsWith('Hi A<b>"da X,')).toBe(true);
    expect(mail.html).toContain("<p>Hi A&lt;b&gt;&quot;da X,</p>");
  });
});

describe("securityNoticeEmail", () => {
  test("says a sign-in happened, nothing more, and links to the sessions page", () => {
    const mail = securityNoticeEmail(`https://${APEX}/settings/security`, "Ada");
    expect(mail.subject).toBe("A security notice for your Tidefern account");
    expect(mail.text).toContain("new sign-in to your Tidefern account");
    expect(mail.text).toContain("change your password");
    expect(urlsIn(mail.text)).toEqual([`https://${APEX}/settings/security`]);
    expect(mail.text).not.toMatch(HEALTH_WORDS);
    expect(mail.html).toContain(`<a href="https://${APEX}/settings/security">`);
  });
});

describe("link validation", () => {
  test("refuses anything that is not an absolute http or https URL", () => {
    expect(() => verificationEmail("/verify?token=abc")).toThrow(TypeError);
    expect(() => verificationEmail("javascript:alert(1)")).toThrow(TypeError);
    expect(() => passwordResetEmail("tidefern://reset")).toThrow(TypeError);
    expect(() => passwordResetEmail("")).toThrow(TypeError);
    expect(() => reminderEmail("/today")).toThrow(TypeError);
    expect(() => securityNoticeEmail("mailto:someone@example.com")).toThrow(TypeError);
  });
});
