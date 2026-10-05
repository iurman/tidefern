/**
 * List filters and response projection for the policy in ./policy.ts.
 *
 * can() decides one resource at a time. A list endpoint cannot ask it per
 * row before the query runs, so listScope() enumerates every subject the
 * actor could reach and asks can() about each candidate, and the data layer
 * applies the result as its WHERE clause. projectRow() then keeps only the
 * columns the storage map (architecture 8.2) files under the categories the
 * actor was granted, so a row a policy allows never carries a field from a
 * category the actor was not granted. Nothing here decides access on its
 * own: every scope exists because can() said yes to it.
 */
import { can, type Action, type Actor, type Category, type Decision, type Level } from "./policy";

export type ScopeReason = Exclude<Decision["reason"], "denied">;

/** What a reader holds: why, and which categories. Enough for projection. */
export interface Access {
  reason: ScopeReason;
  categories: readonly Category[];
}

/** One subject a list endpoint may include, with the level held there. */
export interface Scope extends Access {
  /**
   * The id can() compares against resource.subjectId: the actor herself, the
   * owner who made a grant, or for a guardianship the child, which 8.3 names
   * as the subject of a child record. Child tables filter by childId.
   */
  subjectId: string;
  level: Level;
  /** Set on child scopes: the one child this scope reaches. */
  childId?: string;
}

/** Everything the actor holds on a single subject, merged across grants. */
export interface SubjectAccess extends Access {
  /**
   * The level per category. There is no single level because one partner can
   * hold summary on cycle.status and read on pregnancy.overview at once; a
   * serializer looks up the category it is rendering.
   */
  levels: Readonly<Partial<Record<Category, Level>>>;
}

/**
 * A Record keyed by Category so the compiler rejects a missing member when a
 * category is added to the policy; the array is what callers iterate.
 */
const CATEGORY_SET: Record<Category, true> = {
  "cycle.status": true,
  "cycle.history": true,
  "cycle.symptoms": true,
  "journal.private": true,
  "pregnancy.overview": true,
  "pregnancy.photos": true,
  child: true,
};

export const CATEGORIES: readonly Category[] = Object.keys(CATEGORY_SET) as Category[];

/** Owner and guardian hold every level; the strongest named one stands in. */
const FULL: Level = "contribute";

function ownerScope(actor: Actor): Scope {
  return { reason: "owner", subjectId: actor.id, categories: CATEGORIES, level: FULL };
}

function guardianScope(childId: string): Scope {
  return { reason: "guardian", subjectId: childId, categories: ["child"], level: FULL, childId };
}

/**
 * The subjects and categories a list endpoint may return for this action.
 * The actor's own records come first with every category, the private
 * journal included; then one scope per guarded child; then one scope per
 * active grant that can() accepts for the action, so a summary grant is
 * absent from a read list and no grant ever reaches journal.private. A grant
 * can() answers with "owner" or "guardian" is already covered by the scope
 * above it and is not repeated.
 */
export function listScope(actor: Actor, action: Action): Scope[] {
  const scopes: Scope[] = [ownerScope(actor)];
  for (const childId of actor.guardianOf) scopes.push(guardianScope(childId));
  for (const grant of actor.grants) {
    if (grant.revokedAt !== null) continue;
    const resource =
      grant.childId === undefined
        ? { subjectId: grant.ownerId, category: grant.category }
        : { subjectId: grant.ownerId, category: grant.category, childId: grant.childId };
    const decision = can(actor, action, resource);
    if (!decision.allowed || decision.reason !== "grant") continue;
    const scope: Scope = {
      reason: "grant",
      subjectId: grant.ownerId,
      categories: [grant.category],
      level: grant.level,
    };
    if (grant.childId !== undefined) scope.childId = grant.childId;
    scopes.push(scope);
  }
  return scopes;
}

/**
 * The categories and levels the actor holds on one subject, or null when
 * can() would deny every category, which the request flow answers with 404.
 * Pass childId for a child record; then only guardianship and child grants
 * for that child count, exactly as can() matches them.
 */
