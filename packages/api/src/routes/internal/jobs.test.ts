import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { schema } from "@tidefern/db";
import { enqueue } from "@tidefern/db/jobs";
import type { Job } from "@tidefern/db/jobs";
import { Problem } from "@tidefern/schemas";

import { createApp } from "../../app";
import type { ApiOptions } from "../../app";
import type { MailMessage } from "../../jobs/notice";
import { createJobsTestDatabase } from "../../jobs/test-database";
import type { JobsTestDatabase } from "../../jobs/test-database";
import { DEFAULT_CLAIM_LIMIT, bearerMatches } from "./jobs";
import type { JobsOptions, JobsRunReport } from "./jobs";

/**
 * The scheduled endpoint: 404 wherever the secret is unset or the bearer is
 * wrong, and with the right bearer a drain, a sweep, the count-only owner
 * notice, all off the OpenAPI document.
 */
let database: JobsTestDatabase;

// Synthetic ids; nothing here is a real person.
const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const DEAD = "018f5e7a-2000-7000-8000-0000000000fa";
const NOW = new Date("2026-10-05T06:00:00Z");
const SECRET = "a-cron-secret-for-the-tests";
const OWNER = "owner@example.test";

class FakeMailer {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}

function appWith(jobs: Partial<JobsOptions>, options: Omit<ApiOptions, "jobs"> = {}) {
  return createApp({ ...options, jobs: { db: database.db, now: () => NOW, ...jobs } });
}

