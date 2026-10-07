import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { FixedKeyProvider, readSubjectKey } from "@tidefern/crypto";
import { withActor } from "@tidefern/db";
import * as schema from "@tidefern/db/schema";

import { auth as moduleAuth, createAuth } from "./auth";
import type { Auth } from "./auth";
import type { HostFacts } from "./hosts";
import { userKeyDatabaseHooks } from "./keys";
import { linkIn } from "./mail/capture";
import { CaptureMailer } from "./mailer";
import { REVOKE_PATHS, SESSION_AUDIT_PLUGIN_ID } from "./sessions";
import { createMigratedAuthTestDatabase } from "./test/migrated-database";

// Synthetic people and fixed test values only; nothing here is real.
const SECRET = "a-fixed-test-secret-that-is-long-enough";
const ORIGIN = "https://tidefern.example";
const FACTS: HostFacts = {
  productionHost: "tidefern.example",
  teamSlug: "fern-team",
  vercelEnv: "production",
  vercelUrl: "tidefern-abc123def-fern-team.vercel.app",
};
const PASSWORD = "correct horse battery staple";
const DAY_MS = 24 * 60 * 60 * 1000;
const kek = new FixedKeyProvider(
  Uint8Array.from({ length: 32 }, (_, index) => (index * 5 + 3) % 256),
  "v1",
);

let harness: Awaited<ReturnType<typeof createMigratedAuthTestDatabase>>;
let mailer: CaptureMailer;
let auth: Auth;

beforeAll(async () => {
  harness = await createMigratedAuthTestDatabase();
  mailer = new CaptureMailer();
  // Built the way the module-scope instance is: the key hook passed in, the
  // session audit built into every instance.
  auth = createAuth({
    database: harness.db,
    schema,
    hosts: FACTS,
    secret: SECRET,
    mailer,
    databaseHooks: userKeyDatabaseHooks({ provider: kek, database: harness.db }),
  });
});

afterAll(async () => {
  await harness.close();
});

/** One browser: the cookies Better Auth set on it, sent back with each request. */
class Device {
  private readonly cookies = new Map<string, string>();

