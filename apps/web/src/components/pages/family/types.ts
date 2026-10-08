import type { components } from "@tidefern/api-client";

/**
 * The API's shapes the family screens read, from the generated contract
 * (openapi/v1.json through packages/api-client), so a page never restates a
 * field the API does not send.
 */
export type Child = components["schemas"]["Child"];
export type ChildEvent = components["schemas"]["ChildEvent"];
export type ChildEventTombstone = components["schemas"]["ChildEventTombstone"];
export type ChildMeasurement = components["schemas"]["ChildMeasurement"];
export type MilestoneChecklist = components["schemas"]["MilestoneChecklist"];
export type MilestoneCheck = components["schemas"]["MilestoneCheck"];
export type SharingPerson = components["schemas"]["SharingPerson"];
export type FeedMethod = NonNullable<ChildEvent["feedMethod"]>;
export type FeedSide = NonNullable<ChildEvent["side"]>;
export type DiaperContents = NonNullable<ChildEvent["diaperContents"]>;

/** The profile's unit choice; storage is always SI (architecture 13.10). */
export type UnitSystem = "metric" | "imperial";

/**
 * A live event, as opposed to the tombstone a sync read can carry. It takes
 * any list item, because the typed client's answer types the live variant
 * without its always-null `deletedAt`.
 */
export function isLiveEvent(item: object): item is ChildEvent {
  return "kind" in item && (item as { deletedAt?: unknown }).deletedAt == null;
}
