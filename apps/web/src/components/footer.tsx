import Link from "next/link";
import { brand } from "@tidefern/design-tokens";

export function Footer() {
  return (
    <footer className="site-footer wrap">
      <div className="footer-grid">
        <p className="footer-line">{brand.closing}.</p>
        <nav aria-label="Footer">
          <Link href="/privacy" prefetch={false}>
            Privacy
          </Link>
          <Link href="/health-privacy" prefetch={false}>
            Consumer Health Data Privacy Policy
          </Link>
          <Link href="/design" prefetch={false}>
            Design system
          </Link>
          <a href="/api/v1/openapi.json">API contract</a>
        </nav>
        <p className="footer-note">
          No third-party analytics, no trackers. Theme and sound choices are remembered on this
          device only.
        </p>
      </div>
    </footer>
  );
}
