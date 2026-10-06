"use client";
import { useState } from "react";
import { AppShell } from "../app-shell";
import { BottomSheet } from "../bottom-sheet";
import { ConsentRecord } from "../consent-record";
import { DeviceRow } from "../device-row";
import { Dialog } from "../dialog";
import { GrantRow, grantCopy, type GrantRowProps } from "../grant-row";
import { InvitationCard } from "../invitation-card";
import { PersonCard, type PersonGrant } from "../person-card";
import { Rail } from "../rail";
import { shellDestinations } from "../shell-destinations";
import type { ComponentState, SpecimenGroup } from "../specimen";
import { SpecimenFrame } from "../specimen-frame";
import { TabBar } from "../tab-bar";

/**
 * The structure group's specimens: the shell and its two navigations, the
 * two overlays, and the sharing and settings cards. Every render returns
 * the real component; the data is a synthetic household (Alex, Jo, Nora)
 * and never a stored value. Nothing here writes to storage.
 */

function flags(state: ComponentState) {
  return {
    disabled: state === "disabled",
    loading: state === "loading",
  };
}

const cycleProfile = { stage: "cycle", hasChild: false } as const;

/** The consent step's facts, in the person's words, from architecture 8.2 and 9.5. */
export const consentFacts = {
  categories: [
    "Period dates and flow",
    "Symptoms and moods",
    "Pregnancy dates, appointments and milestones",
    "A child's feeds, sleep, growth and milestones",
    "Private notes, encrypted so only you can read them",
  ],
  purposes: [
    "Show where you are in your cycle or pregnancy and estimate what comes next",
    "Keep a record you can read, export and delete",
    "Share only the categories you choose with the people you invite",
    "Send the reminders you turn on, worded so they give nothing away",
  ],
  processors: [
    { name: "Vercel", receives: "runs the app and handles every request" },
    {
      name: "Neon, a Databricks product",
      receives: "stores the database; your notes arrive encrypted",
    },
    { name: "Resend", receives: "your email address and generic messages" },
  ],
  policyVersion: "2026-10",
};

const alexGrants: PersonGrant[] = [
  { category: "cycle.status", checked: true },
  { category: "cycle.history", checked: false },
  { category: "cycle.symptoms", checked: false },
  { category: "pregnancy.overview", checked: false },
  { category: "child", childName: "Nora", checked: false },
];

function LiveGrantRow(props: GrantRowProps) {
  const [checked, setChecked] = useState(props.checked);
  return <GrantRow {...props} checked={checked} onChange={setChecked} />;
}

