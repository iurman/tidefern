import { redirect } from "next/navigation";
import { DropInvitationFragment } from "@/components/drop-invitation-fragment";
import { TideLine } from "@/components/public/tide-line";
import { sessionMe } from "@/lib/api-server";
import { SIGN_IN_PATH } from "@/lib/auth-client";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

// A neutral title: nothing about the closure in it.
export const metadata = pageMetadata(
  "/closing",
  "Your account",
  "What happens next with your Tidefern account.",
  false,
);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/** Where a person who is not closing belongs instead (task H7 builds it). */
const SETTINGS_PATH = "/settings";

/**
 * A placeholder for the locked view: task H7 builds it here (the days left,
 * Undo while the window is open, the export). The (app) layout sends a
 * person whose account is closing to this page, because the API refuses
 * her everywhere but the closure, the export and the consents; anyone else
 * belongs in Settings. The session read is the layout's (`sessionMe`
 * shares one answer per request), and the layout carries the sign-out form.
 * An invitation link opened by a closing account arrives here with its
 * `#invitation=` fragment, which nothing here can accept, so the page
 * takes it out of the address bar and forgets it; keep that when the view
 * is built.
 */
export default async function ClosingPage() {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  if (lookup.kind === "ok") redirect(SETTINGS_PATH);
  const failed = lookup.kind === "failed";
  return (
    <section className={styles.page} aria-labelledby="closing-title">
      <h1 id="closing-title" className={styles.heading}>
        {failed ? "Your account" : "Your account is closing"}
      </h1>
      <p className={styles.lede}>
        {failed
          ? "We could not load your account just now. Reload the page to try again."
          : "The undo and your export arrive on this page soon. You can sign out below."}
      </p>
      <TideLine className={styles.tide} />
      <DropInvitationFragment />
    </section>
  );
}
