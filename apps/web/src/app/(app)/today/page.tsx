import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { readSessionMe } from "@/lib/api-server";
import { pageMetadata } from "@/lib/site";
import { authCopy } from "../../(public)/(auth)/copy";

const copy = authCopy.today;

export const metadata = pageMetadata("/today", copy.title, copy.description, false);

// Authenticated: rendered per request, never cached (architecture 6.2).
export const dynamic = "force-dynamic";

/**
 * A placeholder for the home screen (task H2 builds the real one): the
 * actor's display name from GET /api/v1/me, read through the in-process
 * client of architecture 5.2 (lib/api-server.ts), and the sign-out form,
 * which is a POST and nothing else. No session sends the person to sign in.
 */
export default async function TodayPage() {
  const lookup = await readSessionMe(await headers());
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
