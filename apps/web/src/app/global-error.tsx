"use client";

import { brand } from "@tidefern/design-tokens";
import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";
import "./globals.css";

/**
 * Catches an error thrown by the root layout itself, where no font loader
 * or provider can be assumed, so it renders its own document. The global
 * stylesheet is imported here directly: it carries the tokens for both
 * themes through prefers-color-scheme, so the page is designed in light and
 * dark without a script. Fonts fall back to the stacks the stylesheet names.
 * The error is never shown: no message, no digest, no stack.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main id="main">
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
        <footer className="site-footer wrap">
          <div className="footer-grid">
            <p className="footer-line">{brand.closing}.</p>
            <nav aria-label="Footer">
              <a href="/privacy">Privacy</a>
              <a href="/health-privacy">Consumer Health Data Privacy Policy</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
