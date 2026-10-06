import Link from "next/link";
import { ComponentsChapterNav, SpecimenFrame } from "@/components/ui/specimen-frame";
import { specimens } from "@/components/ui/specimens/patterns";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components/patterns",
  "Patterns",
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
        <p className="eyebrow">{specimens.title}</p>
        <h1>Log a day in a few taps.</h1>
        <p className="intro">{specimens.lede}</p>
      </header>
      <SpecimenFrame group={specimens} />
      <ComponentsChapterNav
        previous={{ href: "/design/components/calendar", label: "Calendar" }}
        next={{ href: "/design/components", label: "All components" }}
      />
    </div>
  );
}
