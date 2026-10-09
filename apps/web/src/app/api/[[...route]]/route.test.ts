// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type * as Api from "@tidefern/api";
// The test reads the reminder template the host hands the API, as the host does.
/* eslint-disable no-restricted-imports -- host wiring for the API, see route.ts */
import { reminderEmail } from "@tidefern/auth";
/* eslint-enable no-restricted-imports */
import type * as RouteModule from "./route";

/**
 * The host wiring (task I3). With DATABASE_URL_UNPOOLED set, the API gets the
 * job runner on the owner pool, and the invitation, reminder and closure mail
 * all go through Better Auth's transport. Without the variable there is no
 * runner, and the scheduled run answers 404 to every caller. The database,
 * Better Auth and `after` are stand-ins; the API is the real one, so each
 * request travels the same route the cron calls.
 */

type Route = typeof RouteModule;

// Throwaway values that exist only in this file.
const CRON_SECRET = "route-test-cron-secret";
const OWNER_PASSWORD = "route-test-owner-password";
const OWNER_URL = `postgresql://owner:${OWNER_PASSWORD}@db.invalid:5432/tidefern`;
const OWNER_EMAIL = "owner-route-test@example.test";
const LOG_HMAC_SECRET = "route-test-log-hmac-secret";
const SITE_URL = "https://tidefern.test";

const host = vi.hoisted(() => {
  // Both stand-ins refuse every transaction, so a test can tell which pool a request asked.
  const refuse = () => Promise.reject(new Error("no database in this test"));
  const ownerDb = { transaction: vi.fn(refuse) };
  return {
    appDb: { transaction: vi.fn(refuse) },
    ownerDb,
    ownerDatabase: vi.fn(() => ownerDb),
    mailer: { send: vi.fn(async () => undefined) },
    auth: { handler: vi.fn(), api: { getSession: vi.fn() } },
    createApp: vi.fn(),
    configureSharing: vi.fn(),
    configureReminders: vi.fn(),
    configureClosure: vi.fn(),
  };
});

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@tidefern/auth/server", () => ({ auth: host.auth, mailer: host.mailer }));
vi.mock("@tidefern/db/client", () => ({ db: host.appDb, ownerDatabase: host.ownerDatabase }));
// The real API, with the four calls the host makes recorded on the way through.
vi.mock("@tidefern/api", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  host.createApp.mockImplementation(actual.createApp);
  host.configureSharing.mockImplementation(actual.configureSharing);
  host.configureReminders.mockImplementation(actual.configureReminders);
  host.configureClosure.mockImplementation(actual.configureClosure);
  return {
    ...actual,
    createApp: host.createApp,
    configureSharing: host.configureSharing,
    configureReminders: host.configureReminders,
    configureClosure: host.configureClosure,
  };
});

// What the route reads when it loads, with the runner switched on. The
// Vercel and test-switch variables are cleared so the outer environment (CI
// sets E2E_MAIL_CAPTURE) changes nothing here.
const RUNNER_ENVIRONMENT: Record<string, string | undefined> = {
  DATABASE_URL_UNPOOLED: OWNER_URL,
  CRON_SECRET,
  OWNER_EMAIL,
  LOG_HMAC_SECRET,
  SITE_URL,
  E2E_MAIL_CAPTURE: undefined,
  E2E_JOBS_SCHEDULED_ONLY: undefined,
  VERCEL_ENV: undefined,
  VERCEL_URL: undefined,
  VERCEL_PROJECT_PRODUCTION_URL: undefined,
};

async function loadRoute(overrides: Record<string, string | undefined> = {}): Promise<Route> {
  for (const [name, value] of Object.entries({ ...RUNNER_ENVIRONMENT, ...overrides })) {
    vi.stubEnv(name, value);
  }
  // The route reads the environment once, when the module loads.
  vi.resetModules();
  return import("./route");
}

async function run(route: Route, authorization?: string): Promise<Response> {
  return route.GET(
    new Request("http://127.0.0.1/api/internal/jobs/run", {
      headers: authorization === undefined ? {} : { authorization },
    }),
  );
}

function optionsGiven(): Api.ApiOptions {
  expect(host.createApp).toHaveBeenCalledTimes(1);
  return host.createApp.mock.lastCall?.[0] as Api.ApiOptions;
}

let consoleSpies: MockInstance[] = [];
let logged: unknown[][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  logged = [];
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    }),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore();
  vi.unstubAllEnvs();
});

