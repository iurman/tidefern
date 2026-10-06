"use client";
import Link from "next/link";
import { specimens as actions } from "./actions";
import { specimens as calendar } from "./calendar";
import { specimens as forms } from "./forms";
import { specimens as marks } from "./marks";
import { specimens as patterns } from "./patterns";
import { specimens as structure } from "./structure";

/**
 * The card list on /design/components. A client module, because two of the
 * groups (structure, patterns) are client modules whose group objects are
 * references on the server; here all six are plain objects.
 */
export const groups = [actions, forms, structure, calendar, marks, patterns];

export function ComponentsIndexList() {
  const total = groups.reduce((count, group) => count + group.specimens.length, 0);
  return (
    <>
      <p className="caption">
        <span className="tabular">{groups.length}</span> groups,{" "}
        <span className="tabular">{total}</span> specimens, rendered from the real code.
      </p>
      <ol className="chapter-grid">
        {groups.map((group) => (
          <li key={group.slug}>
            <p className="eyebrow">
              <span className="tabular">{group.specimens.length}</span> specimens
            </p>
            <h2>
              <Link href={`/design/components/${group.slug}`} prefetch={false}>
                {group.title}
              </Link>
            </h2>
            <p>{group.lede}</p>
            <ul className="chapter-index">
              {group.specimens.map((specimen) => (
                <li key={specimen.name}>{specimen.name}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
