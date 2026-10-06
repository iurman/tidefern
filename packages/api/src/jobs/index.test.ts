import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { schema } from "@tidefern/db";
import { enqueue, jobId } from "@tidefern/db/jobs";
import type { Job, JobType } from "@tidefern/db/jobs";

import { createApp } from "../app";
import { drainDue, drainEnqueued } from "./index";
import type { JobHandlers } from "./index";
import { createJobsTestDatabase } from "./test-database";
import type { JobsTestDatabase } from "./test-database";

/**
 * The handler registry and the two drains on PGlite, then the inline drain
 * through the app: a route enqueues, hands the id to `c.var.drainJobs`, and
 * the job runs only when the host runs the deferred task, after the
 * response.
 */
let database: JobsTestDatabase;

// A synthetic id; nothing here is a real person.
const ANNA = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const NOW = new Date("2026-10-05T06:00:00Z");

// Two ids minted in the same millisecond sort by their random bits, and the
// claim orders by (run_after, id), so each due job gets an id one
// millisecond after the last: the claim order is then the enqueue order.
let minted = 0;

async function enqueueDue(type: JobType): Promise<string> {
  const id = jobId(NOW.getTime() + minted++);
  return database.db.transaction((tx) =>
    enqueue(tx, type, { subjectId: ANNA }, { runAfter: NOW, id }),
  );
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the drains", () => {
  test("run the handler for each claimed job and complete it", async () => {
    const seen: Array<{ id: string; type: string; now: Date; sameDb: boolean }> = [];
    const handlers: JobHandlers = {
      "reminder.send": async (job, context) => {
        seen.push({
          id: job.id,
          type: job.type,
          now: context.now,
          sameDb: context.db === database.db,
        });
      },
    };
    const first = await enqueueDue("reminder.send");
    const second = await enqueueDue("reminder.send");

    const outcome = await drainDue(database.db, 10, handlers, NOW);
    expect(outcome).toEqual({ claimed: 2, done: [first, second], failed: [], dead: [] });
    expect(seen.map((entry) => entry.id)).toEqual([first, second]);
    expect(seen.every((entry) => entry.now === NOW && entry.sameDb)).toBe(true);
    expect((await row(first))?.status).toBe("done");
    expect((await row(second))?.status).toBe("done");
  });

  test("fail a job whose handler throws and one whose type has no handler, logging no payload", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handlers: JobHandlers = {
      "reminder.send": async () => {
        throw new Error("the provider is down");
      },
    };
    const throwing = await enqueueDue("reminder.send");
    const unhandled = await enqueueDue("photo.process");

    const outcome = await drainDue(database.db, 10, handlers, NOW);
    expect(outcome).toEqual({ claimed: 2, done: [], failed: [throwing, unhandled], dead: [] });
    expect(await row(throwing)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "Error",
    });
    expect(await row(unhandled)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "UnhandledJobTypeError",
    });
    expect(warn).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(ANNA);
    expect(logged).not.toContain("provider is down");
  });

  test("drainEnqueued takes only the named ids", async () => {
    const named = await enqueueDue("export.step");
    const other = await enqueueDue("export.step");
    const handlers: JobHandlers = { "export.step": async () => undefined };

    const outcome = await drainEnqueued(database.db, [named], handlers, NOW);
    expect(outcome).toEqual({ claimed: 1, done: [named], failed: [], dead: [] });
    expect((await row(other))?.status).toBe("queued");
  });
});

describe("the inline drain through the app", () => {
  test("runs after the response, through the host's defer", async () => {
    const deferred: Array<() => Promise<void>> = [];
    const ran: string[] = [];
    const app = createApp({
      defer: (task) => deferred.push(task),
      jobs: {
        db: database.db,
        handlers: {
          "reminder.send": async (job) => {
            ran.push(job.id);
          },
        },
      },
    });
    app.get("/v1/probe", async (c) => {
      const id = await database.db.transaction((tx) =>
        enqueue(tx, "reminder.send", { subjectId: ANNA }),
      );
      c.var.drainJobs([id]);
      return c.json({ id });
    });

    const response = await app.request("/api/v1/probe");
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };

    expect((await row(id))?.status).toBe("queued");
    expect(ran).toEqual([]);
    expect(deferred).toHaveLength(1);

    await (deferred[0] as () => Promise<void>)();
    expect((await row(id))?.status).toBe("done");
    expect(ran).toEqual([id]);
  });

  test("is a no-op when the app has no job runner", async () => {
    const deferred: Array<() => Promise<void>> = [];
    const app = createApp({ defer: (task) => deferred.push(task) });
    app.get("/v1/probe", async (c) => {
      const id = await database.db.transaction((tx) =>
        enqueue(tx, "reminder.send", { subjectId: ANNA }),
      );
      c.var.drainJobs([id]);
      return c.json({ id });
    });

    const response = await app.request("/api/v1/probe");
    const { id } = (await response.json()) as { id: string };
    expect(deferred).toEqual([]);
    expect((await row(id))?.status).toBe("queued");
  });
});
