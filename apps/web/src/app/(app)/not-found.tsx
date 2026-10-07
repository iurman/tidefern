import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";
import { SIGNED_IN_PATH } from "@/lib/auth-client";

/**
 * What `notFound()` from a page in the (app) group renders (a date that is
 * not a calendar day, a child the person cannot reach). Next renders the
 * nearest not-found boundary, and this group's sits inside its layout, so
 * the shell, its destinations and the policy line stay and no public header
 * appears. An address that matches no route at all still gets the root
 * not-found page with the public chrome. A `notFound()` in a route with a
 * loading boundary streams with status 200, so tests read the statement,
 * not the status.
 */
export default function AppNotFound() {
  return (
    <Statement
      heading="That page is not here."
      sentence="The address may have changed, or it never existed."
      action={<Button href={SIGNED_IN_PATH}>Back to Today</Button>}
    />
  );
}