function run(app: ReturnType<typeof createApp>, authorization?: string) {
  return app.request("/api/internal/jobs/run", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

async function enqueueDue(type: "reminder.send" | "photo.process"): Promise<string> {
  return database.db.transaction((tx) => enqueue(tx, type, { subjectId: ANNA }, { runAfter: NOW }));
}

async function insertDead(): Promise<void> {
  await database.db.insert(schema.jobs).values({
    id: DEAD,
    type: "reminder.send",
    payloadJson: { subjectId: ANNA },
    status: "dead",
    attempts: 5,
    lastError: "Error",
  });
}

async function row(id: string): Promise<Job | undefined> {
  const [found] = await database.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return found;
}

beforeAll(async () => {
  database = await createJobsTestDatabase();
  await database.db
    .insert(schema.user)
    .values({ id: ANNA, name: "A tester", email: "anna@example.test" });
});

afterAll(() => database.close());

beforeEach(async () => {
  await database.db.delete(schema.jobs);
  await database.db.delete(schema.idempotencyKeys);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bearerMatches", () => {
  test("accepts exactly the bearer and nothing near it", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(bearerMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(bearerMatches(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false);
    // The same length with one byte changed: a length check alone would pass it.
    expect(bearerMatches(`Bearer b${SECRET.slice(1)}`, SECRET)).toBe(false);
    expect(bearerMatches(`Bearer ${"x".repeat(SECRET.length)}`, SECRET)).toBe(false);
    expect(bearerMatches(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(bearerMatches(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(bearerMatches(SECRET, SECRET)).toBe(false);
    expect(bearerMatches("Bearer", SECRET)).toBe(false);
    expect(bearerMatches(`Bearer ${SECRET} extra`, SECRET)).toBe(false);
    expect(bearerMatches("", SECRET)).toBe(false);
    expect(bearerMatches(undefined, SECRET)).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
  });
});

describe("GET /api/internal/jobs/run", () => {
  test("answers the 404 problem wherever the secret is unset, bearer or not", async () => {
    const pending = await enqueueDue("reminder.send");
    for (const app of [appWith({}), appWith({ cronSecret: "" }), createApp()]) {
      const response = await run(app, `Bearer ${SECRET}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(Problem.parse(await response.json()).code).toBe("not_found");
    }
    expect((await row(pending))?.status).toBe("queued");
  });

  test("answers the 404 problem for a missing, malformed or wrong bearer", async () => {
    const pending = await enqueueDue("reminder.send");
    const app = appWith({ cronSecret: SECRET });
    for (const header of [
      undefined,
      "Bearer nope",
      `Bearer ${"x".repeat(SECRET.length)}`,
      `Basic ${SECRET}`,
      SECRET,
      "Bearer",
    ]) {
      const response = await run(app, header);
      expect(response.status).toBe(404);
      expect(Problem.parse(await response.json()).code).toBe("not_found");
    }
    expect((await row(pending))?.status).toBe("queued");
  });

  test("drains what is due, sweeps, reports counts and notifies the owner about the dead queue", async () => {
    const ran: string[] = [];
    const mailer = new FakeMailer();
    const app = appWith({
      cronSecret: SECRET,
      mailer,
      ownerEmail: OWNER,
      handlers: {
        "reminder.send": async (job) => {
          ran.push(job.id);
        },
      },
    });
    const first = await enqueueDue("reminder.send");
    const second = await enqueueDue("reminder.send");
    const later = await database.db.transaction((tx) =>
      enqueue(tx, "reminder.send", { subjectId: ANNA }, { runAfter: new Date(NOW.getTime() + 1) }),
    );
    await insertDead();
    await database.db.insert(schema.idempotencyKeys).values({
      id: "018f5e7a-2000-7000-8000-0000000000e1",
      actorId: ANNA,
      key: "018f5e7a-2000-7000-8000-0000000000e2",
      route: "entries.put",
      requestHash: "a",
      createdAt: new Date(NOW.getTime() - 25 * 60 * 60_000),
    });

    const response = await run(app, `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const report = (await response.json()) as JobsRunReport;
    expect(report).toMatchObject({
      claimed: 2,
      done: 2,
      failed: 0,
      dead: 0,
      notice: "sent",
      sweep: { idempotencyKeys: 1, auditEvents: 0, productEvents: 0, closures: 0, deadJobs: 1 },
    });
    expect(ran.sort()).toEqual([first, second].sort());
    expect((await row(later))?.status).toBe("queued");
    expect(await database.db.select().from(schema.idempotencyKeys)).toEqual([]);

    expect(mailer.messages).toHaveLength(1);
    const notice = mailer.messages[0] as MailMessage;
    expect(notice.to).toBe(OWNER);
    expect(notice.subject).toBe("Tidefern jobs need attention");
    expect(notice.text).toContain("1 job is in the dead queue");
    for (const text of [notice.subject, notice.text]) {
      expect(text).not.toContain(DEAD);
      expect(text).not.toContain(ANNA);
      expect(text).not.toContain("reminder");
      expect(text).not.toContain("Error");
    }
  });

  test("sends no notice when nothing is dead, and reports skipped without a mailer", async () => {
    const mailer = new FakeMailer();
    const quiet = await run(
      appWith({ cronSecret: SECRET, mailer, ownerEmail: OWNER }),
      `Bearer ${SECRET}`,
    );
    expect(((await quiet.json()) as JobsRunReport).notice).toBe("none");
    expect(mailer.messages).toEqual([]);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await insertDead();
    const unsent = await run(
      appWith({ cronSecret: SECRET, ownerEmail: OWNER }),
      `Bearer ${SECRET}`,
    );
    const report = (await unsent.json()) as JobsRunReport;
    expect(report.notice).toBe("skipped");
    expect(report.sweep.deadJobs).toBe(1);
    expect(warn).toHaveBeenCalledWith("jobs_dead_notice_skipped", { deadJobs: 1 });
  });

  test("walks a job without a handler through backoff into the dead queue over five runs", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let now = NOW;
    const mailer = new FakeMailer();
    const app = createApp({
      jobs: { db: database.db, cronSecret: SECRET, mailer, ownerEmail: OWNER, now: () => now },
    });
    const id = await enqueueDue("photo.process");

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const report = (await (await run(app, `Bearer ${SECRET}`)).json()) as JobsRunReport;
      const current = (await row(id)) as Job;
      expect(current.attempts).toBe(attempt);
      if (attempt < 5) {
        expect(report).toMatchObject({ claimed: 1, failed: 1, dead: 0, notice: "none" });
        expect(current.status).toBe("failed");
        now = new Date(current.runAfter.getTime() + 1);
      } else {
        expect(report).toMatchObject({ claimed: 1, failed: 0, dead: 1, notice: "sent" });
        expect(current.status).toBe("dead");
      }
    }
    expect(mailer.messages.map((message) => message.text)).toEqual([
      expect.stringContaining("1 job is in the dead queue"),
    ]);
    expect(DEFAULT_CLAIM_LIMIT).toBe(25);
  });

  test("drains batch after batch until the due queue is empty", async () => {
    const ran: string[] = [];
    const ids: string[] = [];
    for (let n = 0; n < 5; n += 1) ids.push(await enqueueDue("reminder.send"));
    const app = appWith({
      cronSecret: SECRET,
      claimLimit: 2,
      handlers: {
        "reminder.send": async (job) => {
          ran.push(job.id);
        },
      },
    });
    const report = (await (await run(app, `Bearer ${SECRET}`)).json()) as JobsRunReport;
    expect(report).toMatchObject({ claimed: 5, done: 5, failed: 0, dead: 0 });
    expect(ran.sort()).toEqual([...ids].sort());
  });

  test("does not reclaim a job that failed earlier in the same run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let n = 0; n < 3; n += 1) await enqueueDue("photo.process");
    const report = (await (
      await run(appWith({ cronSecret: SECRET, claimLimit: 2 }), `Bearer ${SECRET}`)
    ).json()) as JobsRunReport;
    expect(report).toMatchObject({ claimed: 3, done: 0, failed: 3, dead: 0 });
  });

  test("stops starting batches once the drain budget is spent", async () => {
    for (let n = 0; n < 5; n += 1) await enqueueDue("reminder.send");
    const app = appWith({
      cronSecret: SECRET,
      claimLimit: 2,
      drainBudgetMs: 0,
      handlers: { "reminder.send": async () => undefined },
    });
    const report = (await (await run(app, `Bearer ${SECRET}`)).json()) as JobsRunReport;
    expect(report).toMatchObject({ claimed: 2, done: 2 });
    const left = await database.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "queued"));
    expect(left).toHaveLength(3);
  });

  test("logs a throwing reminder step without content and still drains, sweeps and notifies", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ran: string[] = [];
    const mailer = new FakeMailer();
    const pending = await enqueueDue("reminder.send");
    await insertDead();
    await database.db.insert(schema.idempotencyKeys).values({
      id: "018f5e7a-2000-7000-8000-0000000000e3",
      actorId: ANNA,
      key: "018f5e7a-2000-7000-8000-0000000000e4",
      route: "entries.put",
      requestHash: "a",
      createdAt: new Date(NOW.getTime() - 25 * 60 * 60_000),
    });
    const app = appWith({
      cronSecret: SECRET,
      mailer,
      ownerEmail: OWNER,
      reminders: async () => {
        throw new RangeError(`Invalid time zone specified: ${ANNA}`);
      },
      handlers: {
        "reminder.send": async (job) => {
          ran.push(job.id);
        },
      },
    });
    const response = await run(app, `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    const report = (await response.json()) as JobsRunReport;
    expect(report).toMatchObject({
      reminders: "failed",
      claimed: 1,
      done: 1,
      notice: "sent",
      sweep: { idempotencyKeys: 1, deadJobs: 1 },
    });
    expect(ran).toEqual([pending]);
    expect(mailer.messages).toHaveLength(1);
    expect(warn.mock.calls).toEqual([["jobs_reminders_failed"]]);
  });

  test("stays out of the OpenAPI document", async () => {
    const app = appWith({ cronSecret: SECRET });
    const document = (await (await app.request("/api/v1/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };
    const paths = Object.keys(document.paths);
    expect(paths).toContain("/api/v1/health");
    expect(paths.some((path) => path.includes("internal"))).toBe(false);
  });
});
