import Link from "next/link";
import { brand } from "@tidefern/design-tokens";

export function Footer() {
  return (
    <footer className="site-footer wrap">
      <div className="footer-grid">
        <p className="footer-line">{brand.closing}.</p>
        <nav aria-label="Footer">
          <Link href="/design" prefetch={false}>
            Design system
          </Link>
          <a href="/api/v1/openapi.json">API contract</a>
        </nav>
        <p className="footer-note">
          No analytics, no trackers. Theme and sound choices are remembered on this device only.
        </p>
      </div>
    </footer>
  );
}
