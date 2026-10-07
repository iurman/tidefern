"use client";
import Link from "next/link";
import { Icon } from "@/components/icons";
import type { Destination, DestinationKey } from "./shell-destinations";
import styles from "./tab-bar.module.css";

export interface TabBarProps {
  destinations: Destination[];
  current: DestinationKey;
  /** The quick-log action: what the page on screen registered with `useQuickLog` (quick-log.tsx). */
  onQuickLog?: () => void;
}

/**
 * The bottom tab bar of the authenticated shell below 1024 px (architecture
 * 13.7): 24 px icons with visible labels, `aria-current="page"` on the
 * destination the person is on, the quick-log button on Today, and
 * safe-area padding for phones with a home indicator.
 */
export function TabBar({ destinations, current, onQuickLog }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Main">
      <ul className={styles.list}>
        {destinations.map((destination) => {
          const active = destination.key === current;
          return (
            <li key={destination.key} className={styles.item}>
              <Link
                href={destination.href}
                prefetch={false}
                className={styles.link}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={destination.icon} size={24} />
                <span className={styles.label}>{destination.label}</span>
              </Link>
            </li>
          );
        })}
        {current === "today" ? (
          <li className={styles.item}>
            <button
              type="button"
              className={styles.quickLog}
              aria-label="Log today"
              onClick={onQuickLog}
            >
              <span className={styles.quickLogMark}>
                <Icon name="plus" size={24} />
              </span>
              <span className={styles.label}>Log</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