describe("the API host", () => {
  it("hands the API the job runner on the owner pool when DATABASE_URL_UNPOOLED is set", async () => {
    const route = await loadRoute();
    const api = await import("@tidefern/api");

    expect(host.ownerDatabase).toHaveBeenCalledTimes(1);
    expect(host.ownerDatabase).toHaveBeenCalledWith(OWNER_URL);
    const options = optionsGiven();
    expect(options.db).toBe(host.appDb);
    expect(options.jobs).toStrictEqual({
      db: host.ownerDb,
      handlers: api.jobHandlers,
      cronSecret: CRON_SECRET,
      mailer: host.mailer,
      ownerEmail: OWNER_EMAIL,
      // Half the route's limit, so the sweep and the notice still fit after the last batch.
      drainBudgetMs: (route.maxDuration * 1000) / 2,
      // The inline drain runs after a request that enqueued work, as on every deployment.
      inlineDrain: true,
    });
  });

  it("turns off only the inline drain for the browser suite's server, and never on Vercel", async () => {
    await loadRoute({ E2E_JOBS_SCHEDULED_ONLY: "true" });
    expect(optionsGiven().jobs).toMatchObject({ cronSecret: CRON_SECRET, inlineDrain: false });

    for (const overrides of [
      { E2E_JOBS_SCHEDULED_ONLY: "true", VERCEL_ENV: "preview" },
      { E2E_JOBS_SCHEDULED_ONLY: "true", VERCEL_ENV: "production" },
      { E2E_JOBS_SCHEDULED_ONLY: "1" },
      { E2E_JOBS_SCHEDULED_ONLY: "" },
    ]) {
      vi.clearAllMocks();
      await loadRoute(overrides);
      expect(optionsGiven().jobs?.inlineDrain, JSON.stringify(overrides)).toBe(true);
    }
  });

  it("answers the scheduled run only to the cron's bearer, and runs it on the owner pool", async () => {
    const route = await loadRoute();

    for (const authorization of [undefined, "Bearer not-the-secret"]) {
      const refused = await run(route, authorization);
      expect(refused.status).toBe(404);
      expect(await refused.json()).toMatchObject({ code: "not_found" });
    }
    expect(host.ownerDb.transaction).not.toHaveBeenCalled();

    // The stand-in refuses the run's first transaction, so the API answers its
    // 500 problem. What this shows is that the bearer was accepted and the
    // work went to the owner pool, never to the app pool.
    const accepted = await run(route, `Bearer ${CRON_SECRET}`);
    expect(accepted.status).toBe(500);
    expect(host.ownerDb.transaction).toHaveBeenCalled();
    expect(host.appDb.transaction).not.toHaveBeenCalled();

    // The failed run logged its lines, and none of them carries the secret,
    // the owner's connection string or the owner's address.
    expect(logged.length).toBeGreaterThan(0);
    const lines = logged.map((args) => inspect(args, { depth: 8 })).join("\n");
    for (const value of [CRON_SECRET, OWNER_URL, OWNER_PASSWORD, OWNER_EMAIL]) {
      expect(lines).not.toContain(value);
    }
  });

  it.each([
    ["unset", undefined],
    ["empty, as .env.example leaves it", ""],
  ])(
    "passes no runner when DATABASE_URL_UNPOOLED is %s, so even the cron's bearer gets 404",
    async (_, value) => {
      const route = await loadRoute({ DATABASE_URL_UNPOOLED: value });

      expect(host.ownerDatabase).not.toHaveBeenCalled();
      expect(optionsGiven().jobs).toBeUndefined();
      const response = await run(route, `Bearer ${CRON_SECRET}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "not_found" });
      expect(host.appDb.transaction).not.toHaveBeenCalled();
    },
  );

  it("sends the invitation, reminder and closure mail through Better Auth's transport", async () => {
    await loadRoute();

    const app = host.createApp.mock.results[0]?.value;
    expect(host.configureSharing).toHaveBeenCalledTimes(1);
    expect(host.configureSharing).toHaveBeenCalledWith(app, {
      db: host.appDb,
      mailer: host.mailer,
    });

    expect(host.configureReminders).toHaveBeenCalledTimes(1);
    const reminders = host.configureReminders.mock.lastCall?.[0] as Api.ReminderDependencies;
    expect(reminders.mailer).toBe(host.mailer);
    expect(reminders.siteUrl).toBe(SITE_URL);
    // Compared by what it renders: the route loaded its own copy of the auth package.
    const link = `${SITE_URL}/today`;
    expect(reminders.template(link, "Ada")).toStrictEqual(reminderEmail(link, "Ada"));

    expect(host.configureClosure).toHaveBeenCalledTimes(1);
    expect(host.configureClosure).toHaveBeenCalledWith({
      mailer: host.mailer,
      hmacSecret: LOG_HMAC_SECRET,
      ownerEmail: OWNER_EMAIL,
    });
  });

  it("links reminders to the host Vercel supplies when SITE_URL is unset", async () => {
    // configureReminders refuses a link it cannot parse, so passing the bare
    // SITE_URL would stop this module, and with it every API request, from loading.
    await loadRoute({ SITE_URL: undefined, VERCEL_URL: "tidefern-git-preview-team.vercel.app" });

    const reminders = host.configureReminders.mock.lastCall?.[0] as Api.ReminderDependencies;
    expect(reminders.siteUrl).toBe("https://tidefern-git-preview-team.vercel.app");
  });
});
