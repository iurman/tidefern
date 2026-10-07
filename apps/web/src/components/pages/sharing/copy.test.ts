import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SHARING_DESCRIPTION_VERSION,
  SHARING_DESCRIPTIONS,
  sharingDescriptionVersions,
} from "@tidefern/schemas";
import { privateNotesSentence } from "@/components/ui/grant-row";
import { grantPhrase, joinNames, relationText, sharingCopy } from "./copy";

const repository = resolve(__dirname, "../../../../../..");
const content = readFileSync(resolve(repository, "docs/design/CONTENT.md"), "utf8");

/** The rows of the table under a CONTENT.md heading, as arrays of trimmed cells. */
function tableUnder(heading: string): string[][] {
  const start = content.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (const line of content.slice(start).split("\n").slice(1)) {
    if (line.startsWith("#")) break;
    if (!line.startsWith("|") || /^\|\s*-/.test(line)) continue;
    // A cell may hold an escaped pipe ("Sharing \| Tidefern"); only bare pipes divide cells.
    rows.push(
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replaceAll("\\|", "|")),
    );
  }
  return rows.slice(1);
}

describe("the sharing descriptions", () => {
  it("are CONTENT.md's plain words, word for word, under the version the screen shows", () => {
    const table = new Map(
      tableUnder("## Sharing descriptions").map(([label, words]) => [label, words]),
    );
    const shown = SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION];
    for (const { label, description } of Object.values(shown.categories)) {
      expect(table.get(label), label).toBe(description);
    }
    expect(table.get(shown.privateNotes.label)).toBe(shown.privateNotes.description);
    expect(table.size).toBe(Object.keys(shown.categories).length + 1);
  });

  it("show the last version of the catalog", () => {
    expect(CURRENT_SHARING_DESCRIPTION_VERSION).toBe(sharingDescriptionVersions.at(-1));
  });
});

describe("the /sharing copy", () => {
  it("uses CONTENT.md's title, empty state and notify sentence", () => {
    const route = tableUnder("## Routes").find(([path]) => path === "`/sharing`");
    expect(route?.[6]).toBe(`"${sharingCopy.title} | Tidefern"`);
    const empty = tableUnder("## Empty states").find(([surface]) => surface === "`/sharing`");
    expect(empty?.slice(1)).toEqual([
      sharingCopy.empty.heading,
      sharingCopy.empty.why,
      sharingCopy.empty.action,
    ]);
    expect(content).toContain(
      'The notify switch reads "Tell [name] when my period starts" with the\nsentence "The message says only that there is something new in Tidefern."',
    );
  });

  it("says what is pending and what failed in CONTENT.md's own examples", () => {
    expect(content).toContain(`"${sharingCopy.invite.pending}"`);
    expect(content).toContain(`"${sharingCopy.withdraw.expired}"`);
    expect(sharingCopy.grant.on("Alex", grantPhrase("cycle.status"))).toBe(
      "Alex can now see your cycle status.",
    );
    expect(content).toContain(`"${sharingCopy.grant.on("Alex", grantPhrase("cycle.status"))}"`);
  });

  it("closes the page with the same private-notes line the cards carry", () => {
    expect(sharingCopy.privateNotes).toBe(privateNotesSentence);
  });

  it("keeps health words out of the title and the description", () => {
    for (const text of [sharingCopy.title, sharingCopy.description]) {
      expect(text).not.toMatch(/period|cycle|pregnan|symptom|fertil|child/i);
    }
  });

  it("never writes an em dash", () => {
    const walk = (value: unknown): string[] => {
      if (typeof value === "string") return [value];
      if (typeof value === "function") return [String(value("Alex", "Ilo and Sol"))];
      if (typeof value === "object" && value !== null) return Object.values(value).flatMap(walk);
      return [];
    };
    for (const text of walk(sharingCopy)) {
      expect(text).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe("joinNames", () => {
  it("joins names the way CONTENT.md writes lists, with no serial comma", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Ilo"])).toBe("Ilo");
    expect(joinNames(["Ilo", "Sol"])).toBe("Ilo and Sol");
    expect(joinNames(["Ilo", "Sol", "Nora"])).toBe("Ilo, Sol and Nora");
  });
});

describe("relationText", () => {
  it("names the household role, a person outside the household, and the children both guard", () => {
    expect(relationText("partner", [])).toBe("partner");
    expect(relationText("owner", [])).toBe("household owner");
    expect(relationText("guardian", [])).toBe("household guardian");
    expect(relationText(null, [])).toBe("outside your household");
    expect(relationText("partner", ["Ilo", "Sol"])).toBe("partner, co-guardian of Ilo and Sol");
  });
});

describe("grantPhrase", () => {
  it("says what a grant reveals as the object of a sentence, naming a child", () => {
    expect(grantPhrase("cycle.symptoms")).toBe("your symptoms");
    expect(grantPhrase("pregnancy.overview")).toBe("your pregnancy overview");
    expect(grantPhrase("child", "Sol")).toBe("everything logged for Sol");
  });
});
