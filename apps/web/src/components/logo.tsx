import Link from "next/link";

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
   * high priority: the pattern the installed Next docs give for theme images.
   */
  priority?: boolean;
}) {
  const loading = priority ? "lazy" : undefined;
  const fetchPriority = priority ? "high" : undefined;
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
        src="/brand/tidefern-mark.svg"
        alt=""
        width={size}
        height={size}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mark-dark"
        loading={loading}
        fetchPriority={fetchPriority}
        src="/brand/tidefern-mark-dark.svg"
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
