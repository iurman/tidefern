import Link from "next/link";
import { preload } from "react-dom";

const LIGHT_MARK = "/brand/tidefern-mark.svg";
const DARK_MARK = "/brand/tidefern-mark-dark.svg";

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
   * The page's LCP element, such as the home hero mark. Each variant is then lazy, so
   * only the one the theme shows is fetched (a hidden lazy image never loads), and at
   * high priority: the pattern the installed Next docs give for theme images. The
   * header's smaller mark uses the same files and comes first in the document, so its
   * low-priority request would otherwise be the one the hero shares; a high-priority
   * preload per system theme makes the shared request early and high (task J2b).
   */
  priority?: boolean;
}) {
  const loading = priority ? "lazy" : undefined;
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
        loading={loading}
        fetchPriority={fetchPriority}
        src={LIGHT_MARK}
        alt=""
        width={size}
        height={size}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mark-dark"
        loading={loading}
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
