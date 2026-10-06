import type { ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import styles from "./policy-document.module.css";

export interface ContentsEntry {
  /** The id of the section heading the entry jumps to. */
  id: string;
  label: string;
}

export interface PolicyDocumentProps {
  /** The small line above the title: "Policy", "Account". */
  eyebrow: string;
  /** The H1, in Title Case for a policy. */
  title: string;
  /** The updated date, or an owner input while it is unset. */
  updated?: ReactNode;
  /** Shown under the title while the owner or an attorney has not reviewed the page. */
  draft?: boolean;
  /** The contents list; empty for a page with one section. */
  contents?: ContentsEntry[];
  children: ReactNode;
}

/**
 * The one document layout the policy pages and the deletion entry share
 * (DESIGN.md 3.10): eyebrow, Title Case H1, the updated date, a contents
 * list that is sticky from 1024 px and a disclosure on phones, and one
 * reading column at the reading width. No warmth surface. The contents
 * list is rendered once for each width and only one is displayed, so the
 * phone copy can use the shared native disclosure.
 */
export function PolicyDocument({
  eyebrow,
  title,
  updated,
  draft = false,
  contents = [],
  children,
}: PolicyDocumentProps) {
  const list = (
    <ol className={styles.contentsList}>
      {contents.map((entry) => (
        <li key={entry.id}>
          <a className={styles.contentsLink} href={`#${entry.id}`}>
            {entry.label}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <article className={`${styles.document} wrap`} aria-labelledby="document-title">
      <header className={styles.head}>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="document-title" className={styles.title}>
          {title}
        </h1>
        {updated ? <p className={styles.updated}>Updated {updated}</p> : null}
        {draft ? (
          <p className={styles.draft}>
            Draft, not yet reviewed. Nothing on this page is an operative promise until the owner
            approves it.
          </p>
        ) : null}
      </header>
      <div className={contents.length > 0 ? styles.bodyWithContents : styles.body}>
        {contents.length > 0 ? (
          <>
            <nav className={styles.contentsWide} aria-label="Contents">
              <p className={styles.contentsTitle}>Contents</p>
              {list}
            </nav>
            <div className={styles.contentsNarrow}>
              <Disclosure summary="Contents">
                <nav aria-label="Contents">{list}</nav>
              </Disclosure>
            </div>
          </>
        ) : null}
        <div className={styles.reading}>{children}</div>
      </div>
    </article>
  );
}

export interface PolicySectionProps {
  /** The anchor the contents list points at; it sits on the heading. */
  id: string;
  heading: string;
  children: ReactNode;
}

/** One section of a document: an H2 that is the anchor, then the body. */
export function PolicySection({ id, heading, children }: PolicySectionProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {heading}
      </h2>
      {children}
    </section>
  );
}

/**
 * A fact the owner has not supplied, marked the way CONTENT.md marks it so
 * nothing on a draft page is invented: an inbox, an entity, a date.
 */
export function OwnerInput({ children }: { children: ReactNode }) {
  return <span className={styles.owner}>[OWNER] {children}</span>;
}

/** A two-column fact list inside a section: a term and its description. */
export function FactList({ items }: { items: Array<{ term: string; detail: ReactNode }> }) {
  return (
    <dl className={styles.facts}>
      {items.map((item) => (
        <div key={item.term} className={styles.fact}>
          <dt className={styles.factTerm}>{item.term}</dt>
          <dd className={styles.factDetail}>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
