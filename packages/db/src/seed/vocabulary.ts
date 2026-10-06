import { FlowLevel, MoodCode, SymptomCode } from "@tidefern/schemas";

import type { Transaction } from "../actor";
import { vocabulary } from "../schema/cycle";

/**
 * The closed lists the `vocabulary` table mirrors, straight from the Zod
 * enums the API validates against, so the database and the contract can
 * never drift apart (architecture record 5.1). Position is the order the
 * pickers show.
 */
export const VOCABULARY_LISTS = {
  flow: FlowLevel.options,
  symptom: SymptomCode.options,
  mood: MoodCode.options,
} as const;

export type VocabularyKind = keyof typeof VOCABULARY_LISTS;

/** What a caller may fix instead of leaving it to the database defaults. */
export interface VocabularyOptions {
  /** The instant every inserted row records; the clock when omitted. */
  createdAt?: Date;
}

/** Every row the seed writes, in picker order. */
export function vocabularyRows(
  options: VocabularyOptions = {},
): (typeof vocabulary.$inferInsert)[] {
  const rows: (typeof vocabulary.$inferInsert)[] = [];
  for (const kind of Object.keys(VOCABULARY_LISTS) as VocabularyKind[]) {
    VOCABULARY_LISTS[kind].forEach((code, position) => {
      rows.push(
        options.createdAt
          ? { kind, code, position, createdAt: options.createdAt }
          : { kind, code, position },
      );
    });
  }
  return rows;
}

/**
 * Inserts the vocabulary rows that are missing and leaves existing ones
 * alone (`ON CONFLICT DO NOTHING` on the natural key), so running it on
 * every deploy is safe. Returns how many rows it added: all of them on an
 * empty database, zero on the second run. Adding a value to a Zod enum is
 * additive here too: the next run inserts only the new code. The full seed
 * passes its `now` as `createdAt` so the rows carry the seed's instant.
 */
export async function seedVocabulary(
  tx: Transaction,
  options: VocabularyOptions = {},
): Promise<number> {
  const inserted = await tx
    .insert(vocabulary)
    .values(vocabularyRows(options))
    .onConflictDoNothing()
    .returning({ code: vocabulary.code });
  return inserted.length;
}
