import { milestoneChecklists } from "@tidefern/core";
import type { TimelineItem } from "@/components/ui/timeline";
import { formatClock, formatDuration, formatVolume, minutesBetween } from "./format";
import { eventMoment, isOngoingSleep } from "./summary";
import type { ChildEvent, UnitSystem } from "./types";

/**
 * The per-child timeline's rows (DESIGN.md 3.6 and section 4): one row per
 * event, in the order the API answered (newest first; the Timeline never
 * sorts), each titled in words and timed in the profile's zone. A milestone
 * event carries only its checklist key, so its title is CDC's own wording
 * from the vendored checklists in packages/core.
 */

const milestoneText = new Map<string, string>(
  milestoneChecklists.flatMap((list) => list.items.map((item) => [item.id, item.text] as const)),
);

const sides: Record<NonNullable<ChildEvent["side"]>, string> = {
  left: "left side",
  right: "right side",
  both: "both sides",
};

const contents: Record<NonNullable<ChildEvent["diaperContents"]>, string> = {
  wet: "wet",
  dirty: "dirty",
  mixed: "wet and dirty",
};

/** "Breast feed, left side", "Bottle feed, 90 ml", "Solids", "Sleep, 6 h", "Diaper, wet". */
export function eventTitle(event: ChildEvent, units: UnitSystem): string {
  switch (event.kind) {
    case "feed": {
      const volume = event.quantityMl === null ? null : formatVolume(event.quantityMl, units);
      const side = event.side === null ? null : sides[event.side];
      if (event.feedMethod === "solids") return "Solids";
      const name =
        event.feedMethod === "breast"
          ? "Breast feed"
          : event.feedMethod === "bottle"
            ? "Bottle feed"
            : "Feed";
      return [name, side, volume].filter(Boolean).join(", ");
    }
    case "sleep":
      if (isOngoingSleep(event)) return "Sleep, going on now";
      if (event.startedAt !== null && event.endedAt !== null) {
        return `Sleep, ${formatDuration(minutesBetween(event.startedAt, event.endedAt))}`;
      }
      return "Sleep";
    case "diaper":
      return event.diaperContents === null ? "Diaper" : `Diaper, ${contents[event.diaperContents]}`;
    case "milestone": {
      const text = event.milestoneId === null ? undefined : milestoneText.get(event.milestoneId);
      return text === undefined ? "Milestone" : `Milestone: ${text}`;
    }
  }
}

/** "2:15 PM", "11:00 PM to 5:00 AM", with the note after it when there is one. */
export function eventDetail(event: ChildEvent, timeZone: string): string | undefined {
  const parts: string[] = [];
  if (event.kind !== "milestone") {
    const start = formatClock(eventMoment(event), timeZone);
    parts.push(
      event.startedAt !== null && event.endedAt !== null
        ? `${start} to ${formatClock(event.endedAt, timeZone)}`
        : isOngoingSleep(event)
          ? `Since ${start}`
          : start,
    );
  }
  if (event.note !== null) parts.push(`Note: ${event.note}`);
  return parts.length === 0 ? undefined : parts.join(". ");
}

export function timelineItemsFrom(
  events: readonly ChildEvent[],
  { timeZone, units }: { timeZone: string; units: UnitSystem },
): TimelineItem[] {
  return events.map((event) => {
    const detail = eventDetail(event, timeZone);
    return {
      key: event.id,
      date: event.date,
      title: eventTitle(event, units),
      ...(detail === undefined ? {} : { detail }),
    };
  });
}
