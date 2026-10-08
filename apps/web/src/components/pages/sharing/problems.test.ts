import { describe, expect, it } from "vitest";
import { sharingCopy as copy } from "./copy";
import {
  SIGN_IN_AGAIN_PATH,
  attempt,
  describeAcceptRefusal,
  describeChangeFailure,
  describeInviteFailure,
  describeRemoveFailure,
  describeWithdrawFailure,
  isCoGuardianRefusal,
  isStale,
  leaveFor,
  needsFreshSignIn,
  settledByServer,
  type ApiFailure,
} from "./problems";

function failure(status: number, detail?: string, code?: string): ApiFailure {
  return {
    ok: false,
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(code === undefined ? {} : { code }),
  };
}

describe("attempt", () => {
  it("passes a 2xx answer's data through", async () => {
    const result = await attempt(async () => ({
      data: { joined: true },
      response: new Response(null, { status: 200 }),
    }));
    expect(result).toEqual({ ok: true, data: { joined: true } });
  });

  it("flattens a problem to its status, code and detail", async () => {
    const result = await attempt(async () => ({
      error: { code: "conflict", detail: "stale_version", title: "Conflict", status: 409 },
      response: new Response(null, { status: 409 }),
    }));
    expect(result).toEqual({ ok: false, status: 409, code: "conflict", detail: "stale_version" });
  });

  it("answers status 0 when the request never got an answer", async () => {
    const result = await attempt(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ ok: false, status: 0 });
  });

  it("marks a refusal the API replayed from a stored idempotency row, which has no detail", async () => {
    const result = await attempt(async () => ({
      error: { code: "conflict", title: "Conflict", status: 409 },
      response: new Response(null, { status: 409, headers: { "Idempotency-Replayed": "true" } }),
    }));
    expect(result).toEqual({ ok: false, status: 409, code: "conflict", replayed: true });
  });
});

describe("settledByServer", () => {
  it("frees a key once the server answered, and keeps it while the answer is unknown or still running", () => {
    expect(settledByServer(failure(409, "household_choice_required"))).toBe(true);
    expect(settledByServer(failure(404))).toBe(true);
    expect(settledByServer(failure(429))).toBe(true);
    expect(settledByServer(failure(503))).toBe(true);
    expect(settledByServer(failure(0))).toBe(false);
    expect(settledByServer(failure(409, "idempotency_key_in_flight"))).toBe(false);
  });
});

describe("where a refusal sends the person", () => {
  it("keeps a fresh-sign-in refusal on the page with its next step", () => {
    const fresh = failure(401, "fresh_authentication_required", "unauthenticated");
    expect(needsFreshSignIn(fresh)).toBe(true);
    expect(leaveFor(fresh)).toBeNull();
    expect(SIGN_IN_AGAIN_PATH).toBe("/sign-in?next=%2Fsharing");
  });

  it("sends a lost session to sign in and a closing account to its locked view", () => {
    expect(leaveFor(failure(401, undefined, "unauthenticated"))).toBe("/sign-in");
    expect(leaveFor(failure(401, "account_closing", "unauthenticated"))).toBe("/closing");
    expect(leaveFor(failure(500))).toBeNull();
  });
});

describe("the sentences a failure gets", () => {
  it("says a stale page reads again, and what to do for anything else", () => {
    expect(isStale(failure(409, "stale_version"))).toBe(true);
    expect(isStale(failure(404))).toBe(true);
    expect(describeChangeFailure(failure(409, "stale_version"))).toBe(
      copy.failure.changedElsewhere,
    );
    expect(describeChangeFailure(failure(0))).toBe(copy.failure.offline);
    expect(describeChangeFailure(failure(429))).toBe(copy.failure.tooMany);
    expect(describeChangeFailure(failure(503))).toBe(copy.failure.server);
    expect(describeChangeFailure(failure(422))).toBe(copy.failure.save);
  });

  it("tells the co-guardian refusal apart from a removal that failed", () => {
    expect(isCoGuardianRefusal(failure(409, "co_guardianship_unresolved"))).toBe(true);
    expect(isCoGuardianRefusal(failure(409))).toBe(false);
    expect(describeRemoveFailure(failure(500), "Lena")).toBe(copy.failure.server);
    expect(describeRemoveFailure(failure(400), "Lena")).toBe(
      "We could not remove Lena. Try again.",
    );
  });

  it("names each refused invitation's reason", () => {
    expect(describeInviteFailure(failure(409, "invitation_pending"))).toBe(
      copy.invite.pendingAlready,
    );
    expect(describeInviteFailure(failure(409, "member_of_another_household"))).toBe(
      copy.invite.memberElsewhere,
    );
    expect(describeInviteFailure(failure(503, "mail_unavailable", "internal"))).toBe(
      copy.invite.mailUnavailable,
    );
    expect(describeInviteFailure(failure(422))).toBe(copy.invite.emailInvalid);
    expect(describeInviteFailure(failure(409))).toBe(copy.invite.failed);
  });

  it("says an invitation no longer open was already closed, without guessing why", () => {
    // Changed on purpose (review of PR #83): the API answers this 404 for an invitation
    // accepted, withdrawn elsewhere or expired alike, so the sentence no longer says expired.
    expect(describeWithdrawFailure(failure(404))).toBe(
      "This invitation was already closed, so there is nothing to withdraw. The page now shows the latest.",
    );
    expect(describeWithdrawFailure(failure(400))).toBe(copy.withdraw.failed);
  });

  it("gives the refusal for a member of someone else's household a next step", () => {
    expect(describeInviteFailure(failure(409, "member_of_another_household"))).toBe(
      "Only the person who started your household can invite people into it. Ask them to send the invitation.",
    );
  });

  it("answers one refusal for every invitation that cannot be used, and asks for a household choice", () => {
    expect(describeAcceptRefusal(failure(404))).toEqual({ kind: "not-open" });
    expect(describeAcceptRefusal(failure(422))).toEqual({ kind: "not-open" });
    expect(describeAcceptRefusal(failure(409, "household_choice_required"))).toEqual({
      kind: "choose",
    });
    expect(describeAcceptRefusal(failure(409, "household_owner_must_hand_over"))).toEqual({
      kind: "hand-over",
    });
    expect(describeAcceptRefusal(failure(0))).toEqual({
      kind: "failed",
      sentence: copy.failure.offline,
    });
    expect(describeAcceptRefusal(failure(409))).toEqual({
      kind: "failed",
      sentence: copy.accept.failed,
    });
  });
});
