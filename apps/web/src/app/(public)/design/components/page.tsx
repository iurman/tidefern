import Link from "next/link";
import { ComponentsIndexList } from "@/components/ui/specimens/index-list";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components",
  "Components",
  "Every shared component in its eight states and both themes, grouped by what it does, rendered from the real code.",
  false,
);

export default function ComponentsIndex() {
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
      </header>
      <ComponentsIndexList />
      <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
        <Link href="/design/type" prefetch={false}>
          Previous: Type and space
        </Link>
        <Link href="/design/motion" prefetch={false}>
          Next: Motion
        </Link>
      </nav>
    </div>
  );
}
