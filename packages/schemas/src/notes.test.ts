import { describe, expect, it } from "vitest";

import { NoteCategory } from "./index";
import {
  Note,
  NoteCreateInput,
  NoteList,
  NoteListQuery,
  NoteShareCategory,
  NoteShareInput,
  NoteUpdateInput,
  noteCategoryValues,
} from "./notes";

const ID = "018f5e7a-1c2b-7d3e-9a4f-5b6c7d8e9f10";
const INSTANT = "2026-10-05T12:00:00.000Z";

describe("note categories", () => {
  it("are the index's NoteCategory, and the shareable two are the non-private ones", () => {
    expect([...noteCategoryValues]).toEqual(NoteCategory.options);
    expect(NoteShareCategory.options).toEqual(
      NoteCategory.options.filter((category) => category !== "journal.private"),
    );
    expect(NoteShareCategory.safeParse("journal.private").success).toBe(false);
  });
});

describe("NoteCreateInput", () => {
  it("defaults the category to the private journal and the subject to nobody", () => {
    const parsed = NoteCreateInput.parse({ date: "2026-10-05", body: "tired today" });
    expect(parsed).toEqual({
      date: "2026-10-05",
      category: "journal.private",
      body: "tired today",
    });
  });

  it("refuses an empty body, a long body, a bad id and a date that is not a day", () => {
    expect(NoteCreateInput.safeParse({ date: "2026-10-05", body: "" }).success).toBe(false);
    expect(NoteCreateInput.safeParse({ date: "2026-10-05", body: "x".repeat(4001) }).success).toBe(
      false,
    );
    expect(NoteCreateInput.safeParse({ id: "1", date: "2026-10-05", body: "ok" }).success).toBe(
      false,
    );
    expect(NoteCreateInput.safeParse({ date: "2026-02-30", body: "ok" }).success).toBe(false);
    expect(NoteCreateInput.safeParse({ date: "2026-13-01", body: "ok" }).success).toBe(false);
    expect(NoteCreateInput.safeParse({ date: "05-10-2026", body: "ok" }).success).toBe(false);
    const leap = NoteCreateInput.safeParse({ date: "2028-02-29", body: "ok" });
    expect(leap.success).toBe(true);
  });

  it("accepts a subject id and a category for a note about someone else", () => {
    const parsed = NoteCreateInput.parse({
      id: ID,
      subject: ID,
      date: "2026-10-05",
      category: "cycle.symptoms",
      body: "she said the cramps eased",
    });
    expect(parsed.subject).toBe(ID);
    expect(parsed.category).toBe("cycle.symptoms");
  });
});

describe("NoteUpdateInput", () => {
  it("needs a date or a body and never takes a category", () => {
    expect(NoteUpdateInput.safeParse({}).success).toBe(false);
    expect(NoteUpdateInput.safeParse({ body: "better" }).success).toBe(true);
    expect(NoteUpdateInput.safeParse({ date: "2026-10-06" }).success).toBe(true);
    const withCategory = NoteUpdateInput.parse({ body: "b", category: "cycle.symptoms" });
    expect(withCategory).toEqual({ body: "b" });
  });
});

describe("NoteShareInput", () => {
  it("takes only a shareable category", () => {
    expect(NoteShareInput.parse({ category: "pregnancy.overview" })).toEqual({
      category: "pregnancy.overview",
    });
    expect(NoteShareInput.safeParse({ category: "journal.private" }).success).toBe(false);
    expect(NoteShareInput.safeParse({}).success).toBe(false);
  });
});

describe("NoteListQuery", () => {
  it("defaults the limit to 50 and bounds it to 1 to 200", () => {
    expect(NoteListQuery.parse({}).limit).toBe(50);
    expect(NoteListQuery.parse({ limit: "200" }).limit).toBe(200);
    expect(NoteListQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(NoteListQuery.safeParse({ limit: "201" }).success).toBe(false);
    expect(NoteListQuery.safeParse({ limit: "1.5" }).success).toBe(false);
  });

  it("takes dates and ids only: no category filter rides in the query string", () => {
    expect(Object.keys(NoteListQuery.parse({}))).not.toContain("category");
    const parsed = NoteListQuery.parse({
      subject: ID,
      from: "2026-10-01",
      to: "2026-10-31",
      updatedSince: INSTANT,
      cursor: "abc",
      category: "journal.private",
    });
    expect(parsed).not.toHaveProperty("category");
    expect(parsed.from).toBe("2026-10-01");
  });

  it("refuses a range that ends before it starts and an instant without milliseconds", () => {
    expect(NoteListQuery.safeParse({ from: "2026-10-31", to: "2026-10-01" }).success).toBe(false);
    expect(NoteListQuery.safeParse({ updatedSince: "2026-10-05T12:00:00Z" }).success).toBe(false);
  });
});

describe("Note and NoteList", () => {
  const note = {
    id: ID,
    subjectId: ID,
    authorId: null,
    category: "journal.private",
    date: "2026-10-05",
    body: "tired today",
    createdAt: INSTANT,
    updatedAt: INSTANT,
    version: 1,
  };

  it("carries an optional body so a summary grantee and a tombstone can leave it out", () => {
    expect(Note.parse(note)).toEqual(note);
    const withoutBody = Object.fromEntries(Object.entries(note).filter(([key]) => key !== "body"));
    expect(Note.parse(withoutBody)).toEqual(withoutBody);
    expect(Note.safeParse({ ...note, version: 0 }).success).toBe(false);
    expect(Note.parse({ ...withoutBody, deletedAt: INSTANT }).deletedAt).toBe(INSTANT);
  });

  it("is a page with items and a nullable cursor", () => {
    expect(NoteList.parse({ items: [note], nextCursor: null }).items).toHaveLength(1);
    expect(NoteList.safeParse({ items: [note] }).success).toBe(false);
  });
});
