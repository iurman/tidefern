"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { QuickLogProvider } from "@/components/ui/quick-log";
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
 * Routes in the group that are not destinations of their own, by the
 * destination they are reached from (DESIGN.md section 2): the day sheet
 * as a page opens from Calendar, and Activity from Settings.
 */
const parents = new Map<string, DestinationKey>([
  ["log", "calendar"],
  ["activity", "settings"],
]);

/**
 * The destination a path belongs to: its first segment, so `/settings/sound`
 * is Settings and `/family/[childId]` is Family, or the destination a
 * non-destination route belongs to. Anything else falls back to Today.
 */
export function destinationFor(pathname: string): DestinationKey {
  const segment = pathname.split("/")[1] ?? "";
  return keys.find((key) => key === segment) ?? parents.get(segment) ?? "today";
}

/**
 * The app shell with the current destination marked and the quick-log
 * action the page on screen registered (`useQuickLog`). A layout is not
 * told the path it renders for, so this small client part reads it and the
 * server layout passes everything else, the page included, as children.
 */
export function CurrentShell({
  stage,
  hasChild,
  children,
}: ShellProfile & { children: ReactNode }) {
  const current = destinationFor(usePathname());
  return (
    <QuickLogProvider>
      {(onQuickLog) => (
        <AppShell stage={stage} hasChild={hasChild} current={current} onQuickLog={onQuickLog}>
          {children}
        </AppShell>
      )}
    </QuickLogProvider>
  );
}
