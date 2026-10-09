import Link from "next/link";
import { preload } from "react-dom";
import { MARK_DARK as DARK_MARK, MARK_LIGHT as LIGHT_MARK } from "@/lib/brand-mark";

/**
 * The mark is a hand-authored vector reconstruction of the brand sheet, pending
 * owner approval of final geometry. Two color variants keep it legible on
 * each theme; the wordmark is set in Newsreader, never traced.
 */
export function Mark({
  size = 40,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  /**
   * The page's LCP element, such as the home hero mark: each variant at high priority,
   * with a high-priority preload per system theme so the request starts from the head.
   * A stored theme that differs from the system's gets its preload from the preference
   * script in the root layout, since a media query cannot see the stored choice.
   */
  priority?: boolean;
}) {
  // Both variants are lazy, the pattern the installed Next docs give for theme images: a
  // hidden lazy image is never fetched, so only the variant the theme shows downloads.
  // Lazy also keeps React from emitting its own low-priority preload for each eager
  // image, which the hero's preload would otherwise dedupe against, since the header's
  // mark uses the same files and comes first in the document (task J2b).
  const fetchPriority = priority ? "high" : undefined;
  if (priority) {
    preload(LIGHT_MARK, {
      as: "image",
      fetchPriority: "high",
      media: "(prefers-color-scheme: light)",
    });
    preload(DARK_MARK, {
      as: "image",
      fetchPriority: "high",
      media: "(prefers-color-scheme: dark)",
    });
  }
  return (
    <span
      className={`mark ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mark-light"
        loading="lazy"
        fetchPriority={fetchPriority}
        src={LIGHT_MARK}
        alt=""
        width={size}
        height={size}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mark-dark"
        loading="lazy"
        fetchPriority={fetchPriority}
        src={DARK_MARK}
        alt=""
        width={size}
        height={size}
      />
    </span>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Link href="/" className="logo" aria-label="Tidefern home">
      <Mark size={size} />
      <span className="wordmark">Tidefern</span>
    </Link>
  );
}
