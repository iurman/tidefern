import { headers } from "next/headers";
import { familyCopy as copy } from "@/components/pages/family/copy";
import { FamilyView } from "@/components/pages/family/family-view";
import { loadFamily } from "@/components/pages/family/load";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";

// Never the child's name, a date or a health word (CONTENT.md: "Family | Tidefern").
export const metadata = pageMetadata("/family", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * /family (DESIGN.md 3.6, task H5): every child the person can reach, as a
 * guardian or through a child grant, from the API on the in-process client.
 * The (app) layout already read the session and decides where a visitor
 * without one, a closing account or a person without a profile lands; this
 * page shares that read (`sessionMe`) and renders nothing until there is a
 * profile, so a failed session read is said once, by the layout. "Now" is
 * the server's clock, read once here for the times since each event; today
 * is the API's.
 */
export default async function FamilyPage() {
  const lookup = await sessionMe();
  if (lookup.kind !== "ok") return null;
  const { me } = lookup;
  if (me.profile === null || me.today === null) return null;
  const family = await loadFamily(serverApiClient(await headers()), me, {
    today: me.today,
    timeZone: me.profile.timeZone,
    now: new Date(),
  });
  return <FamilyView family={family} today={me.today} units={me.profile.units} />;
}
