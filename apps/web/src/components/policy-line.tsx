import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./policy-line.module.css";

/**
 * The two policy links under every authenticated page (DESIGN.md section
 * 2): Privacy, and the Consumer Health Data Privacy Policy under exactly
 * that name, quiet and always reachable. The (app) layout draws it under
 * the shell's page and the (flow) layout under its column, so both draw it
 * the same way; the public footer carries the same two links for the
 * public routes. Anything a frame needs on the same line, such as the
 * flow's sign-out form, comes first as children.
 */
export function PolicyLine({ children }: { children?: ReactNode }) {
  return (
    <footer className={styles.line}>
      {children}
      <nav aria-label="Policies">
        <Link href="/privacy" prefetch={false}>
          Privacy
        </Link>
        <Link href="/health-privacy" prefetch={false}>
          Consumer Health Data Privacy Policy
        </Link>
      </nav>
    </footer>
  );
}
