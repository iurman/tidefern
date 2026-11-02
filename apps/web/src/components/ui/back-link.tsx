import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import styles from "./back-link.module.css";

export interface BackLinkProps {
  /** The parent screen. Always a real address, never history, so a deep link and a reload behave the same. */
  href: string;
  /** The parent's name as the page shows it: "Settings". */
  children: ReactNode;
}

/**
 * The way back to a parent screen (DESIGN.md 3.8: "< Settings" above
 * Activity, and above each settings group's own screen on phones): a
 * chevron and the parent's name on a 44 px target in the quiet style. The
 * accessible name reads "Back to Settings"; the visible words stay short.
 */
export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link href={href} prefetch={false} className={styles.back}>
      <Icon name="chevron-left" size={20} />
      <span>
        <span className="sr-only">Back to</span> {children}
      </span>
    </Link>
  );
}
