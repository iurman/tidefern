"use client";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Mark } from "@/components/logo";
import type { Destination, DestinationKey } from "./shell-destinations";
import styles from "./rail.module.css";

export interface RailProps {
  destinations: Destination[];
  current: DestinationKey;
  /** The quick-log action: what the page on screen registered with `useQuickLog` (quick-log.tsx). */
  onQuickLog?: () => void;
  /** Whether the quick-log button shows; Today by default, and never for a stage that asks no body question. */
  quickLog?: boolean;
}

/**
 * The left rail of the authenticated shell from 1024 px (architecture
 * 13.7): the mark and wordmark leading to Today, the destinations with
 * 24 px icons and labels, `aria-current="page"`, and the quick-log action
 * while the person is on Today.
 */
export function Rail({
  destinations,
  current,
  onQuickLog,
  quickLog = current === "today",
}: RailProps) {
  return (
    <nav className={styles.rail} aria-label="Main">
      <Link href="/today" prefetch={false} className={styles.home}>
        <Mark size={32} />
        <span className={styles.wordmark}>Tidefern</span>
      </Link>
      <ul className={styles.list}>
        {destinations.map((destination) => {
          const active = destination.key === current;
          return (
            <li key={destination.key}>
              <Link
                href={destination.href}
                prefetch={false}
                className={styles.link}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={destination.icon} size={24} />
                <span>{destination.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {quickLog ? (
        <button type="button" className={styles.quickLog} onClick={onQuickLog}>
          <Icon name="plus" size={20} />
          <span>Log today</span>
        </button>
      ) : null}
    </nav>
  );
}
