import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Me } from "@tidefern/api";
import { GET as api } from "@/app/api/[[...route]]/route";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { pageMetadata } from "@/lib/site";
import { authCopy } from "../(auth)/copy";

const copy = authCopy.today;

export const metadata = pageMetadata("/today", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

type Lookup = { kind: "anonymous" } | { kind: "ok"; me: Me } | { kind: "failed" };

/**
 * The in-process client of architecture 5.2 in its smallest form: the Hono
 * app's own handler, called with the incoming cookie, so reading the
 * session costs no second function invocation and never meets a preview's
 * protection. The api-client package (tasks E) replaces this with the
 * typed client; until then this placeholder is the only caller.
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
    return { kind: "ok", me: (await response.json()) as Me };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * A placeholder for the home screen (task H2 builds the real one): the
 * actor's display name from GET /api/v1/me and the sign-out form, which is
 * a POST and nothing else. No session sends the person to sign in.
 */
export default async function TodayPage() {
  const lookup = await readMe(await headers());
  if (lookup.kind === "anonymous") redirect("/sign-in");
  return (
    <section className="wrap narrow section" aria-labelledby="today-title">
      {lookup.kind === "ok" ? (
        <h1 id="today-title">{lookup.me.profile?.displayName ?? "Welcome"}</h1>
      ) : (
        <>
          <h1 id="today-title">{copy.title}</h1>
          <InlineFeedback tone="error">{copy.loadFailed}</InlineFeedback>
        </>
      )}
      <form method="post" action="/sign-out">
        <Button type="submit" variant="secondary">
          {copy.signOut}
        </Button>
      </form>
    </section>
  );
}
