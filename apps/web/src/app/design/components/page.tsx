import Link from "next/link";
import { specimens as actions } from "@/components/ui/specimens/actions";
import { specimens as calendar } from "@/components/ui/specimens/calendar";
import { specimens as forms } from "@/components/ui/specimens/forms";
import { specimens as marks } from "@/components/ui/specimens/marks";
import { specimens as patterns } from "@/components/ui/specimens/patterns";
import { specimens as structure } from "@/components/ui/specimens/structure";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components",
  "Components",
  "Every shared component in its eight states and both themes, grouped by what it does, rendered from the real code.",
  false,
);

const groups = [actions, forms, structure, calendar, marks, patterns];

export default function ComponentsIndex() {
  const total = groups.reduce((count, group) => count + group.specimens.length, 0);
  return (
    <div className="design wrap">
      <nav className="chapter-nav" aria-label="Chapters">
        <Link href="/design" prefetch={false}>
          Design system
        </Link>
      </nav>
      <header className="design-title">
        <p className="eyebrow">Components</p>
        <h1>Real controls, every state, both themes.</h1>
        <p className="intro">
          Each page below renders the production components through one frame: eight states per
          component, light and dark, with the keyboard note and a copyable usage. Nothing here is a
          drawing of a component; it is the component.
        </p>
        <p className="caption">
          <span className="tabular">{groups.length}</span> groups,{" "}
          <span className="tabular">{total}</span> specimens.
        </p>
      </header>
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
      <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
        <Link href="/design/type" prefetch={false}>
          Previous: Type and space
        </Link>
        <Link href="/design/brand" prefetch={false}>
          Next: Brand
        </Link>
      </nav>
    </div>
  );
}
