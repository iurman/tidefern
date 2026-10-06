import Link from "next/link";
import { ComponentsChapterNav, SpecimenFrame } from "@/components/ui/specimen-frame";
import { specimens } from "@/components/ui/specimens/forms";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components/forms",
  "Forms",
  "The form field, the time zone combobox, the segmented date input, the measurement input with its unit toggle, the segmented control, the flow scale, the chip group and the mood selector, in every state and both themes.",
  false,
);

export default function FormsPage() {
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
        <h1>Fields that say what they need.</h1>
        <p className="intro">{specimens.lede}</p>
      </header>
      <SpecimenFrame group={specimens} />
      <ComponentsChapterNav
        previous={{ href: "/design/components/actions", label: "Actions and feedback" }}
        next={{ href: "/design/components/structure", label: "Structure and overlays" }}
      />
    </div>
  );
}
