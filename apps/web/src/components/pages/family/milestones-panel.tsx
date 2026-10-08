"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { formatDayWithYear } from "@/components/ui/marks-format";
import { browserApiClient } from "@/lib/api-browser";
import { failureLine, familyCopy } from "./copy";
import { checkMilestone } from "./mutations";
import type { MilestoneCheck, MilestoneChecklist } from "./types";
import styles from "./child.module.css";

const copy = familyCopy.milestones;

const domains: readonly MilestoneCheck["domain"][] = [
  "social",
  "language",
  "cognitive",
  "movement",
];

/** The checklist's items by CDC's four headings, in CDC's order, leaving out a heading with none. */
export function byDomain(
  items: readonly MilestoneCheck[],
): { domain: MilestoneCheck["domain"]; items: MilestoneCheck[] }[] {
  return domains.flatMap((domain) => {
    const inDomain = items.filter((item) => item.domain === domain);
    return inDomain.length === 0 ? [] : [{ domain, items: inDomain }];
  });
}

export interface MilestonesPanelProps {
  childId: string;
  /** The API's checklist for the child's age: CDC's items, the framing, the line and the attribution. */
  checklist: MilestoneChecklist;
  /** She can check items off (a guardian or a contribute grant). */
  canWrite: boolean;
}

/**
 * Milestones (architecture 13.10): CDC's checklist for the child's age as
 * the API answers it, with the milestone template ("Most children do this by
 * [age]. This is not a screening tool; your pediatrician is.") and CDC's
 * attribution, each sentence once. Each item is a CheckboxField; a press
 * saves on its own (PUT with the item in the body) and the box changes only
 * when the API answers, so it never shows a check-off the API does not hold.
 * Someone who cannot write sees the same list read-only.
 */
export function MilestonesPanel({ childId, checklist, canWrite }: MilestonesPanelProps) {
  const router = useRouter();
  const headingId = useId();
  const list = useRef<HTMLElement>(null);
  const [items, setItems] = useState(checklist.items);
  // A re-read after any write (here, or a log on another device) brings the API's list again.
  const [seen, setSeen] = useState(checklist.items);
  if (seen !== checklist.items) {
    setSeen(checklist.items);
    setItems(checklist.items);
  }
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, { text: string; id: number }>>>({});
  const attempts = useRef(0);

  async function toggle(item: MilestoneCheck, checked: boolean) {
    if (saving.has(item.id)) return;
    setSaving((current) => new Set(current).add(item.id));
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)),
    );
    const result = await checkMilestone(browserApiClient(), childId, item.id, checked);
    setSaving((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    if (result.ok) {
      setItems((current) => current.map((each) => (each.id === item.id ? result.value : each)));
      router.refresh();
      return;
    }
    attempts.current += 1;
    const line = { text: failureLine(result, copy.failed), id: attempts.current };
    setErrors((current) => ({ ...current, [item.id]: line }));
  }

  const nothingMarked = items.every((item) => !item.checked);

  return (
    <div className={styles.stack}>
      {nothingMarked ? (
        <EmptyState
          level={3}
          heading={copy.empty.heading}
          why={copy.empty.why}
          action={
            canWrite ? (
              // Moves focus to the first box rather than to an address, which stays as it is.
              <Button
                variant="secondary"
                onClick={() =>
                  list.current?.querySelector<HTMLInputElement>("input[type='checkbox']")?.focus()
                }
              >
                {copy.empty.action}
              </Button>
            ) : undefined
          }
        />
      ) : null}
      <section ref={list} className={styles.checklist} aria-labelledby={headingId}>
        <h3 id={headingId} className={styles.checklistHeading}>
          {copy.heading(checklist.label)}
        </h3>
        {/* The 13.10 template, once per list; when nothing is marked the empty state above
            already carries the not-a-screening line, so the list keeps the framing alone. */}
        <p className={styles.framing}>
          {nothingMarked ? checklist.framing : `${checklist.framing} ${checklist.notScreeningLine}`}
        </p>
        {byDomain(items).map((group) => (
          <fieldset key={group.domain} className={styles.domain}>
            <legend className={styles.domainLegend}>{copy.domains[group.domain]}</legend>
            {group.items.map((item) => {
              const error = errors[item.id];
              return (
                <div key={item.id} className={styles.item}>
                  <CheckboxField
                    label={item.text}
                    help={
                      item.checked && item.checkedOn !== null
                        ? copy.markedOn(formatDayWithYear(item.checkedOn))
                        : undefined
                    }
                    checked={item.checked}
                    onChange={canWrite ? (next) => void toggle(item, next) : undefined}
                    disabled={!canWrite}
                    loading={saving.has(item.id)}
                    loadingText={copy.saving}
                  />
                  {error === undefined ? null : (
                    <InlineFeedback key={error.id} tone="error" cue>
                      {error.text}
                    </InlineFeedback>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
        <p className={styles.attribution}>{checklist.attribution}</p>
      </section>
    </div>
  );
}
