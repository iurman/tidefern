import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Mark } from "@/components/logo";
import { PolicyLine } from "@/components/policy-line";
import { Button } from "@/components/ui/button";
import { sessionMe } from "@/lib/api-server";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import styles from "./layout.module.css";

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The frame for the authenticated pages that stand outside the app shell
 * (DESIGN.md 3.2: a flow, one column at every width): /welcome, where the
 * (app) layout sends a person without a profile, and /closing, where it
 * sends an account that is closing. The session is read once per request
 * through `sessionMe` (the pages get the same answer) and a visitor without
 * one is sent to sign in. A layout is not told the path it renders for, so
 * whether a person belongs on a page is that page's decision.
 *
 * No rail, no tab bar and no public header: the mark, the page in
 * `<main id="main">`, then a sign-out form (a POST to /sign-out, never a
 * link a prefetch could follow) on the same quiet line as the two policy
 * links the (app) layout draws.
 */
export default async function FlowLayout({ children }: { children: ReactNode }) {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  return (
    <div className={styles.frame}>
      <Mark size={32} className={styles.mark} />
      <main id="main" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <PolicyLine>
        <form method="post" action="/sign-out" className={styles.signOut}>
          <Button type="submit" variant="quiet">
            Sign out
          </Button>
        </form>
      </PolicyLine>
    </div>
  );
}
