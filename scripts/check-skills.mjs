// Validates project skills against the Agent Skills specification and checks
// that every canonical skill in .agents/skills has a resolving symlink in
// .claude/skills. Spec: https://agentskills.io/specification
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canonical = join(root, ".agents", "skills");
const linked = join(root, ".claude", "skills");
const SPEC_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const problems = [];

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  let current = null;
  for (const line of match[1].split("\n")) {
    const top = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (top) {
      current = top[1];
      fields[current] = top[2];
    } else if (current && /^\s+\S/.test(line)) {
      fields[current] += `\n${line.trim()}`;
    }
  }
  return fields;
}

for (const name of readdirSync(canonical)) {
  const dir = join(canonical, name);
  if (!statSync(dir).isDirectory()) continue;
  const skillPath = join(dir, "SKILL.md");
  let text;
  try {
    text = readFileSync(skillPath, "utf8");
  } catch {
    problems.push(`${name}: missing SKILL.md`);
    continue;
  }
  const fields = frontmatter(text);
  if (!fields) {
    problems.push(`${name}: SKILL.md has no frontmatter`);
    continue;
  }
  if (fields.name !== name)
    problems.push(`${name}: frontmatter name "${fields.name}" must match the directory`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    problems.push(
      `${name}: directory name must be 1 to 64 lowercase letters, digits and single hyphens`,
    );
  }
  const description = (fields.description ?? "").replace(/^>-?\n?/, "").trim();
  if (!description || description.length > 1024) {
    problems.push(`${name}: description must be 1 to 1024 characters`);
  }
  for (const field of Object.keys(fields)) {
    if (!SPEC_FIELDS.has(field)) problems.push(`${name}: non-spec frontmatter field "${field}"`);
  }
  if (text.split("\n").length > 500)
    problems.push(`${name}: SKILL.md is over 500 lines; move detail to references/`);
  const linkPath = join(linked, name);
  try {
    if (!lstatSync(linkPath).isSymbolicLink())
      problems.push(`${name}: .claude/skills/${name} is not a symlink`);
    if (realpathSync(linkPath) !== realpathSync(dir))
      problems.push(`${name}: .claude/skills/${name} does not resolve to .agents/skills/${name}`);
  } catch {
    problems.push(`${name}: missing .claude/skills/${name} symlink`);
  }
}

for (const name of readdirSync(linked)) {
  if (!readdirSync(canonical).includes(name))
    problems.push(`.claude/skills/${name} has no canonical skill in .agents/skills`);
}

if (problems.length > 0) {
  console.error("skills:check failed");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`skills:check passed (${readdirSync(canonical).length} skills)`);
