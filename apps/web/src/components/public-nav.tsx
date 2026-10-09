"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";

/** The public header's words (CONTENT.md, "Public header (J3b)"). */
export const publicNavCopy = {
  label: "Primary",
  design: "Design system",
  signIn: "Sign in",
  // [OWNER] Proposed: the phone disclosure button's label; CONTENT.md names no word for it.
  menu: "Menu",
} as const;

const links = [
  {
    href: "/design",
    label: publicNavCopy.design,
    matches: (path: string) => path === "/design" || path.startsWith("/design/"),
  },
  { href: "/sign-in", label: publicNavCopy.signIn, matches: (path: string) => path === "/sign-in" },
] as const;

/**
 * The public header's navigation (DESIGN.md sections 2 and 4): the design
 * system and Sign in, for every visitor (neither DESIGN.md nor CONTENT.md
 * gives a signed-in visitor anything else). From 601 px the links sit in
 * the bar. Below that a disclosure button opens them as a panel under the
 * bar: a real button with `aria-expanded` and `aria-controls`; Escape, a
 * press outside, a link or a route change closes it, and Escape puts focus
 * back on the button. The press cue and haptic come from the shared
 * SoundProvider, which hears every button and link by delegation, so none
 * is played here.
 *
 * Without JavaScript nothing sets `data-js` on the root, the button stays
 * hidden and the links show as a plain list on a row of their own, so a
 * phone without scripts still reaches both.
 */
export function PublicNav() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(pathname);
  const navRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  if (shownFor !== pathname) {
    // A route change (a link, Back, Forward) closes the panel.
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && event.target instanceof Node && navRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <nav
      ref={navRef}
      className="site-nav"
      aria-label={publicNavCopy.label}
      data-open={open ? "true" : undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        className="site-nav-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{publicNavCopy.menu}</span>
        <Icon name={open ? "close" : "chevron-down"} />
      </button>
      <ul id={listId} className="site-nav-list">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch={false}
              className={link.href === "/sign-in" ? "site-nav-sign-in" : undefined}
              aria-current={link.matches(pathname) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
