import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { SIGN_IN_PATH } from "@/lib/auth-client";

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * The minimal settings shell until task H7 builds the full `/settings`
 * route: the authenticated frame with Settings current, so the tab bar and
 * the rail are where DESIGN.md section 2 puts them.
 *
 * The gate here is the one `/today` applies first: a visitor without any
 * cookie is sent to sign in before anything renders. The session itself is
 * read by the pages' client calls, which answer a stale cookie with a 401
 * and send the person to sign in from there; the server reads nothing
 * else, so the routes render against the production build without a
 * database and the browser suite can answer every call itself. H7 passes
 * the profile's stage and children into the shell once it reads them; until
 * then the four always-on destinations are listed.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const incoming = await headers();
  if (incoming.get("cookie") === null) redirect(SIGN_IN_PATH);
  return (
    <AppShell stage="none" hasChild={false} current="settings">
      {children}
    </AppShell>
  );
}
