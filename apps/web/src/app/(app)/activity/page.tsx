import { headers } from "next/headers";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";
import { ACTIVITY_HEADING_ID, ActivityHeader } from "./activity-header";
import { ActivityList } from "./activity-list";
import { activityCopy as copy } from "./copy";
import { ACTIVITY_PAGE_SIZE, readFirstPage, readNames } from "./reads";
import styles from "./activity.module.css";

export const metadata = pageMetadata("/activity", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * What happened on the account (architecture 11 and DESIGN.md 3.8): the
 * audit rows where she did something or something was done to her
 * records, newest first, each what, who and when with no health content.
 * The first page renders here on the server from GET /api/v1/me/activity
 * on the in-process client; the names come from GET /api/v1/sharing and
 * from each child she guards, reads that write no audit row of their own.
 * The shell marks Settings, where Activity is reached from.
 *
 * The session read is the layout's (`sessionMe` shares one answer per
 * request). Without a profile, a session or with a closing account the
 * layout redirects, so the page renders nothing. When the read failed the
 * layout already says so and how to retry; the page keeps its title and
 * the way back, and claims nothing about the rows.
 */
export default async function ActivityPage() {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous" || lookup.kind === "closing") return null;
  if (lookup.kind === "failed") {
    return (
      <section className={styles.page} aria-labelledby={ACTIVITY_HEADING_ID}>
        <ActivityHeader />
      </section>
    );
  }
  const { me } = lookup;
  if (me.profile === null || me.today === null) return null;
  const client = serverApiClient(await headers());
  const [first, names] = await Promise.all([readFirstPage(client), readNames(client, me)]);
  return (
    <section className={styles.page} aria-labelledby={ACTIVITY_HEADING_ID}>
      <ActivityHeader />
      {first === null ? (
        <p className={styles.failed}>{copy.loadFailed}</p>
      ) : (
        <ActivityList
          initial={first}
          pageSize={ACTIVITY_PAGE_SIZE}
          context={{
            me: me.id,
            names,
            guardianOf: me.guardianOf,
            timeZone: me.profile.timeZone,
            today: me.today,
          }}
        />
      )}
    </section>
  );
}
