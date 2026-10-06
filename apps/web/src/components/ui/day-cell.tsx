import type { ReactNode } from "react";
import type { DayEdge, DayTexture } from "./calendar-dates";
import styles from "./day-cell.module.css";

/**
 * The content of one calendar day (DESIGN.md 6.2): the number in Figtree with
 * tabular figures, the 4 px text-colored dot for a day with an entry and the
 * small outlined dot. The pill textures are drawn by the element that holds
 * the day (a grid cell or a strip item) through `dayCellClassNames`, so a
 * window reads as one continuous pill behind consecutive days.
 */
export interface DayCellProps {
  number: ReactNode;
  /** The small outlined dot under the number. */
  point?: boolean;
  /** The 4 px text-colored dot that marks a day with an entry. */
  noted?: boolean;
}

export function DayCell({ number, point, noted }: DayCellProps) {
  return (
    <span className={styles.cell}>
      <span className={`${styles.number} tabular`}>{number}</span>
      {point || noted ? (
        <span className={styles.marks} aria-hidden="true">
          {noted ? <i className={styles.noted} /> : null}
          {point ? <i className={styles.point} /> : null}
        </span>
      ) : null}
    </span>
  );
}

export const textureClassNames: Record<DayTexture, string> = {
  logged: styles.logged ?? "",
  predicted: styles.predicted ?? "",
  estimated: styles.estimated ?? "",
};

export const edgeClassNames: Record<DayEdge, string> = {
  start: styles.edgeStart ?? "",
  middle: styles.edgeMiddle ?? "",
  end: styles.edgeEnd ?? "",
  single: styles.edgeSingle ?? "",
};

/** The host class every day holder carries, with the texture and edge for the day. */
export function dayCellClassNames(facts: {
  texture?: DayTexture | undefined;
  edge?: DayEdge | undefined;
  today?: boolean | undefined;
  outside?: boolean | undefined;
}): string {
  const names = [styles.host];
  if (facts.texture) names.push(textureClassNames[facts.texture]);
  if (facts.texture && facts.edge) names.push(edgeClassNames[facts.edge]);
  if (facts.today) names.push(styles.today);
  if (facts.outside) names.push(styles.outside);
  return names.filter(Boolean).join(" ");
}

/** The host class alone, for react-day-picker's `classNames.day`. */
export const dayHostClassName = styles.host ?? "";
export const dayTodayClassName = styles.today ?? "";
export const dayOutsideClassName = styles.outside ?? "";

/** A row of sample cells for the reference chapter only. */
export const daySampleClassNames = {
  list: styles.samples ?? "",
  item: styles.sample ?? "",
};
