import Link from "next/link";
import { ComponentsChapterNav } from "@/components/ui/specimen-frame";
import { PatternsSpecimens } from "@/components/ui/specimens/patterns";
import { pageMetadata } from "@/lib/site";

// The specimens module is a client module (the day sheet takes handlers), so
// its group object is a client reference on the server; the title and lede
// are written here as well.
const title = "Patterns";
const lede =
  "Compositions the product uses as one thing: the day sheet first, built from the sheet, the flow scale, the chips, the mood selector and the note field, so the pieces are never recombined ad hoc on a route.";

export const metadata = pageMetadata(
  "/design/components/patterns",
  title,
  "The compositions the product uses as one thing, starting with the day sheet, in every state and both themes.",
  false,
);

export default function PatternsPage() {
  return (
    <div className="design wrap">
      <nav className="chapter-nav" aria-label="Chapters">
        <Link href="/design" prefetch={false}>
          Design system
        </Link>
        <Link href="/design/components" prefetch={false}>
          Components
        </Link>
      </nav>
      <header className="design-title">
        <p className="eyebrow">{title}</p>
        <h1>Log a day in a few taps.</h1>
        <p className="intro">{lede}</p>
      </header>
      <PatternsSpecimens />
      <ComponentsChapterNav
        previous={{ href: "/design/components/calendar", label: "Calendar" }}
        next={{ href: "/design/components", label: "All components" }}
      />
    </div>
  );
}
