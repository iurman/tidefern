/**
 * The neutral action names the audit log holds (architecture 7.4 and 8.3
 * step 6). A read of a shared category by someone other than the subject, a
 * write by such a partner, every change to a grant, and the sign-ins and
 * device sign-outs Better Auth reports. The list lives here, beside the
 * `audit_events` table, because two packages write the log: the API's
 * `audit()` and the session hooks in packages/auth (task C7), which cannot
 * import the API. The API re-exports it, and the activity view reads the
 * same names back. The set grows with the tasks; a name never carries a
 * category or a fact, the columns do. `action` is text, so a new name needs
 * no migration.
 */
export const auditActions = {
  partnerRead: "partner.read",
  partnerWrite: "partner.write",
  grantCreate: "grant.create",
  grantUpdate: "grant.update",
  grantRevoke: "grant.revoke",
  noteShare: "note.share",
  // Sharing (task E7): an invitation sent, withdrawn or accepted. The
  // subject is the actor herself; the activity view lists them with grants.
  invitationCreate: "invitation.create",
  invitationWithdraw: "invitation.withdraw",
  invitationAccept: "invitation.accept",
  /** The person streamed an export of her own data (task E8). */
  exportCreate: "export.create",
  /** The person asked to close her account; every other session and every grant went with it (task E8). */
  accountClose: "account.close",
  /** The person cancelled the closure inside its undo window (task E8). */
  accountCloseUndo: "account.close.undo",
  /**
   * Better Auth gave a person a session she did not already hold on that
   * request: a password, passkey or second-factor sign-in (task C7). A
   * session rotated for someone already signed in is not one.
   */
  sessionSignIn: "session.sign_in",
  /**
   * The person signed out one or more of her other devices, one row per
   * action however many went (task C7). Signing out the device she is
   * using writes nothing.
   */
  sessionRevoke: "session.revoke",
} as const;

export type AuditAction = (typeof auditActions)[keyof typeof auditActions];

/** Every name in the vocabulary, in the order above. */
export const auditActionNames: readonly AuditAction[] = Object.values(auditActions);

const NAMES: ReadonlySet<string> = new Set(auditActionNames);

/** Whether `name` belongs to the vocabulary; writers refuse anything else. */
export function isAuditAction(name: string): name is AuditAction {
  return NAMES.has(name);
}
