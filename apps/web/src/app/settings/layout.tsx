import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { readSessionMe } from "@/lib/api-server";
import { SIGN_IN_PATH } from "@/lib/auth-client";

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The minimal settings shell until task H7 builds the full `/settings`
 * route: the authenticated frame with Settings current, so the tab bar and
 * the rail are where DESIGN.md section 2 puts them.
 *
 * A visitor without a session is sent to sign in before anything renders;
 * the pages' client calls read the session again for what they show, and a
 * cookie the server could not check (a read that failed rather than
 * answered 401) is settled by them. H7 passes the profile's stage and
 * children into the shell once it reads them; until then the four always-on
 * destinations are listed.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  // The session read of architecture 6.2, the way `/today` makes it: the
  // typed client over the Hono app's own handler, in process (lib/api-server.ts).
  const lookup = await readSessionMe(await headers());
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  return (
    <AppShell stage="none" hasChild={false} current="settings">
      {children}
    </AppShell>
  );
}
