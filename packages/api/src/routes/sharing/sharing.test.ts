import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@tidefern/db";
import {
  GrantSetting,
  Id,
  Invitation,
  InvitationAcceptance,
  Problem,
  ShareCategory,
  ShareLevel,
  SharingGrant,
  SharingPeople,
  SharingPerson,
} from "@tidefern/schemas";

import { createApp } from "../../app";
import { FRESH_AUTHENTICATION_REQUIRED } from "../../auth";
import type { MailMessage } from "../../jobs/notice";
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_REPLAYED_HEADER } from "../../middleware/index";
import { sessionHeaders } from "../../test/auth-fake";
import type { FakeAuth } from "../../test/auth-fake";
import { ANNA, BEN, CARA, OWN_ORIGIN, TOKENS, createActorFixture } from "../../test/actors";
import type { ApiTestDatabase } from "../../test/database";
import {
  INVITATION_SUBJECT,
  configureSharing,
  hashToken,
  invitationMail,
  sharingDetails,
} from "./index";

// Synthetic ids only; nothing here is a real person. Anna owns the household
// with Ben (her partner and the co-guardian of Mo) and Dana (a partner who
// guards nobody). Cara is the invitee, Fred a stranger, Gus an account whose
// email was never verified.
const DANA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f40";
const FRED = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f50";
const GUS = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f60";
const HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fa0";
const CARAS_HOUSEHOLD = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9fb0";
const MO = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f11";
const ATTESTED_AT = new Date("2026-10-04T18:30:00Z");

let harness: ApiTestDatabase;
let auth: FakeAuth;
let app: ReturnType<typeof createApp>;
const sent: MailMessage[] = [];
let keyCount = 0;

/** A fresh UUID for every create, so no two requests share an idempotency row. */
function key(): string {
  keyCount += 1;
  return `018f5e7a-7000-7000-8000-${String(keyCount).padStart(12, "0")}`;
}

function request(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const init: RequestInit = {
    method,
    headers: {
      ...sessionHeaders(token),
      origin: OWN_ORIGIN,
      ...(method === "POST" ? { [IDEMPOTENCY_KEY_HEADER]: key() } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init);
}

async function problemOf(response: Response): Promise<Problem> {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  return Problem.parse(await response.json());
}

async function people(token: string): Promise<SharingPerson[]> {
  const response = await request(token, "GET", "/api/v1/sharing");
  expect(response.status).toBe(200);
  return SharingPeople.parse(await response.json()).items;
}

async function personFor(token: string, id: string): Promise<SharingPerson> {
  const found = (await people(token)).find((person) => person.id === id);
  if (found === undefined) throw new Error(`${id} is not listed for ${token}`);
  return found;
}

function linkToken(message: MailMessage): string {
  const match = /#invitation=([A-Za-z0-9_-]+)/.exec(message.text);
  if (match === null || match[1] === undefined) throw new Error("the mail carries no token");
  return match[1];
}

async function auditRows(subjectId: string) {
  return harness.db
    .select({
      actorId: schema.auditEvents.actorId,
      action: schema.auditEvents.action,
      category: schema.auditEvents.category,
      childId: schema.auditEvents.childId,
    })
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.subjectId, subjectId))
    .orderBy(schema.auditEvents.id);
}

async function membership(userId: string, householdId: string) {
  const [row] = await harness.db
    .select({ status: schema.householdMembers.status, role: schema.householdMembers.role })
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.userId, userId),
        eq(schema.householdMembers.householdId, householdId),
      ),
    );
  return row ?? null;
}

