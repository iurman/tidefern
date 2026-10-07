import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChildView } from "@/components/pages/family/child-view";
import { familyCopy as copy } from "@/components/pages/family/copy";
import { loadChildPage } from "@/components/pages/family/load";
import styles from "@/components/pages/family/child.module.css";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";

// The canonical path is /family, never this one: the child's id stays out of the page head
// (lib/site.ts puts the path into canonical and og:url), and no title names the child.
export const metadata = pageMetadata("/family", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * /family/[childId] (DESIGN.md 3.6, task H5). The id is an opaque path
 * segment; nothing about the child travels in the address. A child the
 * person cannot reach, or an id that is not one, calls `notFound()`, which
 * renders the (app) group's not-found page inside the shell (task G10), the
 * same for both so the page never says whether such a child exists. Like
 * /family, it renders nothing until the shared session read has a profile.
 */
export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const lookup = await sessionMe();
  if (lookup.kind !== "ok") return null;
  const { me } = lookup;
  if (me.profile === null || me.today === null) return null;
  const loaded = await loadChildPage(serverApiClient(await headers()), me, childId);
  if (loaded.kind === "notFound") notFound();
  if (loaded.kind === "failed") {
    return (
      <section className={styles.page} aria-labelledby="child-title">
        <h1 id="child-title" className={styles.name}>
          {copy.heading}
        </h1>
        <p className={styles.errorText}>{copy.child.loadFailed}</p>
      </section>
    );
  }
  return (
    <ChildView
      child={loaded.child}
      access={loaded.access}
      records={loaded.records}
      today={me.today}
      timeZone={me.profile.timeZone}
      units={me.profile.units}
    />
  );
}
