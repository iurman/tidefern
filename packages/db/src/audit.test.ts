import { ActivityAction } from "@tidefern/schemas";
import { describe, expect, test } from "vitest";

import { auditActionNames, auditActions, isAuditAction } from "./audit";
import { dataCategoryValues } from "./schema/enums";

describe("the audit vocabulary", () => {
  test("holds the names the API, the session hooks and the activity view share", () => {
    expect(auditActionNames).toEqual([
      "partner.read",
      "partner.write",
      "grant.create",
      "grant.update",
      "grant.revoke",
      "note.share",
      "invitation.create",
      "invitation.withdraw",
      "invitation.accept",
      "export.create",
      "account.close",
      "account.close.undo",
      "session.sign_in",
      "session.revoke",
    ]);
    expect(auditActions.sessionSignIn).toBe("session.sign_in");
    expect(auditActions.sessionRevoke).toBe("session.revoke");
  });

  test("gives every name once", () => {
    expect(new Set(auditActionNames).size).toBe(auditActionNames.length);
  });

  test("keeps the activity response's action schema in step: it accepts every name", () => {
    for (const name of auditActionNames) {
      expect(ActivityAction.safeParse(name).success, name).toBe(true);
    }
  });

  test("never puts a category in a name; the category column carries it", () => {
    for (const name of auditActionNames) {
      for (const category of dataCategoryValues) {
        expect(name, name).not.toContain(category);
      }
    }
  });

  test("tells its own names from anything else", () => {
    for (const name of auditActionNames) expect(isAuditAction(name)).toBe(true);
    // Signing yourself out has no name on purpose (task C7): nothing is written.
    for (const name of ["session.end", "note.peek", "", "Session.Sign_In", "session.sign_in "]) {
      expect(isAuditAction(name), name).toBe(false);
    }
  });
});
