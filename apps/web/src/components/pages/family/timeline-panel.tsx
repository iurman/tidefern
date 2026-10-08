"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { browserApiClient } from "@/lib/api-browser";
import { familyCopy } from "./copy";
import { timelinePage } from "./load";
import { timelineItemsFrom } from "./timeline-items";
import type { UnitSystem } from "./types";
import styles from "./child.module.css";

const copy = familyCopy.timeline;

export interface TimelinePanelProps {
  childId: string;
  childName: string;
  /** The first page, newest first, as the server read and worded it. */
  items: TimelineItem[];
  nextCursor: string | null;
  timeZone: string;
  units: UnitSystem;
  /** She can log for this child, so the empty state points to where she logs. */
  canWrite: boolean;
}

/**
 * The child's events newest first with the newest row on warmth (DESIGN.md
 * 3.6: nothing else on this screen uses it). Older entries load on request
 * through the browser client, a page at a time, in the order the API keeps;
 * the panel never sorts. The server keys this panel by its first page, so a
 * re-read after a write starts it again from the newest. With nothing logged
 * it is the same empty-state card as Growth and Milestones beside it.
 */
export function TimelinePanel({
  childId,
  childName,
  items: first,
  nextCursor,
  timeZone,
  units,
  canWrite,
}: TimelinePanelProps) {
  const [items, setItems] = useState(first);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const attempts = useRef(0);

  async function more() {
    if (cursor === null || loading) return;
    setLoading(true);
    setError(null);
    const page = await timelinePage(browserApiClient(), childId, cursor);
    setLoading(false);
    if (page === "failed") {
      attempts.current += 1;
      setError(attempts.current);
      return;
    }
    setItems((current) => [...current, ...timelineItemsFrom(page.items, { timeZone, units })]);
    setCursor(page.nextCursor);
  }

  if (items.length === 0) {
    // An empty first page has no cursor, so there is nothing older to offer.
    const empty = copy.empty(childName);
    return (
      <EmptyState
        level={3}
        heading={empty.heading}
        why={empty.why}
        action={canWrite ? <Button href="/family">{copy.emptyAction}</Button> : undefined}
      />
    );
  }

  return (
    <div className={styles.stack}>
      <Timeline label={copy.label} items={items} highlightNewest />
      {cursor !== null ? (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            loading={loading}
            loadingText={copy.loadingMore}
            onClick={() => void more()}
          >
            {copy.more}
          </Button>
        </div>
      ) : null}
      {error !== null ? (
        <InlineFeedback key={error} tone="error" cue>
          {copy.moreFailed}
        </InlineFeedback>
      ) : null}
    </div>
  );
}
