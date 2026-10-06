import { ChapterList } from "@/components/public/chapter-list";
import { Hero } from "@/components/public/hero";
import { Promises } from "@/components/public/promises";
import { TideLine } from "@/components/public/tide-line";
import { pageMetadata, site } from "@/lib/site";

export const metadata = pageMetadata("/", site.name, site.description);

/**
 * The home page as DESIGN.md 1.1 decided it: the split hero, the tide
 * line, the numbered chapter list, the tide line, the four promises. The
 * header and footer come from the root layout. The two tide lines settle
 * once after load and rest.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <div className="wrap">
        <TideLine settle />
      </div>
      <ChapterList />
      <div className="wrap">
        <TideLine settle />
      </div>
      <Promises />
    </>
  );
}
