"use client";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SegmentedDateInput } from "@/components/ui/segmented-date-input";
import { Textarea } from "@/components/ui/textarea";
import { browserApiClient } from "@/lib/api-browser";
import { journeyCopy as copy, kindName, type EventKind } from "./copy";
import {
  DETAIL_MAX,
  SIGN_IN_AGAIN_PATH,
  eventBody,
  eventFailure,
  keyMemory,
  validateEvent,
  type EventDraft,
  type EventField,
} from "./forms";
import styles from "./journey.module.css";
import { useFocusFirstInvalid } from "./use-first-invalid";

/** What the edit form needs of a row: the values to start from and the version to match. */
export interface EditableEvent {
  id: string;
  kind: EventKind;
  date: string;
  detail: string | null;
  version: number;
  title: string;
}

interface Editor {
  openAdd: (kind: EventKind) => void;
  openEdit: (event: EditableEvent) => void;
  outcome: Outcome;
}

type Form = { mode: "closed" } | { mode: "add" } | { mode: "edit"; event: EditableEvent };

type Outcome =
  { kind: "none" } | { kind: "done"; sentence: string } | { kind: "failed"; sentence: string };

const EditorContext = createContext<Editor | null>(null);

function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (editor === null) throw new Error("an event control must sit inside an EventEditor");
  return editor;
}

const kinds: readonly { value: EventKind | ""; label: string }[] = [
  { value: "appointment", label: kindName("appointment") },
  { value: "milestone", label: kindName("milestone") },
];

const EMPTY_DRAFT: EventDraft = { kind: null, date: null, detail: "" };

/** A full navigation to sign in, with the way back here; the page then starts from a fresh read. */
function leaveForSignIn() {
  window.location.assign(SIGN_IN_AGAIN_PATH);
}

interface Answer {
  status: number;
  problem: unknown;
}

async function answer(
  request: () => Promise<{ error?: unknown; response: Response }>,
): Promise<Answer> {
  try {
    const { error, response } = await request();
    return { status: response.status, problem: error };
  } catch {
    return { status: 0, problem: undefined };
  }
}

export interface EventEditorProps {
  pregnancyId: string;
  /** Deleting is the subject's alone (the API answers a grantee 404), so only her page offers it. */
  canDelete: boolean;
  /** Today in the subject's zone, for the date field's example line. */
  today: string;
  children: ReactNode;
}

/**
 * Adds, edits and deletes the appointments and milestones of one pregnancy
 * through E4 (DESIGN.md 3.5): the week list and the add buttons inside it
 * open one form in a Dialog, the detail travels only in the request body
 * and is encrypted by the API, and every outcome is the API's own. Saving
 * keeps the button's width while it says "Saving"; a refusal stays in the
 * form with what to do next; a save reloads the page's read with
 * `router.refresh()`, so the list only ever shows what the API returned.
 */
