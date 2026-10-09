import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PolicyLine } from "@/components/policy-line";
import type { ShellProfile } from "@/components/ui/shell-destinations";
import { sessionMe } from "@/lib/api-server";
import { CLOSING_PATH, WELCOME_PATH, signInPathFor } from "@/lib/auth-client";
import { REQUESTED_PATH_HEADER } from "@/lib/requested-path";
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
 * and get the same answer). A visitor without a session is sent to sign
 * in with the page they asked for as `?next=` (its path only, which the
 * proxy hands over in a header; `signInPathFor` validates it), so the
 * sign-in returns them there; a person whose account is closing to the locked view at /closing,
 * and a person without a profile to /welcome; the last two live in the
 * (flow) group, outside the shell.
 *
 * The redirect decides where the visitor lands, not what runs: Next renders
 * a layout and its page in parallel, so a page here still runs in the
 * request this layout redirects. It gets the same `ok` lookup with
 * `profile: null` and must narrow it itself (render nothing, or redirect
 * the same way). Never assert a profile with `!` or throw for a missing
 * one: the visitor still reaches /welcome, but Next logs that render as a
 * server error, on every new account's first sign-in among others.
 *
 * None of these redirects names a fragment, and a browser keeps the one it
 * had across a redirect like that: an invitee without a profile who opens
 * `/sharing#invitation=` reaches /welcome with the fragment still on it,
 * and onboarding (task H1) forwards it to /sharing at the end; a closing
 * account reaches /closing with it, which drops it.
 *
 * The destinations follow the profile's stage, its children and the grants
 * it holds. A read that failed rather than answered keeps the person here
 * with the always-on destinations and says so; the pages' own reads settle
 * the rest. The public header never renders here, and the two policy links
 * stay reachable in a quiet line under the page.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") {
    redirect(signInPathFor((await headers()).get(REQUESTED_PATH_HEADER)));
  }
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
