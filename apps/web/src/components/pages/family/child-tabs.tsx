"use client";
import { useId, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { familyCopy } from "./copy";
import styles from "./child.module.css";

const copy = familyCopy.child;

export type ChildTab = "timeline" | "growth" | "milestones";

const order: readonly ChildTab[] = ["timeline", "growth", "milestones"];
const options = order.map((value) => ({ value, label: copy.tabs[value] }));

/**
 * Timeline, Growth and Milestones as one segmented control that swaps the
 * panel in place (DESIGN.md section 4: it never navigates, and the choice
 * stays out of the address). Every panel is rendered by the server and kept
 * mounted, so a half-done check-off or a chosen chart range survives a
 * switch; the others are `hidden`. Each panel has its own heading for the
 * page outline, read by assistive technology only, since the control names
 * it on screen.
 */
export function ChildTabs({ panels }: { panels: Record<ChildTab, ReactNode> }) {
  const id = useId();
  const [tab, setTab] = useState<ChildTab>("timeline");
  return (
    <div className={styles.tabs}>
      <SegmentedControl<ChildTab>
        label={copy.view}
        hideLabel
        options={options}
        value={tab}
        onChange={setTab}
        className={styles.view}
      />
      {order.map((key) => (
        <section
          key={key}
          className={styles.panel}
          hidden={tab !== key}
          aria-labelledby={`${id}-${key}`}
          data-panel={key}
        >
          <h2 id={`${id}-${key}`} className="sr-only">
            {copy.tabs[key]}
          </h2>
          {panels[key]}
        </section>
      ))}
    </div>
  );
}
