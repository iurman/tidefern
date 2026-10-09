import { Logo } from "./logo";
import { PublicNav } from "./public-nav";
import { SoundToggle } from "@/components/ui/sound-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Header() {
  return (
    <header className="site-header wrap">
      <div className="header-bar">
        <Logo />
        <PublicNav />
        <div className="header-controls">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
