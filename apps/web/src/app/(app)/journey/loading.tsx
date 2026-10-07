import { JourneyFrame } from "@/components/pages/journey/journey-screen";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * While the page's reads arrive: the heading, and skeletons only where a
 * week card and the week list will be (DESIGN.md section 4), never for
 * something that might not come.
 */
export default function JourneyLoading() {
  return (
    <JourneyFrame>
      <Skeleton height="240px" label="Loading this week" />
      <Skeleton variant="text" lines={4} label="Loading the weeks" />
    </JourneyFrame>
  );
}
