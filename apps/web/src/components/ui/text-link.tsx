import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import styles from "./text-link.module.css";

export interface TextLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  /** An address outside the app: a plain anchor with a safe rel, opened in the same tab. */
  external?: boolean;
  children: ReactNode;
}

/**
 * An inline link in running text: underlined in the accent role, with the
 * global focus ring. In-app targets go through next/link without prefetch;
 * anything else is a plain anchor.
 */
export function TextLink({ href, external = false, className, children, ...rest }: TextLinkProps) {
  const classes = [styles.link, className].filter(Boolean).join(" ");
  if (external) {
    return (
      <a {...rest} href={href} className={classes} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link {...rest} href={href} prefetch={false} className={classes}>
      {children}
    </Link>
  );
}
