import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EM_DASH = String.fromCharCode(0x2014);
const textExtensions = /\.(md|mdx|txt|ts|tsx|js|mjs|cjs|json|yml|yaml|css|html|svg|toml|sh)$/i;
const excluded = [
  /^\.agents\/skills\//,
  /^\.agents\/vendor\//,
  /^\.claude\/skills\//,
  /^assets\//,
  /^pnpm-lock\.yaml$/,
  /^apps\/web\/public\/fonts\//,
];

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((file) => file && textExtensions.test(file) && !excluded.some((rule) => rule.test(file)));

const offenders = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!content.includes(EM_DASH)) continue;
  content.split("\n").forEach((line, index) => {
    if (line.includes(EM_DASH)) offenders.push(`${file}:${index + 1}`);
  });
}

if (offenders.length > 0) {
  console.error(
    "Em dash found. Tidefern prose, code comments, metadata and copy never use U+2014.",
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}
console.log(`prose:check passed across ${files.length} files`);
