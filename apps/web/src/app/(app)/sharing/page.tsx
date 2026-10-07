import { headers } from "next/headers";
import { AcceptInvitation } from "@/components/pages/sharing/accept-invitation";
import { sharingCopy as copy } from "@/components/pages/sharing/copy";
import { loadSharing } from "@/components/pages/sharing/load";
import { buildSharingView } from "@/components/pages/sharing/people";
import { SharingBoard } from "@/components/pages/sharing/sharing-board";
import styles from "@/components/pages/sharing/sharing.module.css";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("/sharing", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * /sharing (architecture 12.1, DESIGN.md 3.7 and 5.2): who can see what.
 * The server reads the session once with the (app) layout (`sessionMe`),
 * then the people, the pending invitations and the children's names on
 * the in-process client, and hands the client parts a view built from
 * those answers alone, with every date a calendar day in the profile's
 * zone. A page opened from an invitation link shows the acceptance panel
 * above People.
 *
 * Next renders the layout and this page in parallel: a visitor without a
 * session, a closing account or a person without a profile gets nothing
 * here while the layout redirects them. A read that failed says so, and
 * the acceptance panel still takes an invitation fragment out of the
 * address bar.
 */
export default async function SharingPage() {
  const lookup = await sessionMe();
  if (lookup.kind === "failed") return <Unavailable />;
  if (lookup.kind !== "ok" || lookup.me.profile === null) return null;
  const data = await loadSharing(serverApiClient(await headers()), lookup.me);
  if (data === null) return <Unavailable />;
  const view = buildSharingView({ me: lookup.me, ...data });
  return (
    <section className={styles.page} aria-labelledby="sharing-title">
      <h1 id="sharing-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <AcceptInvitation householdOwners={view.householdOwners} />
      <SharingBoard view={view} />
    </section>
  );
}

function Unavailable() {
  return (
    <section className={styles.page} aria-labelledby="sharing-title">
      <h1 id="sharing-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <AcceptInvitation householdOwners={{}} />
      <InlineFeedback tone="error">{copy.loadFailed}</InlineFeedback>
    </section>
  );
}
