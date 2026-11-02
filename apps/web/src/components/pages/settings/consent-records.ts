import type { components } from "@tidefern/api-client";
import { todayIn } from "@tidefern/core";
import { categoryLabels, categoryOrder, settingsCopy } from "./copy";

export type Consent = components["schemas"]["Consent"];

/**
 * The consent rows GET /v1/me/consents returns (task E2), read for the
 * read-only record in Settings. One onboarding writes one row per category
 * at one instant under one disclosure, so the rows a person agreed to
 * together form one record: they are grouped by the day she agreed (in her
 * profile's time zone, architecture 13.10), the text version, and, once
 * withdrawn, the day she withdrew. A later agreement to another category is
 * a record of its own with its own date.
 */
export interface OwnRecord {
  key: string;
  /** `YYYY-MM-DD` in the profile's time zone. */
  agreedOn: string;
  textVersion: string;
  /** Plain labels, in the vocabulary's order. */
  categories: string[];
  /** The product's own purpose sentences, in the same order, each once. */
  purposes: string[];
  /** `YYYY-MM-DD` she withdrew it, or null while it stands. */
  withdrawnOn: string | null;
}

/** A guardian's consent on a child's behalf: shown, never withdrawn here (the API refuses it). */
export interface ChildConsent {
  key: string;
  child: string;
  purpose: string;
  agreedOn: string;
  byYou: boolean;
}

export interface ConsentView {
  active: OwnRecord[];
  withdrawn: OwnRecord[];
  children: ChildConsent[];
  /**
   * The id the withdraw action posts: any of her own consents still
   * standing, because withdrawing one withdraws every one of them at once.
   * Null when nothing of hers is left to withdraw.
   */
  withdrawId: string | null;
}

/** The calendar day an instant falls on in the profile's time zone. */
export function dayIn(instant: string, timeZone: string): string {
  return todayIn(timeZone, new Date(instant));
}

function rank(category: Consent["category"]): number {
  return categoryOrder.indexOf(category);
}

export function consentView(
  items: readonly Consent[],
  selfId: string,
  timeZone: string,
  childNames: ReadonlyMap<string, string>,
): ConsentView {
  const groups = new Map<string, { record: OwnRecord; rows: Consent[] }>();
  const children: ChildConsent[] = [];
  let withdrawId: string | null = null;

  for (const item of items) {
    const agreedOn = dayIn(item.grantedAt, timeZone);
    if (item.consentingGuardianId !== null) {
      children.push({
        key: item.id,
        child: childNames.get(item.subjectId) ?? settingsCopy.consent.children.unnamed,
        purpose: item.purpose,
        agreedOn,
        byYou: item.consentingGuardianId === selfId,
      });
      continue;
    }
    if (item.subjectId !== selfId) continue;
    const withdrawnOn = item.withdrawnAt === null ? null : dayIn(item.withdrawnAt, timeZone);
    if (withdrawnOn === null) withdrawId ??= item.id;
    const key = `${agreedOn}|${item.textVersion}|${withdrawnOn ?? ""}`;
    const group = groups.get(key) ?? {
      record: {
        key,
        agreedOn,
        textVersion: item.textVersion,
        categories: [],
        purposes: [],
        withdrawnOn,
      },
      rows: [],
    };
    group.rows.push(item);
    groups.set(key, group);
  }

  const records = [...groups.values()]
    .map(({ record, rows }) => {
      const ordered = [...rows].sort((a, b) => rank(a.category) - rank(b.category));
      return {
        ...record,
        categories: [...new Set(ordered.map((row) => categoryLabels[row.category]))],
        purposes: [...new Set(ordered.map((row) => row.purpose))],
      };
    })
    .sort((a, b) => a.agreedOn.localeCompare(b.agreedOn) || a.key.localeCompare(b.key));

  children.sort((a, b) => a.agreedOn.localeCompare(b.agreedOn) || a.child.localeCompare(b.child));

  return {
    active: records.filter((record) => record.withdrawnOn === null),
    withdrawn: records.filter((record) => record.withdrawnOn !== null),
    children,
    withdrawId,
  };
}
