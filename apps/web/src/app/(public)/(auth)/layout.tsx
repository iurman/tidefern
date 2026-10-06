import type { ReactNode } from "react";
import styles from "./auth.module.css";

/**
 * The frame every auth route renders in: one narrow column under the public
 * header the (public) group layout already draws (these routes are public,
 * DESIGN.md section 2). The global `.wrap` keeps the page gutter and the frame sits
 * inside it on its own element, so the frame's narrow column is not
 * overridden by the wrap's 1200 px limit. Each page sets its own title and
 * noindex through `pageMetadata(..., false)`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wrap">
      <div className={styles.frame}>{children}</div>
    </div>
  );
}
