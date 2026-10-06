import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";

/**
 * The 404 renders in the root layout, outside both route groups, so it
 * draws the public chrome itself: the header and the footer with its
 * policy links.
 */
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        <Statement
          heading="That page is not here."
          sentence="The address may have changed, or it never existed."
          action={<Button href="/">Back to the start</Button>}
        />
      </main>
      <Footer />
    </>
  );
}
