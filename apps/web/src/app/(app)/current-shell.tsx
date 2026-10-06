"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import type { DestinationKey, ShellProfile } from "@/components/ui/shell-destinations";

const keys: readonly DestinationKey[] = [
  "today",
  "calendar",
  "journey",
  "family",
  "sharing",
  "settings",
];

/**
 * The destination a path belongs to: its first segment, so `/settings/sound`
 * is Settings and `/family/[childId]` will be Family. Every route in the
 * (app) group is a destination today; a later route outside the six names
 * its parent here when it lands.
 */
export function destinationFor(pathname: string): DestinationKey {
  const segment = pathname.split("/")[1] ?? "";
  return keys.find((key) => key === segment) ?? "today";
}

/**
 * The app shell with the current destination marked. A layout is not told
 * the path it renders for, so this small client part reads it and the
 * server layout passes everything else, the page included, as children.
 */
export function CurrentShell({
  stage,
  hasChild,
  children,
}: ShellProfile & { children: ReactNode }) {
  const current = destinationFor(usePathname());
  return (
    <AppShell stage={stage} hasChild={hasChild} current={current}>
      {children}
    </AppShell>
  );
}
