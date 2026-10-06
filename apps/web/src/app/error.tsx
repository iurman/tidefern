"use client";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";

/**
 * Catches an error thrown below the root layout. It takes the place of the
 * route group's layout too, so it draws the public header and footer
 * itself. The error itself is never shown: no message, no digest, no stack.
 */
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        <Statement
          heading="Something went wrong."
          sentence="Nothing you entered was lost on the server. You can try again."
          action={
            <Button type="button" onClick={() => retry()}>
              Try again
            </Button>
          }
        />
      </main>
      <Footer />
    </>
  );
}
