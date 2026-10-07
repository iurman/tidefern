import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PolicyLine } from "@/components/policy-line";
import type { ShellProfile } from "@/components/ui/shell-destinations";
import { sessionMe } from "@/lib/api-server";
import { CLOSING_PATH, SIGN_IN_PATH, WELCOME_PATH } from "@/lib/auth-client";
import { CurrentShell } from "./current-shell";
import styles from "./layout.module.css";

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/** When the profile could not be read: the four destinations everyone has. */
const fallbackProfile: ShellProfile = { stage: "none", hasChild: false };

/**
 * The authenticated frame for every route in the group (DESIGN.md section
 * 2). The session is read once per request through GET /api/v1/me on the
 * in-process client (`sessionMe` in lib/api-server.ts, which pages call too
 * and get the same answer), and before anything renders a visitor without
 * a session is sent to sign in, a person whose account is closing to the
 * locked view at /closing, and a person without a profile to /welcome; the
 * last two live in the (flow) group, outside the shell. So a page here can
 * rely on a profile whenever the lookup is `ok`. None of these redirects
 * names a fragment, and a browser keeps the one it had across a redirect
 * like that: an invitee without a profile who opens `/sharing#invitation=`
 * reaches /welcome with the fragment still on it, and onboarding (task H1)
 * forwards it to /sharing at the end.
 *
 * The destinations follow the profile's stage, its children and the grants
 * it holds. A read that failed rather than answered keeps the person here
 * with the always-on destinations and says so; the pages' own reads settle
 * the rest. The public header never renders here, and the two policy links
 * stay reachable in a quiet line under the page.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  if (lookup.kind === "closing") redirect(CLOSING_PATH);
  let profile = fallbackProfile;
  if (lookup.kind === "ok") {
    const own = lookup.me.profile;
    if (own === null) redirect(WELCOME_PATH);
    profile = {
      stage: own.stage,
      hasChild:
        lookup.me.guardianOf.length > 0 ||
        lookup.me.grants.some((grant) => grant.category === "child"),
      sharedPregnancy: lookup.me.grants.some((grant) => grant.category === "pregnancy.overview"),
    };
  }
  return (
    <CurrentShell
      stage={profile.stage}
      hasChild={profile.hasChild}
      sharedPregnancy={profile.sharedPregnancy ?? false}
    >
      <main id="main" tabIndex={-1}>
        {lookup.kind === "failed" ? (
          <p className={styles.notice}>
            We could not load your profile just now, so only the places everyone has are listed.
            Reload the page to try again.
          </p>
        ) : null}
        {children}
      </main>
      <PolicyLine />
    </CurrentShell>
  );
}