export function EventEditor({ pregnancyId, canDelete, today, children }: EventEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<Form>({ mode: "closed" });
  const [removing, setRemoving] = useState<EditableEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);
  const [generation, setGeneration] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<EventField, string>>>({});
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  // Read after an await, when the state in the closure may predate an Escape press.
  const dialogOpen = useRef(false);
  const keys = useRef(keyMemory(() => browserApiClient().newId()));
  const fields = useFocusFirstInvalid(errors);

  const begin = useCallback((next: EventDraft) => {
    keys.current = keyMemory(() => browserApiClient().newId());
    setDraft(next);
    setErrors({});
    setDialogError(undefined);
    setOutcome({ kind: "none" });
    setGeneration((value) => value + 1);
    dialogOpen.current = true;
  }, []);

  const openAdd = useCallback(
    (kind: EventKind) => {
      begin({ kind, date: null, detail: "" });
      setForm({ mode: "add" });
    },
    [begin],
  );

  const openEdit = useCallback(
    (event: EditableEvent) => {
      begin({ kind: event.kind, date: event.date, detail: event.detail ?? "" });
      setForm({ mode: "edit", event });
    },
    [begin],
  );

  function close() {
    dialogOpen.current = false;
    setForm({ mode: "closed" });
    setRemoving(null);
    // A closed form keeps no copy of what she typed.
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setDialogError(undefined);
  }

  /** A refusal: in the form while it is open, on the page once she closed it. */
  function refuse(text: string, refresh: boolean) {
    if (dialogOpen.current) setDialogError(text);
    else setOutcome({ kind: "failed", sentence: text });
    if (refresh) router.refresh();
  }

  async function save() {
    if (busy || form.mode === "closed") return;
    const invalid = validateEvent(draft);
    if (invalid !== null || draft.kind === null || draft.date === null) {
      setErrors(invalid ?? {});
      return;
    }
    const body = eventBody({ ...draft, kind: draft.kind, date: draft.date });
    setBusy(true);
    setErrors({});
    setDialogError(undefined);
    const client = browserApiClient();
    const result =
      form.mode === "add"
        ? await answer(() =>
            client.POST("/api/v1/pregnancies/{id}/events", {
              params: { path: { id: pregnancyId } },
              body,
              headers: { "Idempotency-Key": keys.current(body) },
            }),
          )
        : await answer(() =>
            client.PUT("/api/v1/pregnancies/{id}/events/{eventId}", {
              params: {
                path: { id: pregnancyId, eventId: form.event.id },
                header: { "if-match": String(form.event.version) },
              },
              body,
            }),
          );
    setBusy(false);
    if (result.status === 200 || result.status === 201) {
      close();
      setOutcome({ kind: "done", sentence: copy.event.saved(body.date) });
      router.refresh();
      return;
    }
    const failure = eventFailure(result.status, result.problem);
    if (failure.kind === "signed-out" || failure.kind === "fresh-auth") return leaveForSignIn();
    if (failure.kind === "fields") {
      if (dialogOpen.current) setErrors(failure.errors);
      else refuse(copy.event.errors.failed, false);
      return;
    }
    refuse(failure.text, failure.refresh);
  }

  function askRemove() {
    if (form.mode !== "edit") return;
    // The form closes and the confirmation opens in its own dialog, which takes the focus.
    const event = form.event;
    setForm({ mode: "closed" });
    setDialogError(undefined);
    setRemoving(event);
  }

  async function remove() {
    if (busy || removing === null) return;
    setBusy(true);
    setDialogError(undefined);
    const event = removing;
    const result = await answer(() =>
      browserApiClient().DELETE("/api/v1/pregnancies/{id}/events/{eventId}", {
        params: {
          path: { id: pregnancyId, eventId: event.id },
          header: { "if-match": String(event.version) },
        },
      }),
    );
    setBusy(false);
    if (result.status === 204) {
      close();
      setOutcome({ kind: "done", sentence: copy.event.removed });
      router.refresh();
      return;
    }
    const failure = eventFailure(result.status, result.problem, "delete");
    if (failure.kind === "signed-out" || failure.kind === "fresh-auth") return leaveForSignIn();
    if (failure.kind === "fields") return refuse(copy.event.errors.removeFailed, false);
    refuse(failure.text, failure.refresh);
  }

  const editor = useMemo<Editor>(
    () => ({ openAdd, openEdit, outcome }),
    [openAdd, openEdit, outcome],
  );
  const kind: EventKind = draft.kind ?? "appointment";
  const title =
    form.mode === "edit" ? copy.event.editTitle[form.event.kind] : copy.event.addTitle[kind];

  return (
    <EditorContext.Provider value={editor}>
      {children}
      <Dialog
        open={form.mode !== "closed"}
        onClose={close}
        title={title}
        confirmLabel={copy.event.save}
        cancelLabel={copy.event.cancel}
        onConfirm={() => void save()}
        loading={busy && form.mode !== "closed"}
        pendingLabel={copy.event.saving}
        error={form.mode === "closed" ? undefined : dialogError}
      >
        <div ref={fields} key={generation} className={styles.fields}>
          <SegmentedControl<EventKind | "">
            label={copy.event.kindLabel}
            options={kinds}
            value={draft.kind ?? ""}
            onChange={(value) => setDraft((current) => ({ ...current, kind: value || null }))}
            error={errors.kind}
          />
          <SegmentedDateInput
            label={copy.event.dateLabel}
            order="mdy"
            required
            example={today}
            defaultValue={draft.date ?? undefined}
            onChange={(date) => setDraft((current) => ({ ...current, date }))}
            error={errors.date}
          />
          <FormField
            label={copy.event.detailLabel}
            help={copy.event.detailHelp}
            error={errors.detail}
          >
            {(control) => (
              <Textarea
                {...control}
                autoComplete="off"
                maxLength={DETAIL_MAX}
                value={draft.detail}
                onChange={(change) => {
                  const detail = change.target.value;
                  setDraft((current) => ({ ...current, detail }));
                }}
              />
            )}
          </FormField>
          {canDelete && form.mode === "edit" ? (
            <div className={styles.removeRow}>
              <Button variant="destructive" onClick={askRemove} disabled={busy}>
                {copy.event.remove[form.event.kind]}
              </Button>
            </div>
          ) : null}
        </div>
      </Dialog>
      <Dialog
        open={removing !== null}
        onClose={close}
        title={
          removing === null
            ? copy.event.removeTitle.appointment
            : copy.event.removeTitle[removing.kind]
        }
        variant="destructive"
        confirmLabel={copy.event.removeConfirm}
        cancelLabel={copy.event.keep}
        onConfirm={() => void remove()}
        loading={busy && removing !== null}
        pendingLabel={copy.event.removing}
        error={removing === null ? undefined : dialogError}
      >
        <p>{copy.event.removeBody}</p>
      </Dialog>
    </EditorContext.Provider>
  );
}

/** The two add buttons under a week list, and the outcome of the last save beside them. */
export function AddEventButtons() {
  const editor = useEditor();
  return (
    <div className={styles.addArea}>
      <div className={styles.addButtons}>
        <Button variant="secondary" icon="plus" onClick={() => editor.openAdd("appointment")}>
          {copy.add.appointment}
        </Button>
        <Button variant="secondary" icon="plus" onClick={() => editor.openAdd("milestone")}>
          {copy.add.milestone}
        </Button>
      </div>
      {editor.outcome.kind === "done" ? (
        <InlineFeedback tone="success" cue>
          {editor.outcome.sentence}
        </InlineFeedback>
      ) : null}
      {editor.outcome.kind === "failed" ? (
        <InlineFeedback tone="error" cue>
          {editor.outcome.sentence}
        </InlineFeedback>
      ) : null}
    </div>
  );
}

/** A row's Edit control; its accessible name says which row, since every row's reads "Edit". */
export function EditEventButton({ event }: { event: EditableEvent }) {
  const editor = useEditor();
  return (
    <Button
      variant="quiet"
      className={styles.edit}
      aria-label={copy.event.editName(event.title, event.date)}
      onClick={() => editor.openEdit(event)}
    >
      {copy.event.edit}
    </Button>
  );
}
