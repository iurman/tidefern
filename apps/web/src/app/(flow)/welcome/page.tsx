import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TideLine } from "@/components/public/tide-line";
import { processorsFor } from "@/components/pages/welcome/consent";
import { welcomeCopy as copy } from "@/components/pages/welcome/copy";
import { WelcomeFlow } from "@/components/pages/welcome/welcome-flow";
import type { Processor } from "@/components/ui/consent-record";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { CLOSING_PATH, SIGNED_IN_PATH, SIGN_IN_PATH } from "@/lib/auth-client";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

// The title from CONTENT.md: never a stage in it.
export const metadata = pageMetadata("/welcome", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The processors the consent names, with what each receives, from the data
 * summary (GET /v1/me/data-summary answers before a profile exists). Null
 * when the read fails or leaves one out: the consent must name them all.
 */
async function readProcessors(): Promise<Processor[] | null> {
  try {
    const { data } = await serverApiClient(await headers()).GET("/api/v1/me/data-summary");
    return data === undefined ? null : processorsFor(data.processors);
  } catch {
    return null;
  }
}

/**
 * Onboarding (task H1, DESIGN.md 3.2). The (app) layout sends every
 * signed-in person without a profile here, and a profile is the one sign
 * that onboarding is done, so a person who has one goes on to Today and an
 * account that is closing to its own page. The session read is the
 * layout's (`sessionMe` shares one answer per request); the page renders
 * beside the layout, so it never throws on an anonymous or failed read.
 *
 * The page renders the five steps in a client component and hands it the
 * server's instant: before a profile exists GET /v1/me has no `today`, so
 * the flow works out today in the zone she chooses from this instant,
 * never from the browser's clock. A read that fails, the session's or the
 * processors', says so instead of starting steps the consent could not end.
 */
export default async function WelcomePage() {
  const lookup = await sessionMe();
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  if (lookup.kind === "closing") redirect(CLOSING_PATH);
  if (lookup.kind === "ok" && lookup.me.profile !== null) redirect(SIGNED_IN_PATH);
  const processors = lookup.kind === "ok" ? await readProcessors() : null;
  return (
    <section className={styles.page} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.heading}>
        {copy.heading}
      </h1>
      {processors === null ? (
        <>
          <p className={styles.lede}>{copy.failedRead}</p>
          <TideLine className={styles.tide} />
        </>
      ) : (
        <WelcomeFlow now={new Date().toISOString()} processors={processors} />
      )}
    </section>
  );
}