beforeAll(async () => {
  const fixture = await createActorFixture();
  harness = fixture.harness;
  const { db } = harness;
  await db.insert(schema.user).values([
    { id: DANA, name: "Dana", email: "dana@example.com", emailVerified: true },
    { id: FRED, name: "Fred", email: "fred@example.com", emailVerified: true },
    { id: GUS, name: "Gus", email: "gus@example.com", emailVerified: false },
  ]);
  await db.insert(schema.profiles).values([
    {
      userId: ANNA,
      displayName: "Anna",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      ageAttestedAt: ATTESTED_AT,
    },
    { userId: BEN, displayName: "Ben", timeZone: "Europe/Berlin", ageAttestedAt: ATTESTED_AT },
    { userId: DANA, displayName: "Dana", timeZone: "Europe/Berlin", ageAttestedAt: ATTESTED_AT },
    { userId: CARA, displayName: "Cara", timeZone: "Europe/Berlin", ageAttestedAt: ATTESTED_AT },
  ]);
  await db.insert(schema.households).values([{ id: HOUSEHOLD }, { id: CARAS_HOUSEHOLD }]);
  await db.insert(schema.householdMembers).values([
    {
      id: "018f5e7a-2000-7000-8000-00000000b001",
      householdId: HOUSEHOLD,
      userId: ANNA,
      role: "owner",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000b002",
      householdId: HOUSEHOLD,
      userId: BEN,
      role: "partner",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000b003",
      householdId: HOUSEHOLD,
      userId: DANA,
      role: "partner",
    },
    {
      id: "018f5e7a-2000-7000-8000-00000000b004",
      householdId: CARAS_HOUSEHOLD,
      userId: CARA,
      role: "owner",
    },
  ]);
  await db
    .insert(schema.children)
    .values({ id: MO, householdId: HOUSEHOLD, displayName: "Mo", dateOfBirth: "2025-03-01" });
  await db.insert(schema.childGuardians).values([
    { id: "018f5e7a-2000-7000-8000-00000000a001", childId: MO, userId: ANNA },
    { id: "018f5e7a-2000-7000-8000-00000000a002", childId: MO, userId: BEN },
  ]);
  auth = fixture.auth;
  auth.signIn("dana", DANA, "dana@example.com", 60);
  auth.signIn("fred", FRED, "fred@example.com", 60);
  auth.signIn("gus", GUS, "gus@example.com", 60);
  auth.signIn("anna-stale", ANNA, "anna@example.com", 11 * 60);
  app = createApp({ auth, db, log: { sink: () => undefined } });
  configureSharing(app, {
    mailer: {
      async send(message) {
        sent.push(message);
      },
    },
    siteUrl: "https://tidefern.example",
  });
});

afterAll(async () => {
  await harness.close();
});

