import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { GET as api } from "@/app/api/[[...route]]/route";
import { AppShell } from "@/components/ui/app-shell";
import { SIGN_IN_PATH } from "@/lib/auth-client";

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

type Lookup = { kind: "anonymous" } | { kind: "ok" } | { kind: "failed" };

/**
 * The session read of architecture 6.2, the way `/today` makes it: the
 * Hono app's own handler called in process with the incoming cookie, so it
 * costs no second function invocation and never meets a preview's
 * protection. A 401 is a visitor without a session; any other failure
 * (no database, for one) is not, and the pages still render and let their
 * own client reads say what is wrong. The api-client package (tasks E)
 * replaces this with the typed client; `/today` carries the same read
 * until then.
 */
async function readMe(incoming: Headers): Promise<Lookup> {
  const cookie = incoming.get("cookie");
  if (cookie === null) return { kind: "anonymous" };
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost";
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  try {
    const response = await api(
      new Request(`${protocol}://${host}/api/v1/me`, { headers: { cookie } }),
    );
    if (response.status === 401) return { kind: "anonymous" };
    if (!response.ok) return { kind: "failed" };
    return { kind: "ok" };
  } catch {
    return { kind: "failed" };
  }
}

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
  const lookup = await readMe(await headers());
  if (lookup.kind === "anonymous") redirect(SIGN_IN_PATH);
  return (
    <AppShell stage="none" hasChild={false} current="settings">
      {children}
    </AppShell>
  );
}