export function categoriesFor(
  actor: Actor,
  subjectId: string,
  childId?: string,
): SubjectAccess | null {
  if (subjectId === actor.id) {
    const levels: Partial<Record<Category, Level>> = {};
    for (const category of CATEGORIES) levels[category] = FULL;
    return { reason: "owner", categories: CATEGORIES, levels };
  }
  if (childId !== undefined && actor.guardianOf.includes(childId)) {
    return { reason: "guardian", categories: ["child"], levels: { child: FULL } };
  }
  const levels: Partial<Record<Category, Level>> = {};
  const categories: Category[] = [];
  for (const grant of actor.grants) {
    if (grant.revokedAt !== null || grant.ownerId !== subjectId) continue;
    if ((grant.category === "child") !== (childId !== undefined)) continue;
    const resource =
      childId === undefined
        ? { subjectId, category: grant.category }
        : { subjectId, category: grant.category, childId };
    const decision = can(actor, "summary", resource);
    if (!decision.allowed || decision.reason !== "grant") continue;
    if (grant.category === "child" && grant.childId !== childId) continue;
    if (levels[grant.category] !== undefined) continue;
    levels[grant.category] = grant.level;
    categories.push(grant.category);
  }
  if (categories.length === 0) return null;
  return { reason: "grant", categories, levels };
}

/**
 * Where a column files. "key" is an identifier every allowed reader keeps so
 * rows stay addressable; "owner" never leaves the owner's own responses.
 */
export type ColumnCategory = Category | "key" | "owner";

export type TableRule =
  /** Each column has its own category; a column not listed is dropped for a grantee. */
  | { by: "column"; columns: Readonly<Record<string, ColumnCategory>> }
  /** Every column belongs to one category, except the overrides in columns. */
  | { by: "row"; category: Category | "owner"; columns?: Readonly<Record<string, ColumnCategory>> }
  /** The row's own category column names it, and only the listed values are valid there. */
  | { by: "row-category"; categories: readonly Category[] };

/**
 * The storage map of architecture 8.2 as data. Policies work per row, so no
 * row spans categories except cycle_entries, whose date and flow are history
 * while mood is a symptom; the day sheet's note is never a column there.
 * cycle.status is derived on read and has no table.
 */
export const STORAGE_MAP = {
  cycle_entries: {
    by: "column",
    columns: {
      id: "key",
      subject_id: "key",
      date: "cycle.history",
      flow: "cycle.history",
      mood: "cycle.symptoms",
    },
  },
  entry_symptoms: { by: "row", category: "cycle.symptoms" },
  cycle_predictions: { by: "row", category: "cycle.history" },
  notes: {
    by: "row-category",
    categories: ["journal.private", "cycle.symptoms", "pregnancy.overview"],
  },
  pregnancies: {
    by: "row",
    category: "pregnancy.overview",
    columns: { ended_reason: "owner", due_date_changes: "owner" },
  },
  pregnancy_events: { by: "row", category: "pregnancy.overview" },
  due_date_changes: { by: "row", category: "owner" },
  /** A photo's category follows its subject: pregnancy.photos for her, child for a child. */
  photos: { by: "row-category", categories: ["pregnancy.photos", "child"] },
  children: { by: "row", category: "child" },
  child_events: { by: "row", category: "child" },
  child_measurements: { by: "row", category: "child" },
} as const satisfies Record<string, TableRule>;

export type Table = keyof typeof STORAGE_MAP;

function columnCategory(
  rule: TableRule,
  row: Readonly<Record<string, unknown>>,
  column: string,
): ColumnCategory | null {
  switch (rule.by) {
    case "column":
      return rule.columns[column] ?? null;
    case "row":
      return rule.columns?.[column] ?? rule.category;
    case "row-category": {
      const own = row["category"];
      return typeof own === "string" && (rule.categories as readonly string[]).includes(own)
        ? (own as Category)
        : null;
    }
  }
}

/**
 * The columns of one row that the access allows. The owner keeps the row
 * whole. Anyone else keeps the columns filed under a granted category, plus
 * the key columns when at least one such column survived; ended_reason,
 * due_date_changes and anything the map does not name are dropped for every
 * grantee and guardian. Filtering rows by subject and child is the data
 * layer's job with listScope(); this only projects columns.
 */
export function projectRow<Row extends Readonly<Record<string, unknown>>>(
  table: Table,
  row: Row,
  access: Access,
): Partial<Row> {
  if (access.reason === "owner") return { ...row };
  const rule: TableRule = STORAGE_MAP[table];
  const projected: Partial<Row> = {};
  const keys: (keyof Row)[] = [];
  let granted = false;
  for (const column of Object.keys(row) as (keyof Row & string)[]) {
    const category = columnCategory(rule, row, column);
    if (category === "key") {
      keys.push(column);
    } else if (category !== null && category !== "owner" && access.categories.includes(category)) {
      projected[column] = row[column];
      granted = true;
    }
  }
  if (!granted) return {};
  for (const key of keys) projected[key] = row[key];
  return projected;
}