describe("the sharing schemas", () => {
  it("repeat the index primitives exactly", () => {
    expect(GrantSetting.shape.category.options).toEqual(ShareCategory.options);
    expect(SharingGrant.shape.category.options).toEqual(ShareCategory.options);
    expect(SharingGrant.shape.level.options).toEqual(ShareLevel.options);
    expect(GrantSetting.shape.level.unwrap().options).toEqual(ShareLevel.options);
    expect(Id.safeParse("018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10").success).toBe(true);
  });

  it("never name the private journal and tie a child to its grant", () => {
    expect(GrantSetting.safeParse({ category: "journal.private", level: "read" }).success).toBe(
      false,
    );
    expect(GrantSetting.safeParse({ category: "child", level: "read" }).success).toBe(false);
    expect(
      GrantSetting.safeParse({ category: "cycle.status", level: "read", childId: MO }).success,
    ).toBe(false);
    expect(GrantSetting.safeParse({ category: "child", level: null, childId: MO }).success).toBe(
      true,
    );
  });

  it("render the invitation mail as generic words and the link", () => {
    const message = invitationMail(
      "cara@example.com",
      "https://tidefern.example/sharing#invitation=abc",
    );
    expect(message.subject).toBe(INVITATION_SUBJECT);
    expect(message.text).toContain("https://tidefern.example/sharing#invitation=abc");
    expect(message.html).toBeUndefined();
    for (const word of ["period", "pregnan", "cycle", "symptom", "Anna", "anna@"]) {
      expect(message.text.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});

describe("GET /v1/sharing", () => {
  it("lists the owner's household members and co-guardians with no grants yet", async () => {
    const items = await people(TOKENS.anna);
    expect(items.map((person) => person.id).sort()).toEqual([BEN, DANA].sort());
    const ben = items.find((person) => person.id === BEN);
    expect(ben).toMatchObject({
      displayName: "Ben",
      role: "partner",
      householdId: HOUSEHOLD,
      guardianOf: [MO],
      grants: [],
      notify: false,
      version: 0,
    });
    const dana = items.find((person) => person.id === DANA);
    expect(dana).toMatchObject({
      displayName: "Dana",
      role: "partner",
      guardianOf: [],
      grants: [],
    });
  });

  it("answers an empty page to a stranger and 401 without a session", async () => {
    expect(await people("fred")).toEqual([]);
    expect((await app.request("/api/v1/sharing")).status).toBe(401);
  });

  it("walks the list with an opaque cursor and refuses a malformed one", async () => {
    const first = await request(TOKENS.anna, "GET", "/api/v1/sharing?limit=1");
    const page = SharingPeople.parse(await first.json());
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = await request(
      TOKENS.anna,
      "GET",
      `/api/v1/sharing?limit=1&cursor=${page.nextCursor}`,
    );
    const rest = SharingPeople.parse(await second.json());
    expect(rest.items).toHaveLength(1);
    expect(rest.items[0]?.id).not.toBe(page.items[0]?.id);
    expect(rest.nextCursor).toBeNull();
    const bad = await request(TOKENS.anna, "GET", "/api/v1/sharing?cursor=not-a-cursor");
    expect(bad.status).toBe(422);
    expect((await problemOf(bad)).detail).toBe("cursor_invalid");
    expect((await request(TOKENS.anna, "GET", "/api/v1/sharing?limit=0")).status).toBe(422);
  });
});

describe("PUT /v1/sharing/grants/{personId}", () => {
  const body = {
    grants: [
      { category: "cycle.status", level: "summary" },
      { category: "cycle.symptoms", level: "read" },
    ],
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
  };

  it("creates the owner's grants to a partner and audits each", async () => {
    const response = await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${DANA}`, body);
    expect(response.status).toBe(200);
    const dana = SharingPerson.parse(await response.json());
    expect(dana.grants.map((grant) => [grant.category, grant.level])).toEqual([
      ["cycle.status", "summary"],
      ["cycle.symptoms", "read"],
    ]);
    expect(dana.version).toBe(2);
    expect(await auditRows(ANNA)).toEqual([
      { actorId: ANNA, action: "grant.create", category: "cycle.status", childId: null },
      { actorId: ANNA, action: "grant.create", category: "cycle.symptoms", childId: null },
    ]);
    const me = await request("dana", "GET", "/api/v1/me");
    const held = ((await me.json()) as { grants: { category: string; level: string }[] }).grants;
    expect(held.map((grant) => `${grant.category}:${grant.level}`)).toEqual([
      "cycle.status:summary",
      "cycle.symptoms:read",
    ]);
  });

  it("changes a level, revokes with null and leaves unlisted categories alone", async () => {
    const response = await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${DANA}`, {
      ...body,
      grants: [
        { category: "cycle.status", level: "read" },
        { category: "cycle.symptoms", level: null },
        { category: "pregnancy.overview", level: null },
      ],
    });
    expect(response.status).toBe(200);
    const dana = SharingPerson.parse(await response.json());
    expect(dana.grants.map((grant) => [grant.category, grant.level, grant.version])).toEqual([
      ["cycle.status", "read", 2],
    ]);
    expect(dana.version).toBe(4);
    const rows = await auditRows(ANNA);
    expect(rows.slice(2)).toEqual([
      { actorId: ANNA, action: "grant.update", category: "cycle.status", childId: null },
      { actorId: ANNA, action: "grant.revoke", category: "cycle.symptoms", childId: null },
    ]);
    const revoked = await harness.db
      .select({ revokedAt: schema.grants.revokedAt, version: schema.grants.version })
      .from(schema.grants)
      .where(and(eq(schema.grants.granteeId, DANA), eq(schema.grants.category, "cycle.symptoms")));
    expect(revoked[0]?.revokedAt).not.toBeNull();
    expect(revoked[0]?.version).toBe(2);
  });

  it("lets a guardian grant a child to a partner, and nobody else", async () => {
    const guardian = await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${DANA}`, {
      ...body,
      grants: [{ category: "child", level: "read", childId: MO }],
    });
    expect(guardian.status).toBe(200);
    const dana = SharingPerson.parse(await guardian.json());
    expect(dana.grants.find((grant) => grant.category === "child")).toMatchObject({
      level: "read",
      childId: MO,
    });
    expect((await auditRows(MO)).at(-1)).toEqual({
      actorId: ANNA,
      action: "grant.create",
      category: "child",
      childId: MO,
    });
    // Dana is a household member but guards no child: can() denies the share and the answer is 404.
    const partner = await request("dana", "PUT", `/api/v1/sharing/grants/${BEN}`, {
      ...body,
      grants: [{ category: "child", level: "read", childId: MO }],
    });
    expect(partner.status).toBe(404);
    expect((await problemOf(partner)).code).toBe("not_found");
  });

  it("answers 404 for a person outside the actor's sharing, whoever asks", async () => {
    expect((await request("fred", "PUT", `/api/v1/sharing/grants/${ANNA}`, body)).status).toBe(404);
    expect((await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${FRED}`, body)).status).toBe(
      404,
    );
    expect((await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${ANNA}`, body)).status).toBe(
      404,
    );
  });

  it("validates the body: the private journal, a child without its child, an empty list, a category twice", async () => {
    for (const grants of [
      [{ category: "journal.private", level: "read" }],
      [{ category: "child", level: "read" }],
      [{ category: "cycle.status", level: "read", childId: MO }],
      [{ category: "cycle.status", level: "full" }],
      [],
      [
        { category: "cycle.history", level: "read" },
        { category: "cycle.history", level: "summary" },
      ],
      [
        { category: "child", level: "read", childId: MO },
        { category: "child", level: null, childId: MO },
      ],
    ]) {
      const response = await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${DANA}`, {
        ...body,
        grants,
      });
      expect(response.status).toBe(422);
      const problem = await problemOf(response);
      expect(problem.code).toBe("validation_failed");
      expect(problem.errors?.length).toBeGreaterThan(0);
    }
  });

  it("needs a fresh authentication", async () => {
    const response = await request("anna-stale", "PUT", `/api/v1/sharing/grants/${DANA}`, body);
    expect(response.status).toBe(401);
    expect((await problemOf(response)).detail).toBe(FRESH_AUTHENTICATION_REQUIRED);
  });

  it("honours If-Match and answers 409 on a stale version", async () => {
    const dana = await personFor(TOKENS.anna, DANA);
    const stale = await request(
      TOKENS.anna,
      "PUT",
      `/api/v1/sharing/grants/${DANA}`,
      { ...body, grants: [{ category: "cycle.history", level: "summary" }] },
      { "If-Match": `"${dana.version - 1}"` },
    );
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).detail).toBe(sharingDetails.staleVersion);
    expect(
      (await personFor(TOKENS.anna, DANA)).grants.map((grant) => grant.category),
    ).not.toContain("cycle.history");
    const current = await request(
      TOKENS.anna,
      "PUT",
      `/api/v1/sharing/grants/${DANA}`,
      { ...body, grants: [{ category: "cycle.history", level: "summary" }] },
      { "If-Match": String(dana.version) },
    );
    expect(current.status).toBe(200);
    expect(SharingPerson.parse(await current.json()).version).toBe(dana.version + 1);
    const malformed = await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${DANA}`, body, {
      "If-Match": "latest",
    });
    expect(malformed.status).toBe(422);
  });
});

describe("a grantee's view", () => {
  it("carries nothing outside the granted categories and nothing of the owner's other people", async () => {
    // Dana holds read on cycle.status, summary on cycle.history and read on Mo.
    const response = await request("dana", "GET", "/api/v1/sharing");
    expect(response.status).toBe(200);
    const text = await response.text();
    const items = SharingPeople.parse(JSON.parse(text)).items;
    const anna = items.find((person) => person.id === ANNA);
    expect(anna).toEqual({
      id: ANNA,
      displayName: "Anna",
      role: "owner",
      householdId: HOUSEHOLD,
      guardianOf: [],
      grants: [],
      notify: false,
      version: 0,
    });
    for (const forbidden of [
      "stage",
      "timeZone",
      "Europe/Berlin",
      "inviteeEmail",
      "cycle.symptoms",
      MO,
    ]) {
      expect(text).not.toContain(forbidden);
    }
    const annasGrants = await harness.db
      .select({ id: schema.grants.id })
      .from(schema.grants)
      .where(eq(schema.grants.ownerId, ANNA));
    for (const grant of annasGrants) expect(text).not.toContain(grant.id);
    const invitations = await request("dana", "GET", "/api/v1/sharing/invitations");
    expect(await invitations.json()).toEqual({ items: [], nextCursor: null });
  });

  it("is the same for a summary grantee", async () => {
    const granted = await request(TOKENS.anna, "PUT", `/api/v1/sharing/grants/${BEN}`, {
      grants: [{ category: "cycle.history", level: "summary" }],
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    expect(granted.status).toBe(200);
    const me = await request(TOKENS.ben, "GET", "/api/v1/me");
    const held = ((await me.json()) as { grants: { category: string; level: string }[] }).grants;
    expect(held.map((grant) => `${grant.category}:${grant.level}`)).toEqual([
      "cycle.history:summary",
    ]);

    const response = await request(TOKENS.ben, "GET", "/api/v1/sharing");
    const text = await response.text();
    const items = SharingPeople.parse(JSON.parse(text)).items;
    expect(items.map((person) => person.id).sort()).toEqual([ANNA, DANA].sort());
    expect(items.find((person) => person.id === ANNA)).toMatchObject({
      displayName: "Anna",
      guardianOf: [MO],
      grants: [],
    });
    for (const forbidden of ["stage", "timeZone", "cycle.status", "cycle.history"]) {
      expect(text).not.toContain(forbidden);
    }
    const revoked = await request(
      TOKENS.anna,
      "DELETE",
      `/api/v1/sharing/grants/${BEN}/cycle.history`,
    );
    expect(revoked.status).toBe(204);
  });
});

describe("PUT /v1/sharing/notify", () => {
  it("flips the switch on every active grant to the person and bumps the version", async () => {
    const before = await personFor(TOKENS.anna, DANA);
    expect(before.notify).toBe(false);
    const response = await request(
      TOKENS.anna,
      "PUT",
      "/api/v1/sharing/notify",
      { personId: DANA, notify: true },
      { "If-Match": String(before.version) },
    );
    expect(response.status).toBe(200);
    const after = SharingPerson.parse(await response.json());
    expect(after.notify).toBe(true);
    expect(after.grants.every((grant) => grant.notify)).toBe(true);
    expect(after.version).toBe(before.version + after.grants.length);
    const stale = await request(
      TOKENS.anna,
      "PUT",
      "/api/v1/sharing/notify",
      { personId: DANA, notify: false },
      { "If-Match": String(before.version) },
    );
    expect(stale.status).toBe(409);
  });

  it("answers 404 for a person with nothing shared and for a stranger", async () => {
    expect(
      (await request(TOKENS.anna, "PUT", "/api/v1/sharing/notify", { personId: BEN, notify: true }))
        .status,
    ).toBe(404);
    expect(
      (await request("fred", "PUT", "/api/v1/sharing/notify", { personId: ANNA, notify: true }))
        .status,
    ).toBe(404);
  });
});

describe("DELETE /v1/sharing/grants/{personId}/{category}", () => {
  it("revokes one category, audited before the revoke, and 404s a second time", async () => {
    const response = await request(
      TOKENS.anna,
      "DELETE",
      `/api/v1/sharing/grants/${DANA}/cycle.history`,
    );
    expect(response.status).toBe(204);
    expect((await auditRows(ANNA)).at(-1)).toMatchObject({
      action: "grant.revoke",
      category: "cycle.history",
    });
    expect((await personFor(TOKENS.anna, DANA)).grants.map((grant) => grant.category)).toEqual([
      "cycle.status",
      "child",
    ]);
    const again = await request(
      TOKENS.anna,
      "DELETE",
      `/api/v1/sharing/grants/${DANA}/cycle.history`,
    );
    expect(again.status).toBe(404);
    const me = await request("dana", "GET", "/api/v1/me");
    const held = ((await me.json()) as { grants: { category: string }[] }).grants;
    expect(held.map((grant) => grant.category)).not.toContain("cycle.history");
  });

  it("names the child for a child grant and refuses a stranger", async () => {
    const missing = await request(TOKENS.anna, "DELETE", `/api/v1/sharing/grants/${DANA}/child`);
    expect(missing.status).toBe(422);
    expect((await problemOf(missing)).detail).toBe("child_id_matches_category");
    expect(
      (await request("fred", "DELETE", `/api/v1/sharing/grants/${DANA}/cycle.status`)).status,
    ).toBe(404);
    const unknown = await request(
      TOKENS.anna,
      "DELETE",
      `/api/v1/sharing/grants/${DANA}/journal.private`,
    );
    expect(unknown.status).toBe(422);
    const child = await request(
      TOKENS.anna,
      "DELETE",
      `/api/v1/sharing/grants/${DANA}/child?childId=${MO}`,
    );
    expect(child.status).toBe(204);
    expect((await auditRows(MO)).at(-1)).toEqual({
      actorId: ANNA,
      action: "grant.revoke",
      category: "child",
      childId: MO,
    });
  });
});

describe("invitations", () => {
  let invitationId = "";
  let token = "";

  it("needs a fresh authentication and a valid body", async () => {
    const stale = await request("anna-stale", "POST", "/api/v1/sharing/invitations", {
      inviteeEmail: "cara@example.com",
      role: "partner",
    });
    expect(stale.status).toBe(401);
    expect((await problemOf(stale)).detail).toBe(FRESH_AUTHENTICATION_REQUIRED);
    for (const body of [
      { inviteeEmail: "not-an-address", role: "partner" },
      { inviteeEmail: "cara@example.com", role: "owner" },
      { inviteeEmail: "cara@example.com" },
      {
        inviteeEmail: "cara@example.com",
        role: "partner",
        id: "018f5e7a-1c2b-4d3e-9a4f-5b6c7d8e9f10",
      },
    ]) {
      const response = await request(TOKENS.anna, "POST", "/api/v1/sharing/invitations", body);
      expect(response.status).toBe(422);
      expect((await problemOf(response)).code).toBe("validation_failed");
    }
    expect(sent).toHaveLength(0);
  });

  it("fails closed with 503 and prints nothing when the host configured no mailer", async () => {
    const bare = createApp({ auth, db: harness.db, log: { sink: () => undefined } });
    const printed = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const response = await bare.request("/api/v1/sharing/invitations", {
        method: "POST",
        headers: {
          ...sessionHeaders(TOKENS.anna),
          origin: OWN_ORIGIN,
          [IDEMPOTENCY_KEY_HEADER]: key(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ inviteeEmail: "nobody@example.com", role: "partner" }),
      });
      expect(response.status).toBe(503);
      const problem = await problemOf(response);
      expect(problem.code).toBe("internal");
      expect(problem.detail).toBe(sharingDetails.mailUnavailable);
      expect(JSON.stringify(problem)).not.toContain("nobody@example.com");
      expect(printed).not.toHaveBeenCalled();
    } finally {
      printed.mockRestore();
    }
    const rows = await harness.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(eq(schema.invitations.inviteeEmail, "nobody@example.com"));
    expect(rows).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it("sends one mail with the link, stores only the hash, audits, and replays the create", async () => {
    const idempotencyKey = key();
    const send = () =>
      request(
        TOKENS.anna,
        "POST",
        "/api/v1/sharing/invitations",
        { inviteeEmail: "Cara@Example.com", role: "partner" },
        { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      );
    const response = await send();
    expect(response.status).toBe(201);
    const invitation = Invitation.parse(await response.json());
    invitationId = invitation.id;
    expect(response.headers.get("location")).toBe(`/api/v1/sharing/invitations/${invitation.id}`);
    expect(invitation).toMatchObject({
      householdId: HOUSEHOLD,
      inviteeEmail: "cara@example.com",
      role: "partner",
    });
    expect(
      new Date(invitation.expiresAt).getTime() - new Date(invitation.createdAt).getTime(),
    ).toBe(72 * 60 * 60_000);

    expect(sent).toHaveLength(1);
    const message = sent[0]!;
    expect(message.to).toBe("cara@example.com");
    expect(message.subject).toBe(INVITATION_SUBJECT);
    token = linkToken(message);
    expect(message.text).toContain(`https://tidefern.example/sharing#invitation=${token}`);
    const [row] = await harness.db
      .select({ tokenHash: schema.invitations.tokenHash, inviterId: schema.invitations.inviterId })
      .from(schema.invitations)
      .where(eq(schema.invitations.id, invitation.id));
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(row?.tokenHash).not.toContain(token);
    expect(row?.inviterId).toBe(ANNA);
    expect((await auditRows(ANNA)).at(-1)).toMatchObject({
      action: "invitation.create",
      category: null,
    });

    const replay = await send();
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENCY_REPLAYED_HEADER)).toBe("true");
    expect(await replay.json()).toEqual({ id: invitation.id });
    expect(sent).toHaveLength(1);
    const rows = await harness.db.select({ id: schema.invitations.id }).from(schema.invitations);
    expect(rows).toHaveLength(1);
  });

  it("refuses a second open invitation to the same address", async () => {
    const response = await request(TOKENS.anna, "POST", "/api/v1/sharing/invitations", {
      inviteeEmail: "cara@example.com",
      role: "guardian",
    });
    expect(response.status).toBe(409);
    expect((await problemOf(response)).detail).toBe(sharingDetails.invitationPending);
    expect(sent).toHaveLength(1);
  });

  it("lists the pending invitation to the inviter only", async () => {
    const mine = await request(TOKENS.anna, "GET", "/api/v1/sharing/invitations");
    const page = (await mine.json()) as { items: Invitation[]; nextCursor: string | null };
    expect(page.items.map((item) => item.id)).toEqual([invitationId]);
    expect(page.nextCursor).toBeNull();
    const partner = await request(TOKENS.ben, "GET", "/api/v1/sharing/invitations");
    expect(await partner.json()).toEqual({ items: [], nextCursor: null });
  });

  it("refuses acceptance by anyone but the invitee signed in with that verified email", async () => {
    for (const who of [TOKENS.anna, "fred", "gus"]) {
      const response = await request(who, "POST", "/api/v1/sharing/invitations/accept", { token });
      expect(response.status).toBe(404);
      expect((await problemOf(response)).code).toBe("not_found");
    }
    const wrong = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token: token.replace(/.$/, (last) => (last === "a" ? "b" : "a")),
    });
    expect(wrong.status).toBe(404);
    const malformed = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token: "short",
    });
    expect(malformed.status).toBe(422);
    expect(await membership(CARA, HOUSEHOLD)).toBeNull();
  });

  it("asks an invitee who already belongs to another household which to join", async () => {
    const undecided = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token,
    });
    expect(undecided.status).toBe(409);
    expect((await problemOf(undecided)).detail).toBe(sharingDetails.householdChoiceRequired);

    const stayed = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token,
      household: "stay",
    });
    expect(stayed.status).toBe(200);
    expect(InvitationAcceptance.parse(await stayed.json())).toEqual({
      invitationId,
      joined: false,
      householdId: null,
    });
    expect(await membership(CARA, HOUSEHOLD)).toBeNull();
    expect(await membership(CARA, CARAS_HOUSEHOLD)).toMatchObject({ status: "active" });

    // Fred joins Cara's household, so moving would leave it without an owner.
    await harness.db.insert(schema.householdMembers).values({
      id: "018f5e7a-2000-7000-8000-00000000b005",
      householdId: CARAS_HOUSEHOLD,
      userId: FRED,
      role: "partner",
    });
    const blocked = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token,
      household: "move",
    });
    expect(blocked.status).toBe(409);
    expect((await problemOf(blocked)).detail).toBe(sharingDetails.householdOwnerMustHandOver);
    await harness.db
      .update(schema.householdMembers)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(schema.householdMembers.userId, FRED));

    const moved = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token,
      household: "move",
    });
    expect(moved.status).toBe(200);
    expect(InvitationAcceptance.parse(await moved.json())).toEqual({
      invitationId,
      joined: true,
      householdId: HOUSEHOLD,
    });
    expect(await membership(CARA, HOUSEHOLD)).toEqual({ status: "active", role: "partner" });
    expect(await membership(CARA, CARAS_HOUSEHOLD)).toMatchObject({ status: "ended" });
    expect((await auditRows(CARA)).at(-1)).toMatchObject({
      actorId: CARA,
      action: "invitation.accept",
    });
    const [row] = await harness.db
      .select({ acceptedAt: schema.invitations.acceptedAt })
      .from(schema.invitations)
      .where(eq(schema.invitations.id, invitationId));
    expect(row?.acceptedAt).not.toBeNull();
  });

  it("is single use, and the inviter now lists the invitee as a partner", async () => {
    const again = await request(TOKENS.cara, "POST", "/api/v1/sharing/invitations/accept", {
      token,
    });
    expect(again.status).toBe(404);
    expect(await personFor(TOKENS.anna, CARA)).toMatchObject({
      displayName: "Cara",
      role: "partner",
      householdId: HOUSEHOLD,
      grants: [],
    });
    const pending = await request(TOKENS.anna, "GET", "/api/v1/sharing/invitations");
    expect(await pending.json()).toEqual({ items: [], nextCursor: null });
  });

  it("is withdrawn by the inviter, 404 to everyone else and to an expired one", async () => {
    const sendTo = (address: string) =>
      request(TOKENS.anna, "POST", "/api/v1/sharing/invitations", {
        inviteeEmail: address,
        role: "guardian",
      });
    const created = Invitation.parse(await (await sendTo("eve@example.com")).json());
    expect(
      (await request("fred", "DELETE", `/api/v1/sharing/invitations/${created.id}`)).status,
    ).toBe(404);
    expect(
      (await request(TOKENS.ben, "DELETE", `/api/v1/sharing/invitations/${created.id}`)).status,
    ).toBe(404);
    const withdrawn = await request(
      TOKENS.anna,
      "DELETE",
      `/api/v1/sharing/invitations/${created.id}`,
    );
    expect(withdrawn.status).toBe(204);
    expect((await auditRows(ANNA)).at(-1)).toMatchObject({ action: "invitation.withdraw" });
    expect(
      (await request(TOKENS.anna, "DELETE", `/api/v1/sharing/invitations/${created.id}`)).status,
    ).toBe(404);
    const withdrawnToken = linkToken(sent.at(-1)!);
    expect(
      (
        await request("fred", "POST", "/api/v1/sharing/invitations/accept", {
          token: withdrawnToken,
        })
      ).status,
    ).toBe(404);

    // An expired one: the row says so and nothing lists or accepts it.
    const expiredToken = "expired-token-expired-token-expired-token";
    await harness.db.insert(schema.invitations).values({
      id: "018f5e7a-2000-7000-8000-00000000c001",
      householdId: HOUSEHOLD,
      inviterId: ANNA,
      inviteeEmail: "fred@example.com",
      role: "partner",
      tokenHash: hashToken(expiredToken),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const pending = await request(TOKENS.anna, "GET", "/api/v1/sharing/invitations");
    expect(await pending.json()).toEqual({ items: [], nextCursor: null });
    const late = await request("fred", "POST", "/api/v1/sharing/invitations/accept", {
      token: expiredToken,
    });
    expect(late.status).toBe(404);
    expect(await membership(FRED, HOUSEHOLD)).toBeNull();
  });

  it("creates the inviter's household on her first invitation", async () => {
    const before = sent.length;
    const response = await request("fred", "POST", "/api/v1/sharing/invitations", {
      inviteeEmail: "gus@example.com",
      role: "partner",
    });
    expect(response.status).toBe(201);
    const invitation = Invitation.parse(await response.json());
    expect(invitation.householdId).not.toBe(HOUSEHOLD);
    expect(await membership(FRED, invitation.householdId)).toEqual({
      status: "active",
      role: "owner",
    });
    expect(sent).toHaveLength(before + 1);
  });

  it("refuses a partner in another household instead of giving her a second one", async () => {
    const before = sent.length;
    const response = await request("dana", "POST", "/api/v1/sharing/invitations", {
      inviteeEmail: "fred@example.com",
      role: "partner",
    });
    expect(response.status).toBe(409);
    expect((await problemOf(response)).detail).toBe(sharingDetails.memberOfAnotherHousehold);
    const owned = await harness.db
      .select({ id: schema.householdMembers.id })
      .from(schema.householdMembers)
      .where(
        and(eq(schema.householdMembers.userId, DANA), eq(schema.householdMembers.role, "owner")),
      );
    expect(owned).toEqual([]);
    expect(await membership(DANA, HOUSEHOLD)).toEqual({ status: "active", role: "partner" });
    expect(sent).toHaveLength(before);
  });
});

