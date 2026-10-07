import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { ShellProfile } from "@/components/ui/shell-destinations";
import { sessionMe } from "@/lib/api-server";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { CurrentShell } from "./current-shell";
import styles from "./layout.module.css";

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/** Until a profile exists, or when it could not be read: the four destinations everyone has. */
const fallbackProfile: ShellProfile = { stage: "none", hasChild: false };

/**
 * The authenticated frame for every route in the group (DESIGN.md section
 * 2): the session is read once per request through GET /api/v1/me on the
 * in-process client (`sessionMe` in lib/api-server.ts, which pages call too
 * and get the same answer), a visitor without a session is sent to sign in
 * before anything renders, and the destinations follow the profile's stage,
 * its children and the grants it holds. A read that failed rather than
 * answered 401 keeps the person here with the always-on destinations and
 * says so; the pages' own reads settle the rest. The public header never
 * renders here, and the two policy links stay reachable in a quiet line
 * under the page.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  const profile: ShellProfile =
    lookup.kind === "ok"
      ? {
          stage: lookup.me.profile?.stage ?? fallbackProfile.stage,
          hasChild:
            lookup.me.guardianOf.length > 0 ||
            lookup.me.grants.some((grant) => grant.category === "child"),
          sharedPregnancy: lookup.me.grants.some(
            (grant) => grant.category === "pregnancy.overview",
          ),
        }
      : fallbackProfile;
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
      <footer className={styles.policies}>
        <nav aria-label="Policies">
          <Link href="/privacy" prefetch={false}>
            Privacy
          </Link>
          <Link href="/health-privacy" prefetch={false}>
            Consumer Health Data Privacy Policy
          </Link>
        </nav>
      </footer>
    </CurrentShell>
  );
}
