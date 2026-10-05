/**
 * Converts the vendored growth chart CSV files under packages/core/data into
 * one compact JSON file the growth engine imports. The CSV files stay exactly
 * as downloaded (SOURCES.md records where and when); only this script reads
 * them, so the engine never parses text at runtime and every client ships the
 * same numbers.
 *
 * Each table becomes an array of [axis, L, M, S] rows in source order. The
 * axis is the age in months as the source lists it (WHO: whole months at the
 * exact month point; CDC: the half-month convention, birth excepted) or the
 * length or stature in centimetres for the weight-for-length tables. The
 * percentile columns are dropped because the engine derives any percentile
 * from L, M and S with the published formulas.
 *
 * `node scripts/growth-data.mjs` writes src/growth-data.json;
 * `node scripts/growth-data.mjs --check` fails when the committed file differs
 * from what the vendored CSV files produce, which keeps the two in step.
 */
import { readFile, writeFile } from "node:fs/promises";

const dataDirectory = new URL("../data/", import.meta.url);
const destination = new URL("../src/growth-data.json", import.meta.url);

/** WHO files are one per sex and indicator; the first column is the axis. */
const whoFiles = {
  male: {
    weightForAge: "who/WHO-Boys-Weight-for-age-Percentiles.csv",
    lengthForAge: "who/WHO-Boys-Length-for-age-Percentiles.csv",
    weightForLength: "who/WHO-Boys-Weight-for-length-Percentiles.csv",
    headCircumferenceForAge: "who/WHO-Boys-Head-Circumference-for-age-Percentiles.csv",
  },
  female: {
    weightForAge: "who/WHO-Girls-Weight-for-age-Percentiles.csv",
    lengthForAge: "who/WHO-Girls-Length-for-age-Percentiles.csv",
    weightForLength: "who/WHO-Girls-Weight-for-length-Percentiles.csv",
    headCircumferenceForAge: "who/WHO-Girls-Head-Circumference-for-age-Percentiles.csv",
  },
};

/** CDC files hold both sexes (1 = male, 2 = female) and are named after the chart. */
const cdcFiles = {
  weightForAgeInfant: "cdc/wtageinf.csv",
  lengthForAgeInfant: "cdc/lenageinf.csv",
  headCircumferenceForAgeInfant: "cdc/hcageinf.csv",
  weightForLengthInfant: "cdc/wtleninf.csv",
  weightForAge: "cdc/wtage.csv",
  statureForAge: "cdc/statage.csv",
  weightForStature: "cdc/wtstat.csv",
  bmiForAge: "cdc/bmiagerev.csv",
};

/**
 * Splits a CSV with no quoted fields into trimmed cells, dropping the BOM and
 * blank lines. Two CDC files (lenageinf, bmiagerev) repeat the header line
 * where the girls' rows begin, so a line equal to the header is skipped.
 */
async function readRows(relativePath) {
  const text = await readFile(new URL(relativePath, dataDirectory), "utf8");
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const [header, ...rest] = lines;
  const body = rest.filter((line) => line !== header);
  const columns = header.split(",").map((cell) => cell.trim());
  return body.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== columns.length) {
      throw new Error(`${relativePath}: expected ${columns.length} cells, found ${cells.length}`);
    }
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
}

/** Parses a numeric cell strictly: the source files carry no blanks or units. */
function number(relativePath, cell) {
  if (!/^-?\d+(\.\d+)?$/.test(cell)) throw new Error(`${relativePath}: bad number "${cell}"`);
  return Number(cell);
}

function assertAscending(relativePath, rows) {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index][0] <= rows[index - 1][0]) {
      throw new Error(`${relativePath}: axis is not strictly ascending at row ${index}`);
    }
  }
  return rows;
}

async function whoTable(relativePath) {
  const rows = await readRows(relativePath);
  const [axis] = Object.keys(rows[0]);
  return assertAscending(
    relativePath,
    rows.map((row) => [
      number(relativePath, row[axis]),
      number(relativePath, row.L),
      number(relativePath, row.M),
      number(relativePath, row.S),
    ]),
  );
}

async function cdcTables(relativePath) {
  const rows = await readRows(relativePath);
  const [, axis] = Object.keys(rows[0]);
  const bySex = { male: [], female: [] };
  for (const row of rows) {
    const sex = row.Sex === "1" ? "male" : row.Sex === "2" ? "female" : null;
    if (!sex) throw new Error(`${relativePath}: unknown sex code "${row.Sex}"`);
    bySex[sex].push([
      number(relativePath, row[axis]),
      number(relativePath, row.L),
      number(relativePath, row.M),
      number(relativePath, row.S),
    ]);
  }
  assertAscending(relativePath, bySex.male);
  assertAscending(relativePath, bySex.female);
  return bySex;
}

async function build() {
  const who = { male: {}, female: {} };
  for (const sex of ["male", "female"]) {
    for (const [indicator, file] of Object.entries(whoFiles[sex])) {
      who[sex][indicator] = await whoTable(file);
    }
  }
  const cdc = { male: {}, female: {} };
  for (const [table, file] of Object.entries(cdcFiles)) {
    const bySex = await cdcTables(file);
    cdc.male[table] = bySex.male;
    cdc.female[table] = bySex.female;
  }
  return { who, cdc };
}

/**
 * Prints the data the way Prettier prints JSON (two space indent, one row per
 * line, numbers verbatim) so `pnpm format:check` and `growth:check` agree on
 * the same bytes without the generator depending on Prettier.
 */
function print(data) {
  const lines = ["{"];
  const references = Object.entries(data);
  references.forEach(([reference, sexes], referenceIndex) => {
    lines.push(`  "${reference}": {`);
    const sexEntries = Object.entries(sexes);
    sexEntries.forEach(([sex, tables], sexIndex) => {
      lines.push(`    "${sex}": {`);
      const tableEntries = Object.entries(tables);
      tableEntries.forEach(([table, rows], tableIndex) => {
        lines.push(`      "${table}": [`);
        rows.forEach((row, rowIndex) => {
          const comma = rowIndex < rows.length - 1 ? "," : "";
          lines.push(`        [${row.join(", ")}]${comma}`);
        });
        lines.push(`      ]${tableIndex < tableEntries.length - 1 ? "," : ""}`);
      });
      lines.push(`    }${sexIndex < sexEntries.length - 1 ? "," : ""}`);
    });
    lines.push(`  }${referenceIndex < references.length - 1 ? "," : ""}`);
  });
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

const json = print(await build());

if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== json) {
    console.error(
      "Growth data is out of sync with the vendored CSV files. Run pnpm growth:generate and commit the result.",
    );
    process.exit(1);
  }
  console.log("growth:check passed");
} else {
  await writeFile(destination, json);
  console.log(`wrote ${destination.pathname}`);
}
