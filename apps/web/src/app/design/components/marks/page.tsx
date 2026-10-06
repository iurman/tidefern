import Link from "next/link";
import { ComponentsChapterNav, SpecimenFrame } from "@/components/ui/specimen-frame";
import { specimens } from "@/components/ui/specimens/marks";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components/marks",
  "Marks and charts",
  "The cycle ring, the pregnancy week card, the timeline and the growth chart in every state, in both themes.",
  false,
);

export default function MarksPage() {
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
        <p className="eyebrow">Components</p>
        <h1>{specimens.title}</h1>
        <p className="intro">{specimens.lede}</p>
      </header>
      <SpecimenFrame group={specimens} />
      <ComponentsChapterNav previous={{ href: "/design/components/calendar", label: "Calendar" }} />
    </div>
  );
}
