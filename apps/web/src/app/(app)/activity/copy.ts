/**
 * Every string the activity route shows, in one module (architecture
 * 13.10). `docs/design/CONTENT.md` carries the title, "Load more" and the
 * empty state; the row wording, the fallbacks and the pending and failure
 * lines are written to its voice table and listed in the route's own
 * subsection there for the owner's approval.
 *
 * A row says what happened, by whom and when. It may name a category by
 * its label from the sharing descriptions ("your symptoms"), which is a
 * label and never a fact; it never says what was viewed, written or logged.
 */
export const activityCopy = {
  title: "Activity",
  description: "Sign-ins, devices and sharing changes on your Tidefern account.",
  heading: "Activity",
  /** The parent the back link names; its accessible name reads "Back to Settings". */
  back: "Settings",
  loading: "Loading your activity",
  loadFailed: "We could not load your activity just now. Reload the page to try again.",
  loadMore: "Load more",
  // No wider than "Load more", so the button keeps its width while it waits.
  loadingMore: "Loading",
  loadMoreFailed: "We could not load more activity. Try again.",
  unreachable: "We could not reach Tidefern. Check your connection and try again.",
  empty: {
    heading: "No activity yet",
    why: "Sign-ins, devices and sharing changes appear here.",
  },
  /** Who did it: the viewer, a person the page can name, or the neutral fallback. */
  who: {
    you: "by you",
    named: (name: string) => `by ${name}`,
    someone: "by someone you shared with",
  },
  /** Whose records a row is about, with the category's label in lower case. */
  place: {
    yours: (label: string) => `your ${label}`,
    named: (name: string, label: string) => `${name}'s ${label}`,
    someone: (label: string) => `the ${label} someone shared with you`,
    child: (name: string) => `${name}'s records`,
    someChild: "a child's records",
  },
  /** The label of a category the sharing descriptions do not name. */
  privateNotes: "private notes",
  otherRecords: "shared records",
  what: {
    signedIn: "Signed in",
    signedOutOthers: "Signed out other devices",
    startedSharing: (place: string) => `Started sharing ${place}`,
    changedSharing: (place: string) => `Changed sharing for ${place}`,
    stoppedSharing: (place: string) => `Stopped sharing ${place}`,
    endedAccess: (place: string) => `Ended access to ${place}`,
    viewed: (place: string) => `Viewed ${place}`,
    contributed: (place: string) => `Contributed to ${place}`,
    sharedNote: (place: string) => `Shared a note with people who can see ${place}`,
    invitationSent: "Sent an invitation",
    invitationWithdrawn: "Withdrew an invitation",
    invitationAccepted: "Accepted an invitation",
    exported: "Requested a copy of your data",
    closeRequested: "Asked to close your account",
    closeCancelled: "Cancelled closing your account",
    other: "Other activity on your account",
  },
} as const;
