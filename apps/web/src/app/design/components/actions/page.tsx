import Link from "next/link";
import { Disclosure } from "@/components/ui/disclosure";
import { ComponentsChapterNav, SpecimenFrame } from "@/components/ui/specimen-frame";
import { specimens } from "@/components/ui/specimens/actions";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components/actions",
  "Actions and feedback",
  "Buttons, links, inline and toast feedback, skeletons, empty states, disclosures and the reference helpers, in every state and both themes.",
  false,
);

function anchorId(name: string): string {
  return `specimen-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export default function ActionsPage() {
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
        <h1>Say what happened, and what to do next.</h1>
        <p className="intro">{specimens.lede}</p>
        <Disclosure summary="In this chapter">
          <ul>
            {specimens.specimens.map((specimen) => (
              <li key={specimen.name}>
                <a href={`#${anchorId(specimen.name)}`}>{specimen.name}</a>
              </li>
            ))}
          </ul>
        </Disclosure>
      </header>

      <SpecimenFrame group={specimens} />

      <ComponentsChapterNav next={{ href: "/design/components/forms", label: "Forms" }} />
    </div>
  );
}
