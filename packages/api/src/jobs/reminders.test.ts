import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { CaptureMailer, reminderEmail } from "@tidefern/auth";
import { schema } from "@tidefern/db";
import { SweepRoleError, assertIdsOnly, enqueue } from "@tidefern/db/jobs";
import type { ActorDatabase, Job } from "@tidefern/db/jobs";

import { createApp } from "../app";
import { calendarClock, realCalendarClock } from "../clock";
import { REMINDER_PAYLOAD_KEY } from "../routes/pregnancy/index";
import { jobHandlers } from "./handlers";
import { drainDue, jobContext } from "./index";
import {
  REMINDER_JOB_TYPE,
  ReminderMailUnavailableError,
  configureReminders,
  enqueueReminders,
  parseReminderPayload,
  sendReminder,
} from "./reminders";
import { createJobsTestDatabase } from "./test-database";
import type { JobsTestDatabase } from "./test-database";

/**
 * The reminder step and the `reminder.send` handler on PGlite with the
 * capture mailer. The clock is 2026-10-06 06:00 UTC: 19:00 that day in
 * Auckland, 23:00 the day before in Los Angeles, 08:00 in Berlin, so
 * "tomorrow" is a different calendar day for different people at the same
 * instant.
 */
let database: JobsTestDatabase;

const NOW = new Date("2026-10-06T06:00:00Z");
const NEXT_DAY = new Date("2026-10-07T06:00:00Z");
const SITE = "https://tidefern.example";

// Synthetic ids only; nothing here is a real person.
const id = (n: number) => `018f5e7a-1c2b-7d3e-9a4f-${n.toString(16).padStart(12, "0")}`;
const ANNA = id(0xa1); // pregnant, Auckland
const CARA = id(0xc1); // pregnant, Los Angeles
const DANA = id(0xd1); // cycling, Berlin, shares with Ben, Erin, Fred and Gil
const IVY = id(0xe1); // cycling, Berlin, bleeding continues an earlier run
const BEN = id(0xb1); // Dana's partner, notify on
const ERIN = id(0xb2); // notify off
const FRED = id(0xb3); // notify on, grant revoked
const GIL = id(0xb4); // notify on, pregnancy overview only
const HAL = id(0xb5); // notify on, email not verified
const JO = id(0xb6); // notify on, account closing

const ANNA_PREGNANCY = id(0x1a1);
const CARA_PREGNANCY = id(0x1c1);
const ANNA_ENDED = id(0x1a2);
const ANNA_TOMORROW = id(0x2a1);
const ANNA_TODAY = id(0x2a2);
const ANNA_LATER = id(0x2a3);
const ANNA_DELETED = id(0x2a4);
const ANNA_MILESTONE = id(0x2a5);
const ANNA_ON_ENDED = id(0x2a6);
const CARA_TOMORROW = id(0x2c1);
const CARA_NEXT = id(0x2c2);
const DANA_START = id(0x3d1);
const IVY_EARLIER = id(0x3e1);
const IVY_TODAY = id(0x3e2);
const BEN_GRANT = id(0x4b1);
const FRED_GRANT = id(0x4b3);

// Words that must never reach a subject or body, the auth templates' list
// and its regular expression together.
const HEALTH_WORDS =
  /cycle|period|pregnan|baby|child|symptom|ovulat|due date|growth|fertil|appointment|bleed|flow/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function reminderJobs(): Promise<Job[]> {
  return database.db.select().from(schema.jobs).where(eq(schema.jobs.type, REMINDER_JOB_TYPE));
}

