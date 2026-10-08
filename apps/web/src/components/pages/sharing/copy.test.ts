import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SHARING_DESCRIPTION_VERSION,
  SHARING_DESCRIPTIONS,
  fillSharingWords,
  sharingDescriptionVersions,
} from "@tidefern/schemas";
import { privateNotesSentence } from "@/components/ui/grant-row";
import { grantPhrase, inviteRoles, joinNames, relationText, sharingCopy } from "./copy";

const repository = resolve(__dirname, "../../../../../..");
const read = (path: string) => readFileSync(resolve(repository, path), "utf8");
const content = read("docs/design/CONTENT.md");
/** CONTENT.md with every run of whitespace as one space, so a sentence wrapped across lines still matches. */
const flat = content.replace(/\s+/g, " ");
const design = read("docs/design/DESIGN.md");
/** DESIGN.md 3.7, the /sharing sketches. */
const sketch = design.slice(design.indexOf("### 3.7 "), design.indexOf("### 3.8 "));
const specimens = read("apps/web/src/components/ui/specimens/structure.tsx");
const devices = read("apps/web/src/app/(app)/settings/devices/copy.ts");

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

  it("version the notify switch's words and a child's own row too, as CONTENT.md writes them", () => {
    const shown = SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION];
    expect(flat).toContain(
      `The notify switch reads "${shown.notify.label}" with the sentence "${shown.notify.description}"`,
    );
    expect(flat).toContain(`A child's row reads "${shown.childRow}"`);
    // The "A child" row with the name in place of "that child", less the switch count.
    expect(shown.categories.child.description).toBe(
      `${shown.childRow.replace("[child]", "that child")} One switch per child.`,
    );
    expect(fillSharingWords(shown.childRow, "Sol")).toBe(
      "Everything logged for Sol: feeds, sleep, growth, milestones and photos.",
    );
    expect(fillSharingWords(shown.notify.label, "Theo")).toBe("Tell Theo when my period starts");
  });

  it("put a typed name in as it is, even one holding a replacement pattern", () => {
    const shown = SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION];
    expect(fillSharingWords(shown.notify.label, "Jo$'s")).toBe("Tell Jo$'s when my period starts");
    expect(fillSharingWords(shown.childRow, "A$&")).toBe(
      "Everything logged for A$&: feeds, sleep, growth, milestones and photos.",
    );
    expect(fillSharingWords(shown.childRow, "B$`$$")).toBe(
      "Everything logged for B$`$$: feeds, sleep, growth, milestones and photos.",
    );
  });

  it("show the last version of the catalog", () => {
    expect(CURRENT_SHARING_DESCRIPTION_VERSION).toBe(sharingDescriptionVersions.at(-1));
  });
});

/** Every string or sentence function in the copy, by its path ("grant.title"). */
function leaves(value: unknown, path: readonly string[] = []): [string, unknown][] {
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key]));
  }
  return [[path.join("."), value]];
}

/** The arguments each sentence is checked with: CONTENT.md's own examples. */
const samples: Readonly<Record<string, readonly (readonly (string | null)[])[]>> = {
  "received.heading": [["Alex"]],
  "received.note": [["Alex"]],
  "grant.title": [["your cycle status", "Alex"]],
  "grant.confirm": [["Alex"]],
  "grant.on": [["Alex", "your cycle status"]],
  "grant.off": [["Alex", "your cycle status"]],
  "notify.needsCycle": [["Alex"]],
  "notify.unsent": [["Alex"]],
  "notify.on": [["Alex"]],
  "notify.off": [["Alex"]],
  "remove.member": [["Alex"]],
  "remove.owner": [["Alex"]],
  "remove.grants": [["Alex"]],
  "remove.removed": [["Alex"]],
  "remove.left": [["Alex"]],
  "remove.coGuardianOne": [["Alex", "Ilo"]],
  "remove.coGuardianSeveral": [["Alex", "Ilo and Sol"]],
  "remove.failed": [["Alex"]],
  "invite.sent": [["jo@example.com"]],
  "invite.ownerOnly": [["Alex"], [null]],
  "withdraw.done": [["jo@example.com"]],
  "accept.joined": [["Alex"], [null]],
};

/** The strings a comment in copy.ts sources outside CONTENT.md, with the text that holds each. */
const sourcedElsewhere: Readonly<Record<string, string>> = {
  people: sketch,
  invitations: sketch,
  privateNotes: sketch,
  "remove.failed": specimens,
  "failure.save": specimens,
  "invite.failed": specimens,
  "failure.server": devices,
  "failure.offline": devices,
  "freshAuth.action": devices,
};

describe("the /sharing strings and where they are written down", () => {
  it("holds every string in CONTENT.md, or in the one source its comment names", () => {
    for (const [path, value] of leaves(sharingCopy)) {
      let texts: string[];
      if (typeof value === "function") {
        const args = samples[path];
        expect(args, `sample arguments for ${path}`).toBeDefined();
        texts = (args ?? []).map((list) =>
          String((value as (...values: (string | null)[]) => string)(...list)),
        );
      } else {
        texts = [String(value)];
      }
      const source = sourcedElsewhere[path];
      for (const text of texts) {
        const where = source ?? flat;
        expect(where.includes(text), `${path}: "${text}"`).toBe(true);
      }
    }
  });

  it("lists who a person is and the roles an invitation offers in CONTENT.md", () => {
    for (const role of ["owner", "partner", "guardian"] as const) {
      expect(flat).toContain(`"${relationText(role, [])}"`);
    }
    expect(flat).toContain(`"${relationText(null, [])}"`);
    expect(flat).toContain(`"${relationText("partner", ["Ilo", "Sol"]).replace("partner, ", "")}"`);
    expect(flat).toContain(`(${inviteRoles.map((role) => role.label).join(", ")})`);
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

  it("says what is pending and what succeeded in CONTENT.md's own examples", () => {
    expect(content).toContain(`"${sharingCopy.invite.pending}"`);
    expect(sharingCopy.grant.on("Alex", grantPhrase("cycle.status"))).toBe(
      "Alex can now see your cycle status.",
    );
    expect(content).toContain(`"${sharingCopy.grant.on("Alex", grantPhrase("cycle.status"))}"`);
  });

  it("never says an invitation expired when the API cannot tell why it closed", () => {
    // Changed on purpose (review of PR #83): the page used CONTENT.md's failure example "The
    // invitation has expired. Send a new one." for every withdrawal 404, which also comes for an
    // invitation accepted or withdrawn elsewhere. CONTENT.md keeps the example in its voice
    // table; the page's sentence is an [OWNER] draft the gate below holds to CONTENT.md.
    expect(content).toContain('"The invitation has expired. Send a new one."');
    expect(JSON.stringify(sharingCopy)).not.toContain("expired. Send a new one.");
    expect(sharingCopy.withdraw.closed).not.toMatch(/expired|accepted|withdrawn/);
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
