// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { grantCopy } from "@/components/ui/grant-row";
import { activityCopy as copy } from "./copy";
import {
  ACTIVITY_ACTIONS,
  activityDay,
  activityRow,
  describeActivity,
  type ActivityContext,
  type ActivityEvent,
} from "./sentences";

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const PIA = "018f5e7a-5eed-7000-8000-000000000005";
const SOL = "018f5e7a-5eed-7020-8000-000000000002";
/** A former partner: her rows stay in the log, but GET /v1/sharing no longer lists her. */
const GONE = "018f5e7a-5eed-7000-8000-000000000099";

const repository = resolve(__dirname, "../../../../../..");

/** The owner's view: Noor, who shares with Theo. */
const noor: ActivityContext = {
  me: NOOR,
  names: { [THEO]: "Theo" },
  guardianOf: [],
  timeZone: "Europe/Berlin",
  today: "2026-10-05",
};

/** The grantee's view: Theo, who reads what Noor shares. */
const theo: ActivityContext = { ...noor, me: THEO, names: { [NOOR]: "Noor" } };

/** A guardian's view: Mira, who guards Sol and contributes to Lena's pregnancy. */
const mira: ActivityContext = {
  me: MIRA,
  names: { [LENA]: "Lena", [SOL]: "Sol" },
  guardianOf: [SOL],
  timeZone: "America/Vancouver",
  today: "2026-10-04",
};

/** A child grantee's view: Pia reaches Sol through a grant and never learns his name here. */
const pia: ActivityContext = {
  me: PIA,
  // Even a name that reached the map is not used for a child she does not guard.
  names: { [SOL]: "Sol" },
  guardianOf: [],
  timeZone: "America/New_York",
  today: "2026-10-04",
};

function event(patch: Partial<ActivityEvent> & Pick<ActivityEvent, "action">): ActivityEvent {
  return {
    id: "018f5e7a-5eed-7050-8000-000000000001",
    actorId: NOOR,
    subjectId: NOOR,
    occurredAt: "2026-10-04T21:00:00.000Z",
    ...patch,
  };
}

function line(
  context: ActivityContext,
  patch: Partial<ActivityEvent> & Pick<ActivityEvent, "action">,
) {
  return describeActivity(event(patch), context);
}

/** The names `auditActions` holds in its source: the one vocabulary the API and the session hooks write. */
function vocabulary(): string[] {
  const source = readFileSync(resolve(repository, "packages/db/src/audit.ts"), "utf8");
  const start = source.indexOf("export const auditActions = {");
  const end = source.indexOf("} as const;", start);
  expect(start, "the vocabulary's list was found").toBeGreaterThanOrEqual(0);
  return [...source.slice(start, end).matchAll(/"([a-z]+(?:\.[a-z_]+)+)"/g)].map(
    (match) => match[1] as string,
  );
}

