import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

/**
 * The public chrome (DESIGN.md section 2): the header with its navigation
 * and the sound and theme controls, and the footer with the two policy
 * links. Every route a visitor can read without a session renders here;
 * the authenticated routes in (app) never do.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
