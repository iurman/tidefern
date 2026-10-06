import { accountDeleteHandler } from "./closure";
import type { JobHandlers } from "./index";
import { sendReminder } from "./reminders";

/**
 * The one registry the web host and `pnpm jobs:run` both pass to the
 * drains, so a job runs the same way whichever drain reaches it first.
 * `reminder.send` is H10's (it sends only once the host has called
 * `configureReminders`) and `account.delete` is I2's (closure.ts); the stored
 * exports add `export.step`, each next to its own tests. Until a type has an entry
 * here, a job of that type fails and dies into the owner notice rather than
 * being dropped.
 */
export const jobHandlers: JobHandlers = {
  "reminder.send": sendReminder,
  "account.delete": accountDeleteHandler,
};
