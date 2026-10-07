import type { ReactNode } from "react";
import { Rail } from "./rail";
import { shellDestinations, type DestinationKey, type ShellProfile } from "./shell-destinations";
import { TabBar } from "./tab-bar";
import styles from "./app-shell.module.css";

export interface AppShellProps extends ShellProfile {
  /** The destination the person is on; it carries `aria-current="page"`. */
  current: DestinationKey;
  /** The quick-log action: what the page on screen registered with `useQuickLog` (quick-log.tsx). */
  onQuickLog?: () => void;
  /**
   * `viewport` (the app) fills the viewport so the tab bar sits at the
   * bottom; `content` (documentation, previews) sizes the frame to its
   * children and keeps the bar beneath them.
   */
  fit?: "viewport" | "content";
  children: ReactNode;
}

/**
 * The authenticated frame (DESIGN.md section 2): a bottom tab bar below
 * 1024 px and a left rail from 1024 px, switched by the shell's own width
 * through a container query so the frame answers to the space it has, not
 * the window. Destinations follow the profile's stage and children. The
 * public header never renders inside it.
 */
export function AppShell({
  stage,
  hasChild,
  sharedPregnancy = false,
  current,
  onQuickLog,
  fit = "viewport",
  children,
}: AppShellProps) {
  const destinations = shellDestinations({ stage, hasChild, sharedPregnancy });
  // The quick log opens the day sheet, a body question the none stage is never asked (DESIGN.md 3.3).
  const quickLog = current === "today" && stage !== "none";
  const className = fit === "content" ? `${styles.shell} ${styles.content}` : styles.shell;
  // The root is the size container and the frame is the grid, because a
  // container query never matches the container element itself.
  return (
    <div className={className}>
      <div className={styles.frame}>
        <Rail
          destinations={destinations}
          current={current}
          onQuickLog={onQuickLog}
          quickLog={quickLog}
        />
        <div className={styles.page}>{children}</div>
        <TabBar
          destinations={destinations}
          current={current}
          onQuickLog={onQuickLog}
          quickLog={quickLog}
        />
      </div>
    </div>
  );
}
