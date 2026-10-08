"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { browserApiClient } from "@/lib/api-browser";
import { activityCopy as copy } from "./copy";
import {
  activityRow,
  type ActivityContext,
  type ActivityEvent,
  type ActivityPage,
} from "./sentences";
import styles from "./activity.module.css";

/** How the next page's read ended. */
type PageRead =
  | { kind: "page"; page: ActivityPage }
  | { kind: "signed-out" }
  | { kind: "failed"; sentence: string };

/**
 * GET /api/v1/me/activity after the cursor, through the browser client: the
 * cursor and the size are the only query, and neither says anything about
 * anyone. A 401 means the session ended or the account is closing.
 */
async function readNextPage(cursor: string, limit: number): Promise<PageRead> {
  try {
    const { data, response } = await browserApiClient().GET("/api/v1/me/activity", {
      params: { query: { cursor, limit } },
    });
    if (response.status === 401) return { kind: "signed-out" };
    if (data === undefined) return { kind: "failed", sentence: copy.loadMoreFailed };
    return { kind: "page", page: data };
  } catch {
    // No answer at all: the connection dropped or the device is offline.
    return { kind: "failed", sentence: copy.unreachable };
  }
}

type Status =
  { kind: "idle" } | { kind: "loading" } | { kind: "failed"; sentence: string; attempt: number };

export interface ActivityListProps {
  /** The first page, read on the server. */
  initial: ActivityPage;
  context: ActivityContext;
  /** The size every Load more asks for, the same as the first page's. */
  pageSize: number;
}

/**
 * The activity list (DESIGN.md 3.8): one row per audit event, newest first,
 * each the day in her zone, what happened and who did it. The first page
 * arrives rendered from the server; "Load more" reads the next one through
 * the browser client and appends it, keeping its width and saying it is
 * loading while it waits. A failure says what to do next beside the button
 * and plays the error cue with it; focus moves to the first new row, so a
 * keyboard reader carries on where the new rows begin even when the button
 * goes away at the end of the list. A session that ended sends the page back
 * through the server, whose layout decides where the person belongs.
 */
export function ActivityList({ initial, context, pageSize }: ActivityListProps) {
  const router = useRouter();
  const [items, setItems] = useState<ActivityEvent[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusRow = useRef<HTMLLIElement>(null);
  // One read at a time, even for a second press that lands before the button shows it is busy.
  const reading = useRef(false);
  // Numbers each failure, so a second one is a new line that is announced and cued again.
  const failures = useRef(0);

  useEffect(() => {
    if (focusId !== null) focusRow.current?.focus();
  }, [focusId]);

  async function loadMore() {
    if (cursor === null || reading.current) return;
    reading.current = true;
    setStatus({ kind: "loading" });
    const read = await readNextPage(cursor, pageSize);
    reading.current = false;
    if (read.kind === "signed-out") {
      // The server's layout sends her to sign in, or to the locked view when the account is closing.
      setStatus({ kind: "idle" });
      router.refresh();
      return;
    }
    if (read.kind === "failed") {
      failures.current += 1;
      setStatus({ kind: "failed", sentence: read.sentence, attempt: failures.current });
      return;
    }
    const shown = new Set(items.map((item) => item.id));
    const added = read.page.items.filter((item) => !shown.has(item.id));
    setItems([...items, ...added]);
    setCursor(read.page.nextCursor);
    setStatus({ kind: "idle" });
    // The first new row, or the last row when the page brought none and the button is gone.
    setFocusId(added[0]?.id ?? items.at(-1)?.id ?? null);
  }

  if (items.length === 0 && cursor === null) {
    return <EmptyState heading={copy.empty.heading} why={copy.empty.why} />;
  }

  return (
    <>
      <ol className={styles.list}>
        {items.map((event) => {
          const row = activityRow(event, context);
          const target = row.id === focusId;
          return (
            <li
              key={row.id}
              ref={target ? focusRow : undefined}
              tabIndex={target ? -1 : undefined}
              className={styles.row}
            >
              <time className={styles.when} dateTime={row.day}>
                {row.dayLabel}
                {row.year !== null ? (
                  <>
                    <span className="sr-only">, </span>
                    <span className={styles.year}>{row.year}</span>
                  </>
                ) : null}
              </time>
              <span className={styles.what}>{row.what}</span>
              <span className={styles.who}>{row.who}</span>
            </li>
          );
        })}
      </ol>
      {cursor !== null ? (
        <div className={styles.more}>
          <Button
            variant="secondary"
            loading={status.kind === "loading"}
            loadingText={copy.loadingMore}
            onClick={loadMore}
          >
            {copy.loadMore}
          </Button>
          {status.kind === "failed" ? (
            <InlineFeedback key={status.attempt} tone="error" cue>
              {status.sentence}
            </InlineFeedback>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
