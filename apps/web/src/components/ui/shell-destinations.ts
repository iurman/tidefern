import type { Stage } from "@tidefern/schemas";
import type { IconName } from "@/components/icons";

/**
 * The authenticated shell's destinations (DESIGN.md section 2): Today,
 * Calendar, Sharing and Settings always; Journey while a pregnancy or the
 * postpartum stage is current; Family once a child exists; both when both.
 * The tab bar and the rail read the same list so they can never disagree.
 */

export type DestinationKey = "today" | "calendar" | "journey" | "family" | "sharing" | "settings";

export interface Destination {
  key: DestinationKey;
  label: string;
  href: `/${DestinationKey}`;
  icon: IconName;
}

export interface ShellProfile {
  stage: Stage;
  hasChild: boolean;
}

const all: Destination[] = [
  { key: "today", label: "Today", href: "/today", icon: "today" },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "calendar" },
  { key: "journey", label: "Journey", href: "/journey", icon: "journey" },
  { key: "family", label: "Family", href: "/family", icon: "family" },
  { key: "sharing", label: "Sharing", href: "/sharing", icon: "sharing" },
  { key: "settings", label: "Settings", href: "/settings", icon: "settings" },
];

export function shellDestinations({ stage, hasChild }: ShellProfile): Destination[] {
  const journey = stage === "pregnancy" || stage === "postpartum";
  return all.filter((destination) => {
    if (destination.key === "journey") return journey;
    if (destination.key === "family") return hasChild;
    return true;
  });
}
