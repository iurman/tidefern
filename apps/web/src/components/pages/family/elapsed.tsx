"use client";
import { useEffect, useState } from "react";
import { formatElapsed } from "./format";

/**
 * A feed timer's running time, kept on the client as the brief asks: it
 * redraws once a second from the browser clock while it runs and stops at
 * `end` once the timer is stopped. It makes no sound and moves nothing
 * (DESIGN.md 7: a timer is silent), and it announces nothing on its own:
 * `role="timer"` is not a live region, so a screen reader reads it when
 * asked rather than every second.
 */
export function Elapsed({
  start,
  end,
  className,
}: {
  /** When the timer started, an ISO instant. */
  start: string;
  /** When it stopped, or null while it runs. */
  end: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end !== null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [end]);
  const until = end === null ? now : Date.parse(end);
  return (
    <span role="timer" className={className}>
      {formatElapsed(until - Date.parse(start))}
    </span>
  );
}
