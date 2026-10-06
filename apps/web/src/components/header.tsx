import Link from "next/link";
import { Logo } from "./logo";
import { SoundToggle } from "@/components/ui/sound-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Header() {
  return (
    <header className="site-header wrap">
      <div className="header-bar">
        <Logo />
        <nav className="site-nav" aria-label="Primary">
          <Link href="/design" prefetch={false}>
            Design system
          </Link>
        </nav>
        <div className="header-controls">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
