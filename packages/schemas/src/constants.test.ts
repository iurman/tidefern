import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import * as constants from "./constants";
import * as root from "./index";
import { InvitationAcceptInput, InvitationInput } from "./sharing";

describe("the Zod-free constants entry", () => {
  it("imports nothing at runtime, so a client component that uses it ships no Zod", () => {
    const source = readFileSync(new URL("./constants.ts", import.meta.url), "utf8");
    const imports = source.match(/^import[^;]*;/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const statement of imports) expect(statement).toMatch(/^import type /);
    expect(source).not.toMatch(/^export \* from/m);
    expect(source).not.toMatch(/^export \{[^}]*\} from/m);
  });

  it("is re-exported by the root entry, binding for binding", () => {
    for (const [name, value] of Object.entries(constants)) {
      if (
        name.startsWith("INVITATION_") ||
        name.startsWith("INVITEE_") ||
        name.startsWith("isInvit")
      ) {
        continue;
      }
      expect(root, name).toHaveProperty(name);
      expect((root as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("keeps the code lists in the order of the root enums", () => {
    expect(constants.FLOW_CODES).toEqual(root.FlowLevel.options);
    expect(constants.SYMPTOM_CODES).toEqual(root.SymptomCode.options);
    expect(constants.MOOD_CODES).toEqual(root.MoodCode.options);
  });
});

describe("the invitation checks", () => {
  it("copies the address pattern of the installed Zod", () => {
    expect(constants.INVITEE_EMAIL_PATTERN.source).toBe(z.regexes.email.source);
    expect(constants.INVITEE_EMAIL_PATTERN.flags).toBe(z.regexes.email.flags);
  });

  const addresses = [
    "lena@example.com",
    "lena.marsh+invite@example.co.uk",
    "o'brien@example.org",
    "",
    "lena",
    "lena@",
    "@example.com",
    "lena@example",
    "lena@@example.com",
    "lena@example.c",
    " lena@example.com",
    "lena..marsh@example.com",
    `${"a".repeat(64)}@${"b".repeat(185)}.com`,
    `${"a".repeat(64)}@${"b".repeat(186)}.com`,
  ];

  it.each(addresses)("answers %j as InvitationInput.inviteeEmail does", (address) => {
    expect(constants.isInviteeEmail(address)).toBe(
      InvitationInput.shape.inviteeEmail.safeParse(address).success,
    );
  });

  it("accepts an address of exactly the longest length and refuses one longer", () => {
    expect(constants.isInviteeEmail(`${"a".repeat(64)}@${"b".repeat(185)}.com`)).toBe(true);
    expect(constants.isInviteeEmail(`${"a".repeat(64)}@${"b".repeat(186)}.com`)).toBe(false);
  });

  const tokens = [
    "a".repeat(32),
    "A1_-".repeat(32),
    "a".repeat(31),
    "a".repeat(129),
    `${"a".repeat(31)}=`,
    `${"a".repeat(32)} `,
    "",
  ];

  it.each(tokens)("answers token %j as InvitationAcceptInput.token does", (token) => {
    expect(constants.isInvitationToken(token)).toBe(
      InvitationAcceptInput.shape.token.safeParse(token).success,
    );
  });
});
