import Link from "next/link";
import { Disclosure } from "@/components/ui/disclosure";

export interface ChapterAnchor {
  id: string;
  label: string;
}

export interface ChapterLink {
  href: string;
  label: string;
}

/**
 * The rail at the top of a design chapter: the link back to the hub and a
 * native disclosure listing every section anchor, so a long chapter is
 * reachable on a phone without a sticky header (RESEARCH.md, Phloom chapter
 * navigation). Server rendered; the disclosure works without JavaScript.
 */
export function ChapterHead({ anchors }: { anchors: ChapterAnchor[] }) {
  return (
    <nav className="chapter-nav" aria-label="Chapters">
      <Link href="/design" prefetch={false}>
        Design system
      </Link>
      <Disclosure summary="In this chapter">
        <ul>
          {anchors.map((anchor) => (
            <li key={anchor.id}>
              <a href={`#${anchor.id}`}>{anchor.label}</a>
            </li>
          ))}
        </ul>
      </Disclosure>
    </nav>
  );
}

/** Previous and next at the foot, in the order architecture 13.8 lists the chapters. */
export function ChapterFoot({ previous, next }: { previous?: ChapterLink; next?: ChapterLink }) {
  return (
    <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
      {previous ? (
        <Link href={previous.href} prefetch={false}>
          Previous: {previous.label}
        </Link>
      ) : null}
      {next ? (
        <Link href={next.href} prefetch={false}>
          Next: {next.label}
        </Link>
      ) : null}
    </nav>
  );
}
