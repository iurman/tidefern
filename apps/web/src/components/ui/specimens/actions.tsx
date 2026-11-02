import { BackLink } from "../back-link";
import { Button, type ButtonVariant } from "../button";
import { CopyCode } from "../copy-code";
import { Disclosure } from "../disclosure";
import { EmptyState } from "../empty-state";
import { InlineFeedback } from "../inline-feedback";
import { Skeleton } from "../skeleton";
import { SoundToggle } from "../sound-toggle";
import type { ComponentState, Specimen, SpecimenGroup } from "../specimen";
import { TextLink } from "../text-link";
import { Toast, ToastRegion } from "../toast";
import { ThemeToggle } from "../theme-toggle";
import { TokenSwatch } from "../token-swatch";

const ui = "apps/web/src/components/ui/";

/** The states a control that is not interactive has no meaning for. */
const notInteractive = {
  hover: "none",
  "focus-visible": "none",
  active: "none",
  disabled: "none",
} as const;

function buttonSpecimen(variant: ButtonVariant, label: string, loadingText: string): Specimen {
  return {
    name: `Button, ${variant}`,
    source: `${ui}button.tsx`,
    usage: [
      `<Button`,
      `  variant="${variant}"`,
      `  loading={saving}`,
      `  loadingText="Saving"`,
      `>`,
      `  ${label}`,
      `</Button>`,
    ].join("\n"),
    keyboard:
      "Tab reaches it, Enter or Space activates it. While loading it stays in the tab order and ignores activation.",
    // A button never reports an error itself; InlineFeedback beside it does. It holds no collection, so empty has no meaning.
    states: { error: "none", empty: "none" },
    render: (state: ComponentState) => (
      <Button
        variant={variant}
        disabled={state === "disabled"}
        loading={state === "loading"}
        loadingText={loadingText}
      >
        {label}
      </Button>
    ),
  };
}

