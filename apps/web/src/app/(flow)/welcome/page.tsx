import { redirect } from "next/navigation";
import { TideLine } from "@/components/public/tide-line";
import { sessionMe } from "@/lib/api-server";
import { CLOSING_PATH, SIGNED_IN_PATH, SIGN_IN_PATH } from "@/lib/auth-client";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

// The title from CONTENT.md: never a stage in it.
export const metadata = pageMetadata("/welcome", "Welcome", "Set up your Tidefern account.", false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * A placeholder for onboarding: task H1 builds the five steps of DESIGN.md
 * 3.2 here. The (app) layout sends every signed-in person without a profile
 * to this page, so a person who already has one goes on to Today and an
 * account that is closing to its own page. The session read is the
 * layout's (`sessionMe` shares one answer per request); it renders beside
 * the layout, so it never throws on an anonymous or failed read.
 */
export default async function WelcomePage() {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  if (lookup.kind === "closing") redirect(CLOSING_PATH);
  if (lookup.kind === "ok" && lookup.me.profile !== null) redirect(SIGNED_IN_PATH);
  return (
    <section className={styles.page} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.heading}>
        Welcome to Tidefern
      </h1>
      <p className={styles.lede}>
        {lookup.kind === "failed"
          ? "We could not load your account just now. Reload the page to try again."
          : "The steps that set up your account arrive here soon."}
      </p>
      <TideLine className={styles.tide} />
    </section>
  );
}
