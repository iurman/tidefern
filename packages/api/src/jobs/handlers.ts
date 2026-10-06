import type { JobHandlers } from "./index";

/**
 * The one registry the web host and `pnpm jobs:run` both pass to the
 * drains, so a job runs the same way whichever drain reaches it first. It
 * is empty on purpose: H10 adds `reminder.send`, I2 adds `account.delete`
 * and `export.step`, each next to its own tests. Until a type has an entry
 * here, a job of that type fails and dies into the owner notice rather than
 * being dropped.
 */
export const jobHandlers: JobHandlers = {};