export const specimens: SpecimenGroup = {
  slug: "actions",
  title: "Actions and feedback",
  lede: "The controls that do something and the messages that say what happened. Native elements, the semantic tokens in both themes, text with every icon, and feedback that always has words.",
  specimens: [
    buttonSpecimen("primary", "Create an account", "Creating your account"),
    buttonSpecimen("secondary", "Add a measurement", "Saving"),
    buttonSpecimen("quiet", "Add a private note", "Saving"),
    buttonSpecimen("destructive", "Revoke access", "Revoking"),
    {
      name: "Button, as a link",
      source: `${ui}button.tsx`,
      usage: ['<Button href="/welcome">', "  Create an account", "</Button>"].join("\n"),
      keyboard: "Tab reaches it, Enter follows it. It is a link, so Space scrolls the page.",
      // A link is never disabled, never loading and never in error: those belong to the page it opens.
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => <Button href="/design">Explore the design system</Button>,
    },
    {
      name: "Text link",
      source: `${ui}text-link.tsx`,
      usage: [
        '<TextLink href="/privacy">',
        "  how Tidefern stores your account",
        "</TextLink>",
      ].join("\n"),
      keyboard:
        "Tab reaches it, Enter follows it. In a sentence it reads as running text: Read how Tidefern stores your account before you decide.",
      // Running text has no disabled, loading, error or empty form.
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      // The link is the root so the frame's forced states reach it; the sentence around it is the page's.
      render: () => <TextLink href="/privacy">how Tidefern stores your account</TextLink>,
    },
    {
      name: "Back link",
      source: `${ui}back-link.tsx`,
      usage: '<BackLink href="/settings">Settings</BackLink>',
      keyboard:
        "Tab reaches it, Enter follows it to the parent screen's address, so a deep link and a reload go back the same way. Screen readers hear Back to Settings.",
      // A link to a parent has no disabled, loading, error or empty form.
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => <BackLink href="/settings">Settings</BackLink>,
    },
    {
      name: "Inline feedback",
      source: `${ui}inline-feedback.tsx`,
      usage: [
        "<InlineFeedback",
        '  tone="success"',
        "  cue",
        ">",
        "  Saved for Sunday, Oct 5.",
        "</InlineFeedback>",
      ].join("\n"),
      keyboard:
        "Not focusable. A polite live region, so a screen reader hears the sentence after the current one.",
      // Not a control: nothing to hover, focus, press or disable. Loading shows the pending sentence in the note tone before success or error replaces it. Empty has no meaning: no message, no component.
      states: { ...notInteractive, empty: "none" },
      render: (state) =>
        state === "error" ? (
          <InlineFeedback tone="error">We could not save this day. Try again.</InlineFeedback>
        ) : state === "loading" ? (
          <InlineFeedback tone="info">Checking your passkey</InlineFeedback>
        ) : (
          <InlineFeedback tone="success">Saved for Sunday, Oct 5.</InlineFeedback>
        ),
    },
    {
      name: "Toast",
      source: `${ui}toast.tsx`,
      usage: [
        "<Toast",
        '  tone="success"',
        "  onDismiss={clear}",
        "  action={",
        '    <Button variant="quiet">',
        "      Undo",
        "    </Button>",
        "  }",
        ">",
        "  Saved for Sunday, Oct 5.",
        "</Toast>",
      ].join("\n"),
      keyboard:
        "Tab reaches the action and then Dismiss; Enter or Space activates them. While the pointer is over the toast or focus is inside it, the success timer stops.",
      // Hover and focus pause the timer and show on the border. Active, disabled and loading have no meaning for a message; empty has none because a toast without text is not shown.
      states: { active: "none", disabled: "none", loading: "none", empty: "none" },
      render: (state) =>
        state === "error" ? (
          <Toast tone="error" action={<Button variant="quiet">Send a new one</Button>}>
            The invitation has expired.
          </Toast>
        ) : (
          <Toast tone="info" action={<Button variant="quiet">Download</Button>}>
            Your export is ready.
          </Toast>
        ),
    },
    {
      name: "Toast region",
      source: `${ui}toast.tsx`,
      usage: [
        "const toast = {",
        '  id: "save-day",',
        '  tone: "success",',
        '  text: "Saved for Sunday, Oct 5.",',
        "};",
        "<ToastRegion",
        "  toasts={[toast]}",
        "  onDismiss={remove}",
        "/>",
      ].join("\n"),
      keyboard:
        "A named region; each toast inside carries its own Dismiss. Two toasts with the same id collapse to one, so an action never shows twice.",
      // The region itself is not a control; its toasts carry hover and focus. Loading has no meaning: a toast arrives finished.
      states: { ...notInteractive, loading: "none" },
      render: (state) => (
        <ToastRegion
          fixed={false}
          toasts={
            state === "empty"
              ? []
              : state === "error"
                ? [
                    {
                      id: "invite",
                      tone: "error",
                      text: "The invitation has expired. Send a new one.",
                    },
                  ]
                : [
                    { id: "export", tone: "info", text: "Your export is ready." },
                    {
                      id: "export",
                      tone: "info",
                      text: "A second toast for the same action, hidden.",
                    },
                    {
                      id: "share",
                      tone: "error",
                      text: "We could not change that. Try again.",
                    },
                  ]
          }
        />
      ),
    },
    {
      name: "Skeleton",
      source: `${ui}skeleton.tsx`,
      usage: [
        "<Skeleton",
        '  variant="text"',
        "  lines={3}",
        '  label="Loading your notes"',
        "/>",
      ].join("\n"),
      keyboard: "Not focusable. The container is marked busy and reads its label.",
      // A placeholder is never interactive. It has no error form (the value either arrives or an empty state takes its place) and is itself the loading state, so empty has no meaning.
      states: { ...notInteractive, error: "none", empty: "none" },
      render: (state) =>
        state === "loading" ? (
          <Skeleton variant="text" lines={3} label="Loading your notes" />
        ) : (
          <Skeleton variant="block" label="Loading this month" />
        ),
    },
    {
      name: "Empty state",
      source: `${ui}empty-state.tsx`,
      usage: [
        "<EmptyState",
        "  heading={copy.heading}",
        "  why={copy.why}",
        "  action={",
        "    <Button>Log today</Button>",
        "  }",
        "/>",
      ].join("\n"),
      keyboard: "Tab reaches the one action, if there is one.",
      // The formula is the whole component, so default and empty are the same thing: the tide line, and the mark for a stage's first screen. It is never loading (a skeleton stands there) and never in error.
      states: { ...notInteractive, loading: "none", error: "none" },
      render: (state) =>
        state === "empty" ? (
          <EmptyState
            mark
            level={3}
            heading="No child added yet"
            why="Add a child to keep feeds, sleep, growth and milestones in one place."
            action={<Button variant="secondary">Add a child</Button>}
          />
        ) : (
          <EmptyState
            level={3}
            heading="Nothing logged this month"
            why="Days you log show here with their flow and symptoms."
            action={<Button variant="secondary">Log today</Button>}
          />
        ),
    },
    {
      name: "Disclosure",
      source: `${ui}disclosure.tsx`,
      usage: [
        "<Disclosure",
        '  summary="How this is estimated"',
        ">",
        "  {explanation}",
        "</Disclosure>",
      ].join("\n"),
      keyboard: "Tab reaches the summary, Enter or Space opens and closes it.",
      // A native details element has no disabled, loading or error form, and an empty one is not rendered.
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => (
        <Disclosure summary="How this is estimated">
          <p>
            Tidefern takes the start dates you logged, measures the gap between them and uses the
            typical gap to place the next start. More logged cycles make the range narrower.
          </p>
        </Disclosure>
      ),
    },
    {
      name: "Copy code",
      source: `${ui}copy-code.tsx`,
      usage: [
        "<CopyCode",
        '  label="Theme variables"',
        '  language="css"',
        "  code={css}",
        "/>",
      ].join("\n"),
      keyboard:
        "Tab reaches the code block and then Copy; Enter or Space copies. The result is announced from a polite live region.",
      // Copying is instant, so loading has no meaning.
      states: { loading: "none" },
      render: (state) => (
        <CopyCode
          label="Usage"
          language="tsx"
          disabled={state === "disabled"}
          status={state === "error" ? "failed" : "idle"}
          code={state === "empty" ? "" : '<Button variant="primary">Create an account</Button>'}
        />
      ),
    },
    {
      name: "Token swatch",
      source: `${ui}token-swatch.tsx`,
      usage: ["<TokenSwatch", '  token="accent"', '  label="Accent"', "/>"].join("\n"),
      keyboard: "Not focusable. The token name and the measured value are plain text.",
      // Reference only, not a control. The measurement lands on the first client frame, so loading is the one word "Measuring" and cannot be held; empty has no meaning without a token.
      states: { ...notInteractive, loading: "none", empty: "none" },
      render: (state) =>
        state === "error" ? (
          <TokenSwatch token="not-a-token" label="Unknown" />
        ) : (
          <TokenSwatch token="accent" label="Accent" />
        ),
    },
    {
      name: "Theme toggle",
      source: `${ui}theme-toggle.tsx`,
      usage: "<ThemeToggle />",
      keyboard: "Tab reaches it, Enter or Space flips the theme. The name says which way.",
      // The theme can always be changed, so disabled has no meaning; the flip is instant and never fails; nothing to be empty.
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => <ThemeToggle />,
    },
    {
      name: "Sound toggle",
      source: `${ui}sound-toggle.tsx`,
      usage: "<SoundToggle />",
      keyboard: "Tab reaches it, Enter or Space flips interface sound. The name says which way.",
      // Same as the theme toggle: always available, instant, nothing to be empty.
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => <SoundToggle />,
    },
  ],
};
