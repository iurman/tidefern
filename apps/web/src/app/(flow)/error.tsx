"use client";

import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";

/**
 * Catches an error thrown by a page in the (flow) group. It renders inside
 * the group layout, so the column, the sign-out form and the policy line
 * stay, and an authenticated URL never falls through to the root error page
 * with its public header. The error itself is never shown: no message, no
 * digest, no stack.
 */
export default function FlowErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Statement
      heading="Something went wrong."
      sentence="Nothing you entered was lost on the server. You can try again."
      action={
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