describe("DELETE /v1/sharing/people/{personId}", () => {
  it("refuses while the person is the only other guardian of a child", async () => {
    const response = await request(TOKENS.anna, "DELETE", `/api/v1/sharing/people/${BEN}`);
    expect(response.status).toBe(409);
    expect((await problemOf(response)).detail).toBe(sharingDetails.coGuardianshipUnresolved);
    expect(await membership(BEN, HOUSEHOLD)).toMatchObject({ status: "active" });
  });

  it("between two partners revokes the remover's grants and ends no membership", async () => {
    const granted = await request(TOKENS.ben, "PUT", `/api/v1/sharing/grants/${DANA}`, {
      grants: [{ category: "cycle.status", level: "read" }],
      policyVersion: "2026-10",
      descriptionVersion: "2026-10",
    });
    expect(granted.status).toBe(200);
    const response = await request(TOKENS.ben, "DELETE", `/api/v1/sharing/people/${DANA}`);
    expect(response.status).toBe(204);
    expect((await auditRows(BEN)).at(-1)).toMatchObject({
      actorId: BEN,
      action: "grant.revoke",
      category: "cycle.status",
    });
    expect((await personFor(TOKENS.ben, DANA)).grants).toEqual([]);
    expect(await membership(BEN, HOUSEHOLD)).toMatchObject({ status: "active" });
    expect(await membership(DANA, HOUSEHOLD)).toMatchObject({ status: "active" });
  });

  it("revokes every grant and ends the membership, with 404 for a stranger", async () => {
    expect((await request("fred", "DELETE", `/api/v1/sharing/people/${DANA}`)).status).toBe(404);
    expect((await personFor(TOKENS.anna, DANA)).grants).toHaveLength(1);
    const response = await request(TOKENS.anna, "DELETE", `/api/v1/sharing/people/${DANA}`);
    expect(response.status).toBe(204);
    expect((await auditRows(ANNA)).at(-1)).toMatchObject({
      action: "grant.revoke",
      category: "cycle.status",
    });
    expect(await membership(DANA, HOUSEHOLD)).toMatchObject({ status: "ended" });
    expect((await people(TOKENS.anna)).map((person) => person.id)).not.toContain(DANA);
    const me = await request("dana", "GET", "/api/v1/me");
    expect(((await me.json()) as { grants: unknown[] }).grants).toEqual([]);
    expect((await request(TOKENS.anna, "DELETE", `/api/v1/sharing/people/${DANA}`)).status).toBe(
      404,
    );
  });

  it("lets a partner leave the owner's household when she removes the owner", async () => {
    const response = await request(TOKENS.cara, "DELETE", `/api/v1/sharing/people/${ANNA}`);
    expect(response.status).toBe(204);
    expect(await membership(CARA, HOUSEHOLD)).toMatchObject({ status: "ended" });
    expect(await membership(ANNA, HOUSEHOLD)).toMatchObject({ status: "active" });
  });
});

describe("the contract", () => {
  it("lists every sharing route with named components", async () => {
    const document = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(
      Object.keys(document.paths)
        .filter((path) => path.includes("/sharing"))
        .sort(),
    ).toEqual([
      "/api/v1/sharing",
      "/api/v1/sharing/grants/{personId}",
      "/api/v1/sharing/grants/{personId}/{category}",
      "/api/v1/sharing/invitations",
      "/api/v1/sharing/invitations/accept",
      "/api/v1/sharing/invitations/{id}",
      "/api/v1/sharing/notify",
      "/api/v1/sharing/people/{personId}",
    ]);
    for (const name of [
      "SharingPerson",
      "SharingGrant",
      "Invitation",
      "InvitationAcceptance",
      "GrantSetInput",
    ]) {
      expect(document.components.schemas).toHaveProperty(name);
    }
  });
});
