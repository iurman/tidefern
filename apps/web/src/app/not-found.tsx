import { Statement } from "@/components/public/statement";
import { Button } from "@/components/ui/button";

/** The 404 inside the root layout, so the header and the footer with its policy links stay. */
export default function NotFound() {
  return (
    <Statement
      heading="That page is not here."
      sentence="The address may have changed, or it never existed."
      action={<Button href="/">Back to the start</Button>}
    />
  );
}