  remember(response: Response): Response {
    for (const line of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      const expired = value === "" || attributes.some((part) => /^\s*max-age=0\s*$/i.test(part));
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  holdsSession(): boolean {
    return [...this.cookies.keys()].some((name) => name.endsWith("session_token"));
  }
}

// Each request comes from its own address: the built-in limits allow three
// sign-ins, and three two-step attempts, per address every ten seconds.
let address = 0;

/** A same-origin browser request to the auth handler; a body makes it a POST. */
async function call(device: Device | null, path: string, body?: unknown): Promise<Response> {
  address += 1;
  const headers = new Headers({
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "x-forwarded-for": `10.0.${Math.floor(address / 250)}.${(address % 250) + 1}`,
  });
  const cookie = device?.header();
  if (cookie !== undefined) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  return device === null ? response : device.remember(response);
}

async function userIdFor(email: string): Promise<string> {
  const [row] = await harness.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  if (row === undefined) throw new Error(`no user for ${email}`);
  return row.id;
}

/** Signs a person up and follows the confirmation link, as the browser suite does. */
async function signUp(email: string): Promise<string> {
  const response = await call(null, "/sign-up/email", {
    name: "A tester",
    email,
    password: PASSWORD,
  });
  expect(response.status).toBe(200);
  const link = linkIn(mailer.last(email)?.text ?? "");
  if (link === undefined) throw new Error(`no confirmation link for ${email}`);
  const url = new URL(link);
  const confirmed = await call(null, `${url.pathname.slice("/api/auth".length)}${url.search}`);
  expect(confirmed.status).toBe(302);
  return userIdFor(email);
}

async function signIn(device: Device, email: string): Promise<{ token: string }> {
  const response = await call(device, "/sign-in/email", { email, password: PASSWORD });
  expect(response.status).toBe(200);
  expect(device.holdsSession()).toBe(true);
  return (await response.json()) as { token: string };
}

/** A six-digit code for the secret in an otpauth URI (RFC 6238), as an authenticator app computes it. */
function totp(uri: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  const key: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of secret.toUpperCase()) {
    value = ((value << 5) | alphabet.indexOf(char)) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      key.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const mac = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

const auditColumns = {
  action: schema.auditEvents.action,
  actorId: schema.auditEvents.actorId,
  subjectId: schema.auditEvents.subjectId,
  category: schema.auditEvents.category,
  childId: schema.auditEvents.childId,
  dedupeKey: schema.auditEvents.dedupeKey,
};

/** Every audit row the person is actor or subject of, oldest first, read past row level security. */
async function auditRowsOf(userId: string) {
  return harness.db
    .select(auditColumns)
    .from(schema.auditEvents)
    .where(or(eq(schema.auditEvents.actorId, userId), eq(schema.auditEvents.subjectId, userId)))
    .orderBy(schema.auditEvents.occurredAt, schema.auditEvents.id);
}

async function actionsOf(userId: string): Promise<string[]> {
  return (await auditRowsOf(userId)).map((row) => row.action);
}

/** What a session row written by the hooks holds: the person twice and nothing else. */
function sessionRow(userId: string, action: "session.sign_in" | "session.revoke") {
  return {
    action,
    actorId: userId,
    subjectId: userId,
    category: null,
    childId: null,
    dedupeKey: null,
  };
}

async function sessionExists(token: string): Promise<boolean> {
  const rows = await harness.db
    .select({ id: schema.session.id })
    .from(schema.session)
    .where(eq(schema.session.token, token));
  return rows.length === 1;
}

async function liveSessionsOf(userId: string): Promise<number> {
  const rows = await harness.db
    .select({ id: schema.session.id })
    .from(schema.session)
    .where(and(eq(schema.session.userId, userId), gt(schema.session.expiresAt, new Date())));
  return rows.length;
}

describe("signing in", () => {
  test("a password sign-in writes one session.sign_in in the person's name; sign-up and confirming write none", async () => {
    const ada = await signUp("ada@example.com");
    expect(await auditRowsOf(ada)).toEqual([]);
    // The key hook still ran: the audit is added beside it, not instead of it.
    expect((await readSubjectKey(harness.db, ada)).kind).toBe("user");

    await signIn(new Device(), "ada@example.com");
    expect(await auditRowsOf(ada)).toEqual([sessionRow(ada, "session.sign_in")]);

    // Nothing about the device: the row has no column for an address or a browser.
    const [raw] = (
      await harness.db.execute(sql`select * from audit_events where actor_id = ${ada}`)
    ).rows as Record<string, unknown>[];
    expect(Object.keys(raw ?? {}).sort()).toEqual([
      "action",
      "actor_id",
      "category",
      "child_id",
      "created_at",
      "dedupe_key",
      "id",
      "occurred_at",
      "subject_id",
    ]);

    const refused = await call(new Device(), "/sign-in/email", {
      email: "ada@example.com",
      password: "a wrong horse battery staple",
    });
    expect(refused.status).toBe(401);
    expect(await actionsOf(ada)).toEqual(["session.sign_in"]);
  });

  test("refreshing an aging session hands back the same person's session and writes nothing", async () => {
    const bea = await signUp("bea@example.com");
    const laptop = new Device();
    const { token } = await signIn(laptop, "bea@example.com");
    // Older than the one-day update age, so Better Auth extends it and sets the cookie again.
    await harness.db
      .update(schema.session)
      .set({ expiresAt: new Date(Date.now() + 5 * DAY_MS) })
      .where(eq(schema.session.token, token));
    const refreshed = await call(laptop, "/get-session");
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.getSetCookie().some((line) => line.includes("session_token="))).toBe(
      true,
    );
    expect(await actionsOf(bea)).toEqual(["session.sign_in"]);
  });

  test("two-step sign-in: turning it on writes nothing, the password step writes nothing, the second factor writes one", async () => {
    const cy = await signUp("cy@example.com");
    const laptop = new Device();
    await signIn(laptop, "cy@example.com");

    const enabled = await call(laptop, "/two-factor/enable", { password: PASSWORD });
    expect(enabled.status).toBe(200);
    const { totpURI, backupCodes } = (await enabled.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    // Confirming the first code rotates the laptop's session: the same person, not a sign-in.
    const confirmed = await call(laptop, "/two-factor/verify-totp", { code: totp(totpURI) });
    expect(confirmed.status).toBe(200);
    expect(laptop.holdsSession()).toBe(true);
    expect(await actionsOf(cy)).toEqual(["session.sign_in"]);

    // The password step makes a session that the two-factor plugin deletes at once.
    const phone = new Device();
    const challenged = await call(phone, "/sign-in/email", {
      email: "cy@example.com",
      password: PASSWORD,
    });
    expect(challenged.status).toBe(200);
    expect(await challenged.json()).toMatchObject({ twoFactorRedirect: true });
    expect(phone.holdsSession()).toBe(false);
    expect(await actionsOf(cy)).toEqual(["session.sign_in"]);

    const passed = await call(phone, "/two-factor/verify-backup-code", {
      code: backupCodes[0],
      trustDevice: true,
    });
    expect(passed.status).toBe(200);
    expect(phone.holdsSession()).toBe(true);
    expect(await actionsOf(cy)).toEqual(["session.sign_in", "session.sign_in"]);

    // No Tidefern client sends trustDevice (architecture 6.1), but the server accepts it. A
    // password sign-in on the trusted device skips the second factor, keeps its session and is
    // recorded like any other; signing out on the way writes nothing.
    expect((await call(phone, "/sign-out", {})).status).toBe(200);
    expect(phone.holdsSession()).toBe(false);
    const trusted = await call(phone, "/sign-in/email", {
      email: "cy@example.com",
      password: PASSWORD,
    });
    expect(trusted.status).toBe(200);
    expect(await trusted.json()).not.toHaveProperty("twoFactorRedirect");
    expect(phone.holdsSession()).toBe(true);
    expect(await actionsOf(cy)).toEqual(["session.sign_in", "session.sign_in", "session.sign_in"]);
  });
});

describe("signing out", () => {
  test("the device sign-out endpoints are the three Better Auth serves", () => {
    expect([...REVOKE_PATHS].sort()).toEqual(
      [
        auth.api.revokeOtherSessions.path,
        auth.api.revokeSession.path,
        auth.api.revokeSessions.path,
      ].sort(),
    );
  });

  test("signing out the device in hand writes nothing, by sign-out or by revoking its own session", async () => {
    const bo = await signUp("bo@example.com");
    const laptop = new Device();
    const { token } = await signIn(laptop, "bo@example.com");
    expect((await call(laptop, "/revoke-session", { token })).status).toBe(200);
    expect(await sessionExists(token)).toBe(false);

    const tablet = new Device();
    await signIn(tablet, "bo@example.com");
    expect((await call(tablet, "/sign-out", {})).status).toBe(200);
    expect(tablet.holdsSession()).toBe(false);

    expect(await actionsOf(bo)).toEqual(["session.sign_in", "session.sign_in"]);
  });

  test("signing out another device writes one session.revoke; a token that is not hers or not known writes nothing", async () => {
    const di = await signUp("di@example.com");
    const ed = await signUp("ed@example.com");
    const laptop = new Device();
    await signIn(laptop, "di@example.com");
    const { token: phoneToken } = await signIn(new Device(), "di@example.com");
    const { token: edsToken } = await signIn(new Device(), "ed@example.com");

    // Better Auth answers 200 to both and ends nothing.
    expect((await call(laptop, "/revoke-session", { token: edsToken })).status).toBe(200);
    expect((await call(laptop, "/revoke-session", { token: "no-such-session" })).status).toBe(200);
    expect(await sessionExists(edsToken)).toBe(true);
    expect(await actionsOf(di)).toEqual(["session.sign_in", "session.sign_in"]);

    expect((await call(laptop, "/revoke-session", { token: phoneToken })).status).toBe(200);
    expect(await sessionExists(phoneToken)).toBe(false);
    expect(await auditRowsOf(di)).toEqual([
      sessionRow(di, "session.sign_in"),
      sessionRow(di, "session.sign_in"),
      sessionRow(di, "session.revoke"),
    ]);
    expect(await auditRowsOf(ed)).toEqual([sessionRow(ed, "session.sign_in")]);
  });

  test("signing out every other device is one action and one row, and none when no other device is signed in", async () => {
    const fa = await signUp("fa@example.com");
    const laptop = new Device();
    await signIn(laptop, "fa@example.com");
    await signIn(new Device(), "fa@example.com");
    await signIn(new Device(), "fa@example.com");
    expect(await liveSessionsOf(fa)).toBe(3);

    expect((await call(laptop, "/revoke-other-sessions", {})).status).toBe(200);
    expect(await liveSessionsOf(fa)).toBe(1);
    const once = ["session.sign_in", "session.sign_in", "session.sign_in", "session.revoke"];
    expect(await actionsOf(fa)).toEqual(once);

    expect((await call(laptop, "/revoke-other-sessions", {})).status).toBe(200);
    expect(await actionsOf(fa)).toEqual(once);
  });

  test("a password reset ends every session and writes no session.revoke, even from a signed-in device", async () => {
    const nia = await signUp("nia@example.com");
    const laptop = new Device();
    await signIn(laptop, "nia@example.com");
    await signIn(new Device(), "nia@example.com");
    const requested = await call(laptop, "/request-password-reset", {
      email: "nia@example.com",
      redirectTo: "/reset",
    });
    expect(requested.status).toBe(200);
    const link = linkIn(mailer.last("nia@example.com")?.text ?? "");
    if (link === undefined) throw new Error("no reset link for nia@example.com");
    const token = new URL(link).pathname.split("/").at(-1);

    const reset = await call(laptop, "/reset-password", {
      newPassword: "a new horse battery staple",
      token,
    });
    expect(reset.status).toBe(200);
    expect(await liveSessionsOf(nia)).toBe(0);
    expect(await actionsOf(nia)).toEqual(["session.sign_in", "session.sign_in"]);
  });

  test("ending sessions outside any request, as a job or a script would, writes nothing and finishes", async () => {
    const lev = await signUp("lev@example.com");
    const { token } = await signIn(new Device(), "lev@example.com");
    await signIn(new Device(), "lev@example.com");
    const { internalAdapter } = await auth.$context;

    // Outside a request Better Auth hands the delete hook no context at all.
    await internalAdapter.deleteSession(token);
    expect(await sessionExists(token)).toBe(false);
    await internalAdapter.deleteUserSessions(lev);
    expect(await liveSessionsOf(lev)).toBe(0);
    expect(await actionsOf(lev)).toEqual(["session.sign_in", "session.sign_in"]);

    // Deleting a person ends her sessions first; the hook must not stop it before her
    // accounts and her user row go.
    await signIn(new Device(), "lev@example.com");
    await internalAdapter.deleteUser(lev);
    const left = await harness.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, lev));
    expect(left).toEqual([]);
  });

  test("signing out everywhere writes one row when another device was signed in, and none when the other had expired", async () => {
    const gus = await signUp("gus@example.com");
    const laptop = new Device();
    await signIn(laptop, "gus@example.com");
    await signIn(new Device(), "gus@example.com");
    expect((await call(laptop, "/revoke-sessions", {})).status).toBe(200);
    expect(await liveSessionsOf(gus)).toBe(0);
    expect(await actionsOf(gus)).toEqual(["session.sign_in", "session.sign_in", "session.revoke"]);

    // A session already past its expiry signed nobody in; ending it is not a device sign-out.
    const again = new Device();
    await signIn(again, "gus@example.com");
    const { token: stale } = await signIn(new Device(), "gus@example.com");
    await harness.db
      .update(schema.session)
      .set({ expiresAt: new Date(Date.now() - DAY_MS) })
      .where(eq(schema.session.token, stale));
    expect((await call(again, "/revoke-sessions", {})).status).toBe(200);
    expect(await sessionExists(stale)).toBe(false);
    expect(await actionsOf(gus)).toEqual([
      "session.sign_in",
      "session.sign_in",
      "session.revoke",
      "session.sign_in",
      "session.sign_in",
    ]);
  });
});

describe("who sees the rows", () => {
  test("the person reads her sign-in and her device sign-out as herself, and nobody else reads either", async () => {
    const hal = await signUp("hal@example.com");
    const ivy = await signUp("ivy@example.com");
    const laptop = new Device();
    await signIn(laptop, "hal@example.com");
    const { token } = await signIn(new Device(), "hal@example.com");
    expect((await call(laptop, "/revoke-session", { token })).status).toBe(200);
    await signIn(new Device(), "ivy@example.com");

    const readAs = (actorId: string) =>
      withActor(
        actorId,
        (tx) =>
          tx
            .select(auditColumns)
            .from(schema.auditEvents)
            .orderBy(schema.auditEvents.occurredAt, schema.auditEvents.id),
        harness.db,
      );
    expect(await readAs(hal)).toEqual([
      sessionRow(hal, "session.sign_in"),
      sessionRow(hal, "session.sign_in"),
      sessionRow(hal, "session.revoke"),
    ]);
    expect(await readAs(ivy)).toEqual([sessionRow(ivy, "session.sign_in")]);
  });
});

describe("when the row cannot be written", () => {
  /**
   * Runs `request` while the app role may not insert audit rows, and returns
   * its response with everything handed to the console, formatted as Node
   * prints it, so a test can see what a log line would carry.
   */
  async function whileAuditRefused(request: () => Promise<Response>) {
    const printed: string[] = [];
    const spies = (["error", "warn", "log"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        printed.push(
          args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 8 }))).join(" "),
        );
      }),
    );
    await harness.db.execute(sql`revoke insert on audit_events from tidefern_app`);
    try {
      const response = await request();
      return { response, printed: printed.join("\n") };
    } finally {
      await harness.db.execute(sql`grant insert on audit_events to tidefern_app`);
      for (const spy of spies) spy.mockRestore();
    }
  }

  test("a sign-in fails, hands out no session cookie, leaves no session behind, and the log names no one", async () => {
    const jo = await signUp("jo@example.com");
    const device = new Device();
    const { response, printed } = await whileAuditRefused(() =>
      call(device, "/sign-in/email", { email: "jo@example.com", password: PASSWORD }),
    );
    expect(response.status).toBe(500);
    expect(device.holdsSession()).toBe(false);
    expect(await actionsOf(jo)).toEqual([]);
    // Nobody holds the session the sign-in made, so it is ended, not left on her devices list.
    expect(await liveSessionsOf(jo)).toBe(0);
    // Better Auth logs what the hook threw: the action and the refusal's code, never the id.
    expect(printed).toContain("SessionAuditError");
    expect(printed).toContain("42501");
    expect(printed).not.toContain(jo);
    expect(printed).not.toContain("jo@example.com");

    // Trying again once the row can be written lists one device, the one she holds.
    await signIn(device, "jo@example.com");
    const listed = await call(device, "/list-sessions");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toHaveLength(1);
    expect(await actionsOf(jo)).toEqual(["session.sign_in"]);
  });

  test("when that session cannot be ended either, the audit failure is still the error and no log line quotes the token", async () => {
    const lia = await signUp("lia@example.com");
    await harness.db.execute(
      sql`create function refuse_session_delete() returns trigger language plpgsql as $$
        begin raise exception 'session deletes are refused in this test'; end $$`,
    );
    await harness.db.execute(
      sql`create trigger refuse_session_delete before delete on session for each row execute function refuse_session_delete()`,
    );
    try {
      const device = new Device();
      const { response, printed } = await whileAuditRefused(() =>
        call(device, "/sign-in/email", { email: "lia@example.com", password: PASSWORD }),
      );
      expect(response.status).toBe(500);
      expect(device.holdsSession()).toBe(false);
      expect(await actionsOf(lia)).toEqual([]);
      const [left] = await harness.db
        .select({ token: schema.session.token })
        .from(schema.session)
        .where(eq(schema.session.userId, lia));
      if (left === undefined) throw new Error("the refused delete should have left the session");
      expect(printed).toContain("SessionAuditError");
      // The leftover is reported by the refusal's code alone (P0001, which the trigger raises).
      expect(printed).toContain("could not be ended");
      expect(printed).toContain("P0001");
      expect(printed).not.toContain(left.token);
      expect(printed).not.toContain(lia);
      expect(printed).not.toContain("lia@example.com");
    } finally {
      await harness.db.execute(sql`drop trigger refuse_session_delete on session`);
      await harness.db.execute(sql`drop function refuse_session_delete()`);
    }
  });

  test("a device sign-out answers an error although the device was signed out, and the log names no one", async () => {
    const kai = await signUp("kai@example.com");
    const laptop = new Device();
    await signIn(laptop, "kai@example.com");
    const { token } = await signIn(new Device(), "kai@example.com");
    const { response, printed } = await whileAuditRefused(() =>
      call(laptop, "/revoke-session", { token }),
    );
    expect(response.status).toBe(500);
    expect(await sessionExists(token)).toBe(false);
    expect(await actionsOf(kai)).toEqual(["session.sign_in", "session.sign_in"]);
    expect(printed).toContain("SessionAuditError");
    expect(printed).toContain("42501");
    expect(printed).not.toContain(kai);
    expect(printed).not.toContain("kai@example.com");
  });
});

describe("the module-scope instance", () => {
  test("carries the key hook and lists the session audit after two-factor", () => {
    expect(moduleAuth.options.plugins?.map((plugin) => plugin.id)).toEqual([
      "two-factor",
      "passkey",
      SESSION_AUDIT_PLUGIN_ID,
    ]);
    expect(typeof moduleAuth.options.databaseHooks?.user?.create?.after).toBe("function");
  });
});