describe("the sentence map", () => {
  it("says her own sign-in and the devices she signed out", () => {
    expect(line(noor, { action: "session.sign_in" })).toEqual({ what: "Signed in", who: "by you" });
    expect(line(noor, { action: "session.revoke" })).toEqual({
      what: "Signed out other devices",
      who: "by you",
    });
  });

  it("names the category of a grant change on her records by its sharing label", () => {
    expect(line(noor, { action: "grant.create", category: "cycle.status" }).what).toBe(
      "Started sharing your cycle status",
    );
    expect(line(noor, { action: "grant.update", category: "cycle.symptoms" }).what).toBe(
      "Changed sharing for your symptoms",
    );
    expect(line(noor, { action: "grant.revoke", category: "cycle.history" })).toEqual({
      what: "Stopped sharing your cycle history",
      who: "by you",
    });
    expect(line(noor, { action: "grant.create", category: "pregnancy.photos" }).what).toBe(
      "Started sharing your pregnancy photos",
    );
  });

  it("names the partner whose reads and contributions touched her records", () => {
    expect(
      line(noor, { action: "partner.read", actorId: THEO, category: "cycle.symptoms" }),
    ).toEqual({ what: "Viewed your symptoms", who: "by Theo" });
    const lena: ActivityContext = { ...mira, me: LENA, names: { [MIRA]: "Mira" } };
    expect(
      line(lena, {
        action: "partner.write",
        actorId: MIRA,
        subjectId: LENA,
        category: "pregnancy.overview",
      }),
    ).toEqual({ what: "Contributed to your pregnancy overview", who: "by Mira" });
  });

  it("names the owner of what a grantee viewed or contributed to", () => {
    expect(
      line(theo, {
        action: "partner.read",
        actorId: THEO,
        subjectId: NOOR,
        category: "cycle.symptoms",
      }),
    ).toEqual({ what: "Viewed Noor's symptoms", who: "by you" });
    expect(
      line(mira, {
        action: "partner.write",
        actorId: MIRA,
        subjectId: LENA,
        category: "pregnancy.overview",
      }),
    ).toEqual({ what: "Contributed to Lena's pregnancy overview", who: "by you" });
  });

  it("falls back to neutral words for a person the page cannot name", () => {
    expect(line(noor, { action: "partner.read", actorId: GONE, category: "cycle.status" })).toEqual(
      { what: "Viewed your cycle status", who: "by someone you shared with" },
    );
    expect(
      line(theo, {
        action: "partner.read",
        actorId: THEO,
        subjectId: GONE,
        category: "cycle.symptoms",
      }).what,
    ).toBe("Viewed the symptoms someone shared with you");
  });

  it("says access ended when the grantee's closure or withdrawal revoked it", () => {
    expect(
      line(noor, { action: "grant.revoke", actorId: THEO, category: "cycle.symptoms" }),
    ).toEqual({ what: "Ended access to your symptoms", who: "by Theo" });
    expect(
      line(theo, {
        action: "grant.revoke",
        actorId: THEO,
        subjectId: NOOR,
        category: "cycle.status",
      }),
    ).toEqual({ what: "Ended access to Noor's cycle status", who: "by you" });
  });

  it("names a child only for her guardian", () => {
    const sol = { subjectId: SOL, category: "child" as const, childId: SOL };
    expect(line(mira, { action: "grant.create", actorId: MIRA, ...sol })).toEqual({
      what: "Started sharing Sol's records",
      who: "by you",
    });
    expect(line(mira, { action: "grant.revoke", actorId: MIRA, ...sol }).what).toBe(
      "Stopped sharing Sol's records",
    );
    expect(line(pia, { action: "partner.read", actorId: PIA, ...sol })).toEqual({
      what: "Viewed a child's records",
      who: "by you",
    });
    expect(line(pia, { action: "partner.write", actorId: PIA, ...sol }).what).toBe(
      "Contributed to a child's records",
    );
    expect(line(pia, { action: "grant.revoke", actorId: PIA, ...sol }).what).toBe(
      "Ended access to a child's records",
    );
  });

  it("says where a shared note went, by the category's label", () => {
    expect(line(noor, { action: "note.share", category: "cycle.symptoms" }).what).toBe(
      "Shared a note with people who can see your symptoms",
    );
    expect(line(noor, { action: "note.share", category: "pregnancy.overview" }).what).toBe(
      "Shared a note with people who can see your pregnancy overview",
    );
  });

  it("says the invitations, the export and the closure in her own words", () => {
    const whats = (
      [
        "invitation.create",
        "invitation.withdraw",
        "invitation.accept",
        "export.create",
        "account.close",
        "account.close.undo",
      ] as const
    ).map((action) => line(noor, { action }));
    expect(whats).toEqual([
      { what: "Sent an invitation", who: "by you" },
      { what: "Withdrew an invitation", who: "by you" },
      { what: "Accepted an invitation", who: "by you" },
      { what: "Requested a copy of your data", who: "by you" },
      { what: "Asked to close your account", who: "by you" },
      { what: "Cancelled closing your account", who: "by you" },
    ]);
  });

  it("reads an unknown action or category as a neutral line, never as its code", () => {
    expect(line(noor, { action: "photo.share", actorId: THEO })).toEqual({
      what: "Other activity on your account",
      who: "by Theo",
    });
    const unknownCategory = "cycle.temperature" as ActivityEvent["category"];
    expect(
      line(noor, { action: "partner.read", actorId: THEO, category: unknownCategory }).what,
    ).toBe("Viewed your shared records");
    expect(line(noor, { action: "partner.read", actorId: THEO }).what).toBe(
      "Viewed your shared records",
    );
    // The private journal is never shared; a row that says otherwise reads neutrally.
    expect(line(noor, { action: "note.share", category: "journal.private" }).what).toBe(
      "Other activity on your account",
    );
  });

  it("has words of its own for every name in the audit vocabulary, and for no other", () => {
    const names = vocabulary();
    expect(names.length).toBeGreaterThan(0);
    expect([...ACTIVITY_ACTIONS].sort()).toEqual([...names].sort());
    for (const action of names) {
      expect(line(noor, { action, category: "cycle.symptoms" }).what, action).not.toBe(
        copy.what.other,
      );
    }
  });

  it("never carries a health word or a code, only a category's label", () => {
    const labels = [
      ...Object.values(grantCopy).map((entry) => entry.label.toLowerCase()),
      copy.privateNotes,
      copy.otherRecords,
      "records",
    ].sort((a, b) => b.length - a.length);
    const categories: Array<ActivityEvent["category"]> = [
      undefined,
      "cycle.status",
      "cycle.history",
      "cycle.symptoms",
      "journal.private",
      "pregnancy.overview",
      "pregnancy.photos",
      "child",
    ];
    const relations: Array<[ActivityContext, Partial<ActivityEvent>]> = [
      [noor, {}],
      [noor, { actorId: THEO }],
      [noor, { actorId: GONE }],
      [theo, { actorId: THEO, subjectId: NOOR }],
      [theo, { actorId: THEO, subjectId: GONE }],
      [mira, { actorId: MIRA, subjectId: SOL, childId: SOL }],
      [pia, { actorId: PIA, subjectId: SOL, childId: SOL }],
    ];
    const health =
      /\b(period|flow|bleed|spotting|cramp|ovulat|fertil|contracept|pregnant|miscarr|loss|birth|symptom|mood|weight|length|feed|diaper|sleep|milestone|temperature|sex|medical|diagnos|health|cycle|pregnancy)/i;
    let checked = 0;
    for (const action of [...ACTIVITY_ACTIONS, "photo.share"]) {
      for (const category of categories) {
        for (const [context, patch] of relations) {
          const { what, who } = line(context, {
            action,
            ...patch,
            ...(category === undefined ? {} : { category }),
          });
          for (const text of [what, who]) {
            expect(text, `${action} ${category}`).not.toMatch(/[a-z]+\.[a-z_]+|_/);
            const bare = labels.reduce((rest, label) => rest.split(label).join(" "), text);
            expect(bare, `${action} ${category}: ${text}`).not.toMatch(health);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe((ACTIVITY_ACTIONS.length + 1) * categories.length * relations.length * 2);
  });
});

describe("the day a row shows", () => {
  it("reads the instant in the profile's zone, never the device's", () => {
    // 22:30 UTC on Oct 4 is already Oct 5 in Berlin and still Oct 4 in Vancouver.
    expect(activityDay("2026-10-04T22:30:00.000Z", "Europe/Berlin")).toBe("2026-10-05");
    expect(activityDay("2026-10-04T22:30:00.000Z", "America/Vancouver")).toBe("2026-10-04");
  });

  it("shows the day, and the year only for a row from another year than today", () => {
    const recent = activityRow(
      event({ action: "session.sign_in", occurredAt: "2026-10-04T21:00:00.000Z" }),
      noor,
    );
    expect(recent).toMatchObject({ day: "2026-10-04", dayLabel: "Oct 4", year: null });
    const older = activityRow(
      event({
        action: "grant.create",
        category: "pregnancy.overview",
        occurredAt: "2025-12-28T18:00:00.000Z",
      }),
      noor,
    );
    expect(older).toMatchObject({
      day: "2025-12-28",
      dayLabel: "Dec 28",
      year: "2025",
      what: "Started sharing your pregnancy overview",
      who: "by you",
    });
  });
});
