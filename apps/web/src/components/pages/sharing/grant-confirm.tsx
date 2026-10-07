"use client";
import { Dialog } from "@/components/ui/dialog";
import { grantLevelText } from "@/components/ui/grant-row";
import { personGrantCopy } from "@/components/ui/person-card";
import { grantPhrase, sharingCopy } from "./copy";
import type { GrantView } from "./people";
import styles from "./sharing.module.css";

const copy = sharingCopy.grant;

export interface GrantConfirmTarget {
  personName: string;
  row: GrantView;
}

export interface GrantConfirmProps {
  open: boolean;
  /** What the step is about; kept while the dialog closes so its words do not change mid-close. */
  target: GrantConfirmTarget | null;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  /** Says what to do next when the change failed; the step stays open to try again. */
  error?: string;
}

/**
 * The confirm step before a category is turned on (DESIGN.md 5.2): the
 * person it is for, the category's plain description word for word, and
 * the level it grants. Turning a category off never comes here: that is one
 * step on the switch itself.
 */
export function GrantConfirm({
  open,
  target,
  onClose,
  onConfirm,
  loading = false,
  error,
}: GrantConfirmProps) {
  const words = target ? personGrantCopy(target.row) : null;
  return (
    <Dialog
      open={open && target !== null}
      onClose={onClose}
      title={
        target
          ? copy.title(grantPhrase(target.row.category, target.row.childName), target.personName)
          : ""
      }
      confirmLabel={target ? copy.confirm(target.personName) : undefined}
      cancelLabel={copy.cancel}
      pendingLabel={copy.pending}
      onConfirm={onConfirm}
      loading={loading}
      error={error}
    >
      {target && words ? (
        <>
          <p className={styles.quoted}>{words.description}</p>
          <p className={styles.levelLine}>{grantLevelText(target.row.offer)}</p>
        </>
      ) : null}
    </Dialog>
  );
}
