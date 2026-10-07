import { headers } from "next/headers";
import { journeyCopy as copy } from "@/components/pages/journey/copy";
import { JourneyFrame, JourneyScreen } from "@/components/pages/journey/journey-screen";
import { journeyView } from "@/components/pages/journey/view";
import { serverApiClient, sessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";
import { loadJourney } from "./load";

// The title from CONTENT.md: never a stage, a date or a health word in it.
export const metadata = pageMetadata("/journey", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * /journey (task H4). The session read is the layout's (`sessionMe`
 * shares one answer per request), and Next renders this page beside the
 * layout, so it never assumes a profile: without one, or without a
 * session, it renders nothing and the layout redirects. When the read
 * failed it renders only its heading, because the layout already says the
 * profile could not be loaded and how to try again. Everything else comes
 * from the API through the in-process client, and the view decides what
 * may be shown.
 */
export default async function JourneyPage() {
  const lookup = await sessionMe();
  if (lookup.kind === "failed") return <JourneyFrame />;
  if (lookup.kind !== "ok") return null;
  const { me } = lookup;
  if (me.profile === null || me.today === null) return null;
  const reads = await loadJourney(serverApiClient(await headers()), me);
  return <JourneyScreen view={journeyView(me, me.today, reads)} />;
}
