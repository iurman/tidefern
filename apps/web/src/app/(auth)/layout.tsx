import type { ReactNode } from "react";
import styles from "./auth.module.css";

/**
 * The frame every auth route renders in: one narrow column under the public
 * header the root layout already draws (these routes are public, DESIGN.md
 * section 2). Each page sets its own title and noindex through
 * `pageMetadata(..., false)`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={`wrap ${styles.frame}`}>{children}</div>;
}