export const specimens: SpecimenGroup = {
  slug: "structure",
  title: "Structure and overlays",
  lede: "The authenticated frame, the two overlays, and the cards that carry sharing, consent and devices. Every control is a native element; nothing here depends on a drag, a hover or a sound.",
  specimens: [
    {
      name: "App shell",
      source: "apps/web/src/components/ui/app-shell.tsx",
      usage:
        '<AppShell stage="cycle" hasChild={false} current="today" onQuickLog={openSheet}>\n  {page}\n</AppShell>',
      keyboard:
        "Tab reaches the destinations in order; Enter follows one. The frame has no hover, focus or press of its own, so those states and disabled, loading, error and empty are none here; the tab bar and the rail below carry them.",
      states: {
        hover: "none",
        "focus-visible": "none",
        active: "none",
        disabled: "none",
        loading: "none",
        error: "none",
        empty: "none",
      },
      render: () => (
        <AppShell {...cycleProfile} current="today" fit="content">
          <p className="muted-note">The route renders here, between the rail and the bar.</p>
        </AppShell>
      ),
    },
    {
      name: "Tab bar",
      source: "apps/web/src/components/ui/tab-bar.tsx",
      usage:
        '<TabBar destinations={shellDestinations(profile)} current="today" onQuickLog={openSheet} />',
      keyboard:
        "Tab moves across the destinations and the quick-log button; Enter follows a link or opens the log. A route always has at least four destinations, and a navigation is never disabled, loading or in error, so those states are none.",
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => <TabBar destinations={shellDestinations(cycleProfile)} current="today" />,
    },
    {
      name: "Rail",
      source: "apps/web/src/components/ui/rail.tsx",
      usage:
        '<Rail destinations={shellDestinations(profile)} current="today" onQuickLog={openSheet} />',
      keyboard:
        "Tab moves from the mark through the destinations to the quick-log action; Enter follows one. Shown from 1024 px of shell width. Disabled, loading, error and empty are none for the same reason as the tab bar.",
      states: { disabled: "none", loading: "none", error: "none", empty: "none" },
      render: () => (
        <Rail
          destinations={shellDestinations({ stage: "pregnancy", hasChild: true })}
          current="today"
        />
      ),
    },
    {
      name: "Dialog",
      source: "apps/web/src/components/ui/dialog.tsx",
      usage:
        '<Dialog open={open} onClose={close} title="Send the invitation?" confirmLabel="Send the invitation" pendingLabel="Sending the invitation" onConfirm={send}>\n  <p>Jo gets an email asking them to sign in to Tidefern.</p>\n</Dialog>',
      keyboard:
        "Focus lands inside the panel when it opens; Tab stays within it; Escape closes it and focus returns to the control that opened it. Hover, focus and press on the panel mean the confirm action. Empty is none: a dialog always has a title and a body.",
      states: { empty: "none" },
      render: (state) => (
        <Dialog
          inline
          open
          onClose={() => {}}
          title="Send the invitation?"
          confirmLabel="Send the invitation"
          pendingLabel="Sending the invitation"
          error={state === "error" ? "We could not send the invitation. Try again." : undefined}
          {...flags(state)}
        >
          <p>
            Jo gets an email asking them to sign in to Tidefern. Nothing is shared until you turn a
            category on.
          </p>
        </Dialog>
      ),
    },
    {
      name: "Dialog, destructive",
      source: "apps/web/src/components/ui/dialog.tsx",
      usage:
        '<Dialog variant="destructive" open={open} onClose={close} title="Remove Alex?" confirmLabel="Remove Alex" pendingLabel="Removing" cancelLabel="Keep sharing" onConfirm={remove}>\n  <p>Alex loses access to everything you share, right now.</p>\n</Dialog>',
      keyboard:
        "As the dialog. Cancel comes first in the tab order so the first Enter keeps things as they are; the confirm action names the person and the body names the consequence.",
      states: { empty: "none" },
      render: (state) => (
        <Dialog
          inline
          open
          onClose={() => {}}
          variant="destructive"
          title="Remove Alex?"
          confirmLabel="Remove Alex"
          pendingLabel="Removing"
          cancelLabel="Keep sharing"
          error={state === "error" ? "We could not remove Alex. Try again." : undefined}
          {...flags(state)}
        >
          <p>
            Alex loses access to everything you share, right now. What Alex added to your record
            stays with you.
          </p>
        </Dialog>
      ),
    },
    {
      name: "Bottom sheet",
      source: "apps/web/src/components/ui/bottom-sheet.tsx",
      usage:
        '<BottomSheet open={open} onClose={close} title="Sunday, Oct 5">\n  {daySheet}\n</BottomSheet>',
      keyboard:
        "Focus lands on the close button; Tab stays within the sheet; Escape closes it and focus returns to the opener. The handle is decoration: nothing needs a drag. Hover, focus and press mean the close button. A sheet is open or closed, never disabled, and it always has a title, so disabled and empty are none.",
      states: { disabled: "none", empty: "none" },
      render: (state) => (
        <BottomSheet
          inline
          open
          onClose={() => {}}
          title="Sunday, Oct 5"
          loading={state === "loading"}
          error={state === "error" ? "We could not load this day. Try again." : undefined}
        >
          <p>
            What you log for this day goes here, in the order the day sheet sets: period, flow,
            symptoms, mood, a private note.
          </p>
        </BottomSheet>
      ),
    },
    {
      name: "Grant row",
      source: "apps/web/src/components/ui/grant-row.tsx",
      usage:
        '<GrantRow label={grantCopy["cycle.status"].label} description={grantCopy["cycle.status"].description} checked={on} onChange={setOn} />',
      keyboard:
        "Tab reaches the switch; Space or Enter flips it. Off revokes in that one press. The description is read with the switch. Empty is none: a row always has its category.",
      states: { empty: "none" },
      render: (state) => (
        <LiveGrantRow
          label={grantCopy["cycle.status"].label}
          description={grantCopy["cycle.status"].description}
          checked
          error={state === "error" ? "We could not save this change. Try again." : undefined}
          {...flags(state)}
        />
      ),
    },
    {
      name: "Person card",
      source: "apps/web/src/components/ui/person-card.tsx",
      usage:
        '<PersonCard name="Alex" relation="partner" since="2026-03-02" grants={grants} notify={false} onGrantChange={save} onNotifyChange={saveNotify} onRemove={remove} />',
      keyboard:
        "Tab moves down the switches to the remove action; Space flips a switch; Enter on Remove opens the destructive dialog. Hover, focus and press on the card mean the remove action. Loading is the removal in flight. Empty is none: a person always lists every category, and the route's own empty state covers having nobody to share with.",
      states: { empty: "none" },
      render: (state) => (
        <PersonCard
          name="Alex"
          relation="partner"
          since="2026-03-02"
          grants={alexGrants}
          notify={false}
          error={state === "error" ? "We could not save this change. Try again." : undefined}
          {...flags(state)}
        />
      ),
    },
    {
      name: "Invitation card",
      source: "apps/web/src/components/ui/invitation-card.tsx",
      usage: '<InvitationCard name="Jo" sentOn="2026-10-03" onWithdraw={withdraw} />',
      keyboard:
        "Tab reaches Withdraw; Enter withdraws in one step. The card holds no link that accepts; Jo accepts after signing in. Empty is none: the route's own empty state covers having no invitations.",
      states: { empty: "none" },
      render: (state) => (
        <InvitationCard
          name="Jo"
          sentOn="2026-10-03"
          error={state === "error" ? "The invitation has expired. Send a new one." : undefined}
          {...flags(state)}
        />
      ),
    },
    {
      name: "Consent record",
      source: "apps/web/src/components/ui/consent-record.tsx",
      usage:
        '<ConsentRecord categories={facts.categories} purposes={facts.purposes} processors={facts.processors} policyVersion="2026-10" checked={agreed} onChange={setAgreed} />',
      keyboard:
        "Tab reaches the one checkbox; Space ticks it. It starts unchecked and nothing else on the step counts as agreement. Empty is none: the record always lists what is collected.",
      states: { empty: "none" },
      render: (state) => (
        <ConsentRecord
          {...consentFacts}
          error={state === "error" ? "Tick the box to continue." : undefined}
          {...flags(state)}
        />
      ),
    },
    {
      name: "Consent record, read-only",
      source: "apps/web/src/components/ui/consent-record.tsx",
      usage:
        '<ConsentRecord readOnly agreedOn="2026-10-05" categories={facts.categories} purposes={facts.purposes} processors={facts.processors} policyVersion="2026-10" />',
      keyboard:
        "Nothing to operate: Settings shows the record with the date it was given, and withdrawal is the close-account control beside it. Every interactive state is none.",
      states: {
        hover: "none",
        "focus-visible": "none",
        active: "none",
        disabled: "none",
        loading: "none",
        error: "none",
        empty: "none",
      },
      render: () => <ConsentRecord {...consentFacts} readOnly agreedOn="2026-10-05" />,
    },
    {
      name: "Device row",
      source: "apps/web/src/components/ui/device-row.tsx",
      usage:
        '<DeviceRow browser="Firefox on Linux" lastSeen="2026-10-05" current othersCount={2} onRevoke={signOut} onRevokeOthers={signOutOthers} />',
      keyboard:
        "Tab reaches the sign-out actions; Enter signs out in one step. Empty is the current browser with nothing else signed in: it says so instead of offering an action.",
      render: (state) => (
        <DeviceRow
          browser="Firefox on Linux"
          lastSeen="2026-10-05"
          current
          othersCount={state === "empty" ? 0 : 2}
          onRevoke={() => {}}
          onRevokeOthers={() => {}}
          error={state === "error" ? "We could not sign this device out. Try again." : undefined}
          {...flags(state)}
        />
      ),
    },
    {
      name: "Device row, another device",
      source: "apps/web/src/components/ui/device-row.tsx",
      usage: '<DeviceRow browser="Safari on iPhone" lastSeen="2026-10-04" onRevoke={signOut} />',
      keyboard:
        "Tab reaches Sign out this device; Enter signs it out. Empty is none: the list, not the row, can be empty.",
      states: { empty: "none" },
      render: (state) => (
        <DeviceRow
          browser="Safari on iPhone"
          lastSeen="2026-10-04"
          onRevoke={() => {}}
          error={state === "error" ? "We could not sign this device out. Try again." : undefined}
          {...flags(state)}
        />
      ),
    },
  ],
};

/** The chapter page renders the group through the shared frame. */
export function StructureSpecimens() {
  return <SpecimenFrame group={specimens} />;
}

/**
 * Two live overlays for the browser test and for anyone reading the chapter:
 * a real modal dialog and a real sheet, opened from buttons so the return of
 * focus can be seen.
 */
export function OverlayDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="specimen-controls">
      <button type="button" className="quiet-action" onClick={() => setDialogOpen(true)}>
        Open the dialog
      </button>
      <button type="button" className="quiet-action" onClick={() => setSheetOpen(true)}>
        Open the sheet
      </button>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Send the invitation?"
        confirmLabel="Send the invitation"
        pendingLabel="Sending the invitation"
        onConfirm={() => setDialogOpen(false)}
      >
        <p>
          Jo gets an email asking them to sign in to Tidefern. Nothing is shared until you turn a
          category on.
        </p>
      </Dialog>
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Sunday, Oct 5">
        <p>
          What you log for this day goes here, in the order the day sheet sets: period, flow,
          symptoms, mood, a private note.
        </p>
      </BottomSheet>
    </div>
  );
}
