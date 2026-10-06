"use client";

import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";

/**
 * Catches an error thrown below the root layout, so the header and footer
 * stay. The error itself is never shown: no message, no digest, no stack.
 */
export default function ErrorPage({
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