function payloads(jobs: readonly Job[]) {
  return jobs
    .map((job) => parseReminderPayload(job.payloadJson))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

function grant(
  n: number,
  granteeId: string,
  overrides: Partial<typeof schema.grants.$inferInsert> = {},
): typeof schema.grants.$inferInsert {
  return {
    id: id(0x400 + n),
    ownerId: DANA,
    granteeId,
    category: "cycle.status",
    level: "summary",
    policyVersion: "2026-10",
    descriptionVersion: "2026-10",
    notify: true,
    ...overrides,
  };
}

beforeAll(async () => {
  database = await createJobsTestDatabase();
  const { db } = database;
  const people = [ANNA, CARA, DANA, IVY, BEN, ERIN, FRED, GIL, HAL, JO];
  await db.insert(schema.user).values(
    people.map((person, index) => ({
      id: person,
      name: `Person ${index}`,
      email: `person${index}@example.test`,
      emailVerified: person !== HAL,
    })),
  );
  const zones: Record<string, string> = {
    [ANNA]: "Pacific/Auckland",
    [CARA]: "America/Los_Angeles",
    [DANA]: "Europe/Berlin",
    [IVY]: "Europe/Berlin",
  };
  await db.insert(schema.profiles).values(
    people.map((person) => ({
      userId: person,
      displayName: person === ANNA ? "Anna" : person === BEN ? "Ben" : null,
      timeZone: zones[person] ?? "Europe/London",
      ageAttestedAt: NOW,
    })),
  );
  await db.insert(schema.pregnancies).values([
    {
      id: ANNA_ENDED,
      subjectId: ANNA,
      dueDate: "2025-06-01",
      datingMethod: "lmp",
      endedAt: "2025-05-30",
      endedReason: "birth",
    },
    { id: ANNA_PREGNANCY, subjectId: ANNA, dueDate: "2027-03-01", datingMethod: "lmp" },
    { id: CARA_PREGNANCY, subjectId: CARA, dueDate: "2027-02-01", datingMethod: "ultrasound" },
  ]);
  const event = (eventId: string, pregnancyId: string, subjectId: string, date: string) => ({
    id: eventId,
    pregnancyId,
    subjectId,
    kind: "appointment" as const,
    date,
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  });
  await db
    .insert(schema.pregnancyEvents)
    .values([
      event(ANNA_TOMORROW, ANNA_PREGNANCY, ANNA, "2026-10-07"),
      event(ANNA_TODAY, ANNA_PREGNANCY, ANNA, "2026-10-06"),
      event(ANNA_LATER, ANNA_PREGNANCY, ANNA, "2026-10-08"),
      { ...event(ANNA_DELETED, ANNA_PREGNANCY, ANNA, "2026-10-07"), deletedAt: NOW },
      { ...event(ANNA_MILESTONE, ANNA_PREGNANCY, ANNA, "2026-10-07"), kind: "milestone" },
      event(ANNA_ON_ENDED, ANNA_ENDED, ANNA, "2026-10-07"),
      event(CARA_TOMORROW, CARA_PREGNANCY, CARA, "2026-10-06"),
      event(CARA_NEXT, CARA_PREGNANCY, CARA, "2026-10-07"),
    ]);
  await db.insert(schema.cycleEntries).values([
    { id: id(0x3d0), subjectId: DANA, date: "2026-09-08", flow: "heavy" },
    { id: id(0x3d2), subjectId: DANA, date: "2026-10-03", flow: "spotting" },
    { id: DANA_START, subjectId: DANA, date: "2026-10-06", flow: "medium" },
    { id: IVY_EARLIER, subjectId: IVY, date: "2026-10-04", flow: "light" },
    { id: IVY_TODAY, subjectId: IVY, date: "2026-10-06", flow: "light" },
  ]);
  await db
    .insert(schema.grants)
    .values([
      { ...grant(0xb1, BEN), id: BEN_GRANT },
      grant(0xb2, ERIN, { category: "cycle.history", level: "read", notify: false }),
      { ...grant(0xb3, FRED), id: FRED_GRANT, revokedAt: new Date("2026-10-01T00:00:00Z") },
      grant(0xb4, GIL, { category: "pregnancy.overview" }),
      grant(0xb5, HAL),
      grant(0xb6, JO, { category: "cycle.history" }),
      grant(0xe1, BEN, { ownerId: IVY }),
    ]);
  await db.insert(schema.dataRequests).values({
    id: id(0x5b6),
    userId: JO,
    kind: "closure",
    state: "requested",
    deadlineAt: new Date("2026-11-20T00:00:00Z"),
    undoUntil: new Date("2026-10-13T00:00:00Z"),
  });
});

afterAll(() => database.close());

let mailer: CaptureMailer;

beforeEach(async () => {
  await database.db.delete(schema.jobs);
  mailer = new CaptureMailer();
  configureReminders({ mailer, siteUrl: SITE, template: reminderEmail });
});

afterEach(() => {
  configureReminders(undefined);
  vi.restoreAllMocks();
});

describe("enqueueReminders", () => {
  test("enqueues an appointment due tomorrow in the subject's own zone and none on another day", async () => {
    const counts = await enqueueReminders(database.db, NOW);
    const due = payloads(await reminderJobs()).filter((p) => p.eventIds);
    expect(due).toEqual(
      [
        { userId: ANNA, pregnancyId: ANNA_PREGNANCY, eventIds: [ANNA_TOMORROW] },
        { userId: CARA, pregnancyId: CARA_PREGNANCY, eventIds: [CARA_TOMORROW] },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
    expect(counts.appointments).toBe(2);

    // A day later in Los Angeles the other appointment is tomorrow; Anna's
    // next one is two days out from her new today and waits.
    await database.db.delete(schema.jobs);
    await enqueueReminders(database.db, NEXT_DAY);
    const nextDay = payloads(await reminderJobs()).filter((p) => p.eventIds);
    expect(nextDay).toEqual(
      [
        { userId: ANNA, pregnancyId: ANNA_PREGNANCY, eventIds: [ANNA_LATER] },
        { userId: CARA, pregnancyId: CARA_PREGNANCY, eventIds: [CARA_NEXT] },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
  });

  test("uses the key the pregnancy end route cancels by", async () => {
    await enqueueReminders(database.db, NOW);
    const [anna] = (await reminderJobs()).filter(
      (job) => (job.payloadJson as { userId?: string }).userId === ANNA,
    );
    expect(REMINDER_PAYLOAD_KEY).toBe("pregnancyId");
    expect((anna?.payloadJson as Record<string, unknown>)[REMINDER_PAYLOAD_KEY]).toBe(
      ANNA_PREGNANCY,
    );
  });

  test("writes one job per recipient with ids only in the payload", async () => {
    await enqueueReminders(database.db, NOW);
    const jobs = await reminderJobs();
    const recipients = jobs.map((job) => (job.payloadJson as { userId: string }).userId);
    expect(new Set(recipients).size).toBe(recipients.length);
    for (const job of jobs) {
      expect(() => assertIdsOnly(job.payloadJson)).not.toThrow();
      const values = Object.values(job.payloadJson).flat();
      for (const value of values) expect(value).toMatch(UUID);
      expect(JSON.stringify(job.payloadJson)).not.toMatch(/\d{4}-\d{2}-\d{2}(?!-)/);
      expect(Object.keys(job.payloadJson).sort()).toEqual(expect.arrayContaining(["userId"]));
      for (const key of Object.keys(job.payloadJson)) {
        expect(["userId", "pregnancyId", "eventIds", "entryIds"]).toContain(key);
      }
    }
  });

  test("tells a partner of a period start only through an active grant with notify on", async () => {
    const counts = await enqueueReminders(database.db, NOW);
    const notices = payloads(await reminderJobs()).filter((p) => p.entryIds);
    // Ben only: Erin's switch is off, Fred's grant is revoked, Gil's grant
    // is to the pregnancy overview, Hal's email is not verified and Jo's
    // account is closing. Ivy's bleeding continues a run that began two days
    // ago, so it is no start. Dana herself is never told her own.
    expect(notices).toEqual([{ userId: BEN, entryIds: [DANA_START] }]);
    expect(counts.periodNotices).toBe(1);
    const recipients = (await reminderJobs()).map(
      (job) => (job.payloadJson as { userId: string }).userId,
    );
    for (const nobody of [DANA, ERIN, FRED, GIL, HAL, JO, IVY]) {
      expect(recipients).not.toContain(nobody);
    }
  });

  test("a second run the same day, or the next day, repeats nothing", async () => {
    const first = await enqueueReminders(database.db, NOW);
    expect(first.jobs).toBe(3);
    // Half an hour on it is still the same local day everywhere in the cast
    // (an hour on, Los Angeles is past midnight and its next day is due).
    const again = await enqueueReminders(database.db, new Date(NOW.getTime() + 30 * 60_000));
    expect(again).toEqual({ appointments: 0, periodNotices: 0, jobs: 0 });
    // The next day Dana's start is yesterday, already told; only the
    // appointments now due tomorrow are new.
    const next = await enqueueReminders(database.db, NEXT_DAY);
    expect(next.periodNotices).toBe(0);
    expect(next.appointments).toBe(2);
  });

  test("an edit to tomorrow's appointment between two runs of one day sends nothing more", async () => {
    const first = await enqueueReminders(database.db, NOW);
    expect(first.appointments).toBe(2);
    // An edit ten minutes on (a new label) bumps the version and the updated
    // time and keeps the date.
    await database.db
      .update(schema.pregnancyEvents)
      .set({ version: 2, updatedAt: new Date(NOW.getTime() + 10 * 60_000) })
      .where(eq(schema.pregnancyEvents.id, ANNA_TOMORROW));
    try {
      const again = await enqueueReminders(database.db, new Date(NOW.getTime() + 20 * 60_000));
      expect(again).toEqual({ appointments: 0, periodNotices: 0, jobs: 0 });
    } finally {
      await database.db
        .update(schema.pregnancyEvents)
        .set({ version: 1, updatedAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(schema.pregnancyEvents.id, ANNA_TOMORROW));
    }
  });

  test("gives nobody a second job on her local day across Hobby's jitter", async () => {
    // 07:30 UTC is 00:30 on the 6th in Los Angeles; 06:20 UTC the next day
    // is 23:20 on the same local day there, so both runs see the 7th as
    // tomorrow. In Auckland the second run is a new day.
    const early = new Date("2026-10-06T07:30:00Z");
    const late = new Date("2026-10-07T06:20:00Z");
    const first = payloads(await reminderJobs());
    expect(first).toEqual([]);
    await enqueueReminders(database.db, early);
    expect(payloads(await reminderJobs()).find((p) => p.userId === CARA)).toEqual({
      userId: CARA,
      pregnancyId: CARA_PREGNANCY,
      eventIds: [CARA_NEXT],
    });
    const before = new Set((await reminderJobs()).map((job) => job.id));
    const second = await enqueueReminders(database.db, late);
    const added = (await reminderJobs()).filter((job) => !before.has(job.id));
    expect(payloads(added)).toEqual([
      { userId: ANNA, pregnancyId: ANNA_PREGNANCY, eventIds: [ANNA_LATER] },
    ]);
    expect(second).toEqual({ appointments: 1, periodNotices: 0, jobs: 1 });
  });

  test("reminds an appointment moved to a later date the day before its new date", async () => {
    await enqueueReminders(database.db, NOW);
    await database.db
      .update(schema.pregnancyEvents)
      .set({ date: "2026-10-08", updatedAt: new Date(NOW.getTime() + 10 * 60_000) })
      .where(eq(schema.pregnancyEvents.id, ANNA_TOMORROW));
    try {
      await enqueueReminders(database.db, NEXT_DAY);
      const anna = payloads(await reminderJobs()).filter((p) => p.userId === ANNA);
      expect(anna).toEqual([
        { userId: ANNA, pregnancyId: ANNA_PREGNANCY, eventIds: [ANNA_TOMORROW] },
        { userId: ANNA, pregnancyId: ANNA_PREGNANCY, eventIds: [ANNA_LATER, ANNA_TOMORROW].sort() },
      ]);
    } finally {
      await database.db
        .update(schema.pregnancyEvents)
        .set({ date: "2026-10-07", updatedAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(schema.pregnancyEvents.id, ANNA_TOMORROW));
    }
  });

  test("tells a start logged after the day's run the next day, once", async () => {
    await database.db.delete(schema.cycleEntries).where(eq(schema.cycleEntries.id, DANA_START));
    try {
      expect((await enqueueReminders(database.db, NOW)).periodNotices).toBe(0);
      await database.db
        .insert(schema.cycleEntries)
        .values({ id: DANA_START, subjectId: DANA, date: "2026-10-06", flow: "medium" });
      const next = await enqueueReminders(database.db, NEXT_DAY);
      expect(next.periodNotices).toBe(1);
      const later = await enqueueReminders(database.db, new Date(NEXT_DAY.getTime() + 86_400_000));
      expect(later.periodNotices).toBe(0);
    } finally {
      await database.db
        .insert(schema.cycleEntries)
        .values({ id: DANA_START, subjectId: DANA, date: "2026-10-06", flow: "medium" })
        .onConflictDoNothing();
    }
  });

  test("refuses the app role, where the system flag reads nothing", async () => {
    const asApp: ActorDatabase = {
      transaction: (fn) =>
        database.db.transaction(async (tx) => {
          await tx.execute(sql`set local role tidefern_app`);
          return fn(tx);
        }),
    };
    await expect(enqueueReminders(asApp, NOW)).rejects.toBeInstanceOf(SweepRoleError);
    expect(await reminderJobs()).toEqual([]);
  });
});

describe("sendReminder", () => {
  async function drain(now: Date = NOW) {
    return drainDue(database.db, 25, jobHandlers, now);
  }

  test("sends the one generic email, the same at every detail level", async () => {
    const seen: { subject: string; text: string; html: string | undefined }[] = [];
    for (const level of ["generic", "gentle", "detailed"] as const) {
      await database.db.delete(schema.jobs);
      mailer.messages.length = 0;
      await database.db
        .update(schema.profiles)
        .set({ notificationDetail: level })
        .where(eq(schema.profiles.userId, ANNA));
      await enqueueReminders(database.db, NOW);
      await drain();
      const toAnna = mailer.messages.filter((message) => message.to === "person0@example.test");
      expect(toAnna).toHaveLength(1);
      const [mail] = toAnna;
      expect(mail?.subject).toBe("Your Tidefern reminder");
      expect(mail?.text).toContain("You have a reminder in Tidefern");
      expect(mail?.text.match(/https?:\/\/\S+/g)).toEqual([`${SITE}/today`]);
      for (const part of [mail?.subject, mail?.text, mail?.html]) {
        expect(part).not.toMatch(HEALTH_WORDS);
      }
      seen.push({ subject: mail!.subject, text: mail!.text, html: mail!.html });
    }
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
  });

  test("sends a partner the same generic notice and completes every job", async () => {
    await enqueueReminders(database.db, NOW);
    const outcome = await drain();
    expect(outcome.failed).toEqual([]);
    expect(outcome.done).toHaveLength(3);
    const toBen = mailer.messages.filter((message) => message.to === "person4@example.test");
    expect(toBen).toHaveLength(1);
    expect(toBen[0]?.subject).toBe("Your Tidefern reminder");
    expect(toBen[0]?.text).toBe(reminderEmail(`${SITE}/today`, "Ben").text);
    for (const message of mailer.messages) {
      expect(`${message.subject}\n${message.text}\n${message.html ?? ""}`).not.toMatch(
        HEALTH_WORDS,
      );
    }
    expect(mailer.messages.map((message) => message.to).sort()).toEqual([
      "person0@example.test",
      "person1@example.test",
      "person4@example.test",
    ]);
  });

  test("sends nothing once the grant is revoked or the switch is off after the run", async () => {
    for (const change of [{ revokedAt: NOW }, { notify: false }] satisfies Partial<
      typeof schema.grants.$inferInsert
    >[]) {
      await database.db.delete(schema.jobs);
      mailer.messages.length = 0;
      await enqueueReminders(database.db, NOW);
      await database.db.update(schema.grants).set(change).where(eq(schema.grants.id, BEN_GRANT));
      try {
        const outcome = await drain();
        expect(outcome.failed).toEqual([]);
        expect(mailer.messages.map((message) => message.to)).not.toContain("person4@example.test");
        const [benJob] = (await reminderJobs()).filter(
          (job) => (job.payloadJson as { userId: string }).userId === BEN,
        );
        expect(benJob?.status).toBe("done");
      } finally {
        await database.db
          .update(schema.grants)
          .set({ revokedAt: null, notify: true })
          .where(eq(schema.grants.id, BEN_GRANT));
      }
    }
  });

  test("enqueues nothing for a revoked grant", async () => {
    await database.db
      .update(schema.grants)
      .set({ revokedAt: NOW })
      .where(eq(schema.grants.id, BEN_GRANT));
    try {
      await enqueueReminders(database.db, NOW);
      const recipients = (await reminderJobs()).map(
        (job) => (job.payloadJson as { userId: string }).userId,
      );
      expect(recipients).not.toContain(BEN);
    } finally {
      await database.db
        .update(schema.grants)
        .set({ revokedAt: null })
        .where(eq(schema.grants.id, BEN_GRANT));
    }
  });

  test("sends nothing for an appointment deleted after the run", async () => {
    await enqueueReminders(database.db, NOW);
    await database.db
      .update(schema.pregnancyEvents)
      .set({ deletedAt: NOW })
      .where(eq(schema.pregnancyEvents.id, CARA_TOMORROW));
    try {
      await drain();
      expect(mailer.messages.map((message) => message.to)).not.toContain("person1@example.test");
    } finally {
      await database.db
        .update(schema.pregnancyEvents)
        .set({ deletedAt: null })
        .where(eq(schema.pregnancyEvents.id, CARA_TOMORROW));
    }
  });

  test("sends nothing for a pregnancy ended after the run", async () => {
    await enqueueReminders(database.db, NOW);
    await database.db
      .update(schema.pregnancies)
      .set({ endedAt: "2026-10-05", endedReason: "birth" })
      .where(eq(schema.pregnancies.id, CARA_PREGNANCY));
    try {
      const outcome = await drain();
      expect(outcome.failed).toEqual([]);
      expect(mailer.messages.map((message) => message.to)).not.toContain("person1@example.test");
      expect(mailer.messages.map((message) => message.to)).toContain("person0@example.test");
    } finally {
      await database.db
        .update(schema.pregnancies)
        .set({ endedAt: null, endedReason: null })
        .where(eq(schema.pregnancies.id, CARA_PREGNANCY));
    }
  });

  test("sends nothing for an appointment moved past tomorrow after the run", async () => {
    await enqueueReminders(database.db, NOW);
    await database.db
      .update(schema.pregnancyEvents)
      .set({ date: "2026-11-06" })
      .where(eq(schema.pregnancyEvents.id, CARA_TOMORROW));
    try {
      const outcome = await drain();
      expect(outcome.failed).toEqual([]);
      expect(mailer.messages.map((message) => message.to)).not.toContain("person1@example.test");
    } finally {
      await database.db
        .update(schema.pregnancyEvents)
        .set({ date: "2026-10-06" })
        .where(eq(schema.pregnancyEvents.id, CARA_TOMORROW));
    }
  });

  test("still sends a retry that crosses her midnight onto the appointment day", async () => {
    await enqueueReminders(database.db, NOW);
    // Two hours on it is 01:00 on the 6th in Los Angeles, the appointment's day.
    await drain(new Date(NOW.getTime() + 2 * 60 * 60_000));
    expect(mailer.messages.map((message) => message.to)).toContain("person1@example.test");
  });

  test("fails the job without a configured transport, so it retries and is never dropped", async () => {
    configureReminders(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await enqueueReminders(database.db, NOW);
    const outcome = await drain();
    expect(outcome.done).toEqual([]);
    expect(outcome.failed).toHaveLength(3);
    const [job] = await reminderJobs();
    expect(job?.lastError).toBe("ReminderMailUnavailableError");
    await expect(sendReminder(job as Job, jobContext(database.db, NOW))).rejects.toBeInstanceOf(
      ReminderMailUnavailableError,
    );
  });

  test("refuses a payload that is not a reminder's ids", () => {
    expect(() => parseReminderPayload({})).toThrow(TypeError);
    expect(() => parseReminderPayload({ userId: "anna" })).toThrow(TypeError);
    expect(() => parseReminderPayload({ userId: ANNA, eventIds: ["2026-10-07"] })).toThrow(
      TypeError,
    );
    expect(() => parseReminderPayload({ userId: ANNA, pregnancyId: 7 })).toThrow(TypeError);
  });
});

describe("the scheduled run", () => {
  test("enqueues the day's reminders before it drains, so they go out in the same run", async () => {
    const secret = "a-cron-secret-for-the-reminder-tests";
    // The real calendar whatever the runner's environment says (CI exports
    // TIDEFERN_FAKE_NOW): each person's day follows the injected NOW.
    const app = createApp({
      jobs: { db: database.db, handlers: jobHandlers, cronSecret: secret, now: () => NOW },
      clock: realCalendarClock,
    });
    const response = await app.request("/api/internal/jobs/run", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: 3, done: 3, failed: 0 });
    expect(mailer.messages).toHaveLength(3);
    const statuses = await database.db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, REMINDER_JOB_TYPE), eq(schema.jobs.status, "done")));
    expect(statuses).toHaveLength(3);
  });

  test("goes on to drain and sweep when the reminder step throws on bad data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const queued = await database.db.transaction((tx) =>
      enqueue(
        tx,
        REMINDER_JOB_TYPE,
        { userId: ANNA, pregnancyId: ANNA_PREGNANCY, eventIds: [ANNA_TOMORROW] },
        { runAfter: NOW },
      ),
    );
    // A zone the API would never accept, written straight to the row.
    await database.db
      .update(schema.profiles)
      .set({ timeZone: "Not/A_Zone" })
      .where(eq(schema.profiles.userId, CARA));
    try {
      const secret = "a-cron-secret-for-the-reminder-tests";
      const app = createApp({
        jobs: { db: database.db, handlers: jobHandlers, cronSecret: secret, now: () => NOW },
        clock: realCalendarClock,
      });
      const response = await app.request("/api/internal/jobs/run", {
        headers: { authorization: `Bearer ${secret}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        reminders: "failed",
        claimed: 1,
        done: 1,
        failed: 0,
      });
      expect(warn).toHaveBeenCalledWith("jobs_reminders_failed");
      for (const call of warn.mock.calls) expect(call).toEqual(["jobs_reminders_failed"]);
      const [job] = await database.db.select().from(schema.jobs).where(eq(schema.jobs.id, queued));
      expect(job?.status).toBe("done");
      expect(mailer.messages.map((message) => message.to)).toEqual(["person0@example.test"]);
    } finally {
      await database.db
        .update(schema.profiles)
        .set({ timeZone: "America/Los_Angeles" })
        .where(eq(schema.profiles.userId, CARA));
    }
  });
});

/**
 * Task E11: with the calendar frozen at NOW and the real clock three days
 * on, each person's day is still NOW's, while what is stored or compared
 * with a stored time (the jobs' run_after, the lookback, the one-a-day
 * rule) follows the real clock.
 */
describe("on a frozen calendar", () => {
  const THREE_DAYS_ON = new Date("2026-10-09T06:00:00Z");
  const frozenAtNow = calendarClock({ TIDEFERN_FAKE_NOW: NOW.toISOString() });
  /** Ben is told of Dana's period start; the appointments are Anna's and Cara's. */
  const BEN_ADDRESS = "person4@example.test";

  test("finds the reminders of the frozen day and stamps the jobs with the real instant", async () => {
    await enqueueReminders(database.db, NOW);
    const onTheDay = payloads(await reminderJobs());
    expect(onTheDay).toHaveLength(3);
    await database.db.delete(schema.jobs);

    const counts = await enqueueReminders(database.db, THREE_DAYS_ON, frozenAtNow);
    const jobs = await reminderJobs();
    expect(payloads(jobs)).toEqual(onTheDay);
    expect(counts.jobs).toBe(3);
    expect(jobs.every((job) => job.runAfter.getTime() === THREE_DAYS_ON.getTime())).toBe(true);
    await database.db.delete(schema.jobs);

    // On the real calendar three days on, nothing in the fixture is due.
    expect(await enqueueReminders(database.db, THREE_DAYS_ON)).toEqual({
      appointments: 0,
      periodNotices: 0,
      jobs: 0,
    });
  });

  test("keeps one job a day per person on the real clock, whatever the calendar says", async () => {
    expect((await enqueueReminders(database.db, THREE_DAYS_ON, frozenAtNow)).jobs).toBe(3);
    const halfAnHourOn = new Date(THREE_DAYS_ON.getTime() + 30 * 60_000);
    expect((await enqueueReminders(database.db, halfAnHourOn, frozenAtNow)).jobs).toBe(0);
    expect(await reminderJobs()).toHaveLength(3);
  });

  test("sends what is still due on the drain's calendar and drops what the real one has passed", async () => {
    await enqueueReminders(database.db, THREE_DAYS_ON, frozenAtNow);
    const frozen = await drainDue(database.db, 25, jobHandlers, THREE_DAYS_ON, frozenAtNow);
    expect(frozen.done).toHaveLength(3);
    expect(mailer.messages).toHaveLength(3);

    await database.db.delete(schema.jobs);
    mailer = new CaptureMailer();
    configureReminders({ mailer, siteUrl: SITE, template: reminderEmail });
    await enqueueReminders(database.db, THREE_DAYS_ON, frozenAtNow);
    const real = await drainDue(database.db, 25, jobHandlers, THREE_DAYS_ON);
    // Every job completes; on the real calendar both appointments are behind
    // their subjects, so only the partner notice, which names no day, is sent.
    expect(real.done).toHaveLength(3);
    expect(mailer.messages.map((message) => message.to)).toEqual([BEN_ADDRESS]);
  });

  test("runs the reminder step and the drain on the app's clock through the scheduled route", async () => {
    const secret = "a-cron-secret-for-the-reminder-tests";
    const app = createApp({
      jobs: {
        db: database.db,
        handlers: jobHandlers,
        cronSecret: secret,
        now: () => THREE_DAYS_ON,
      },
      clock: frozenAtNow,
    });
    const response = await app.request("/api/internal/jobs/run", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reminders: { appointments: 2, periodNotices: 1, jobs: 3 },
      claimed: 3,
      done: 3,
      failed: 0,
    });
    expect(mailer.messages).toHaveLength(3);
    const jobs = await reminderJobs();
    expect(jobs.every((job) => job.runAfter.getTime() === THREE_DAYS_ON.getTime())).toBe(true);
  });
});
