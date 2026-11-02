import { headers } from "next/headers";
import { todayCopy } from "@/components/pages/today/copy";
import { TodayScreen } from "@/components/pages/today/today-screen";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";
import { loadToday } from "./load";
import styles from "./today.module.css";

// The title from CONTENT.md: never a stage, a date or a health word in it.
export const metadata = pageMetadata("/today", todayCopy.title, todayCopy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The home screen (task H2, DESIGN.md 3.3). The session is the (app)
 * layout's read (`sessionMe` shares one answer per request); the layout
 * sends a visitor without a session to sign in, a closing account to its
 * own page and a person without a profile to /welcome, and since Next
 * renders this page beside the layout, the page renders nothing in those
 * cases rather than assuming a profile. A read that failed keeps the page's
 * heading under the layout's notice, which already says what to do.
 * Everything else is read through the API in process (`loadToday`) and
 * shaped by stage before it renders.
 */
export default async function TodayPage() {
  const lookup = await sessionMe();
  if (lookup.kind === "failed") {
    return <h1 className={styles.heading}>{todayCopy.title}</h1>;
  }
  if (lookup.kind !== "ok") return null;
  const { me } = lookup;
  if (me.profile === null || me.today === null) return null;
  const view = await loadToday(serverApiClient(await headers()), {
    me,
    profile: me.profile,
    today: me.today,
  });
  return <TodayScreen view={view} />;
}
