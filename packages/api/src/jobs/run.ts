// The manual drain of architecture 10.1 (`pnpm jobs:run`): the same drain
// and sweep the scheduled endpoint runs, printed as one JSON line of counts.
// The sweep deletes under forced row level security and needs the owner
// role, so the runner connects to DATABASE_URL_UNPOOLED (7.2 names it as the
// job runner's URL) and falls back to DATABASE_URL only when that is unset.
// It opens its own one-connection pool here rather than importing the app's
// client, because that pool is bound to DATABASE_URL, and it checks the role
// before draining so a wrong connection is refused before any job is claimed.
// The handlers decide each person's day on the calendar clock, resolved from
// the environment first, so TIDEFERN_FAKE_NOW set on production stops the
// run before it connects.
//
// Unlike the web host it configures neither reminders nor closure, so this
// runner sends no reminder and finishes no closure. Both need a mail
// transport (`chooseMailer`), and reminders need the template
// (`reminderEmail`); both live only in @tidefern/auth, which this package
// lists as a devDependency for its tests, and the API never depends on it at
// runtime (the rule `configureReminders` and ./notice follow). So here a due
// `reminder.send` job fails with ReminderMailUnavailableError, and an
// `account.delete` job past its window fails with ClosureConfigurationError
// before it deletes a session or a row; inside the window it only waits.
// Both go back on the backoff like any failed job, for the next run with a
// mailer (the web host's scheduled run), or to `dead` after the fifth
// attempt: the sweep then gives the closure a fresh job, and a dead reminder
// is counted in the owner notice. The reminder step (`enqueueReminders`) is
// not run here either.
// Closing the gap needs an entry in a package that may depend on both, as
// apps/web's route does.
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@tidefern/db/schema";
import { assertSweepRole, sweep } from "@tidefern/db/jobs";

import { calendarClock } from "../clock";
import { jobHandlers } from "./handlers";
import { drainDue } from "./index";
import { DEFAULT_CLAIM_LIMIT } from "../routes/internal/jobs";

const clock = calendarClock(process.env);
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL_UNPOOLED is not set (and neither is DATABASE_URL); the job runner needs the owner role's direct string.",
  );
  process.exit(1);
}

const db = drizzle({ connection: { connectionString: url, max: 1 }, schema });

try {
  await assertSweepRole(db);
  const now = new Date();
  const outcome = await drainDue(db, DEFAULT_CLAIM_LIMIT, jobHandlers, now, clock);
  const counts = await sweep(db, now);
  console.log(
    JSON.stringify({
      claimed: outcome.claimed,
      done: outcome.done.length,
      failed: outcome.failed.length,
      dead: outcome.dead.length,
      sweep: counts,
    }),
  );
  if (counts.deadJobs > 0) {
    console.warn(`${counts.deadJobs} job(s) are in the dead queue.`);
  }
} finally {
  await db.$client.end();
}
