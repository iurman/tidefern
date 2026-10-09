import type { ApiClient } from "@tidefern/api-client";
import { TERMS_VERSION, childConsentTextVersions } from "@tidefern/schemas/constants";
import type {
  ChildConsentTextVersion,
  DataCategory,
  FlowLevel,
  PregnancyDatingInput,
  Stage,
} from "@tidefern/schemas";
import { currentConsentVersion } from "./consent";
import type { FailureCause, WriteId } from "./copy";

export type { FailureCause, WriteId };

/**
 * The writes the consent step makes, in the order the brief rules: the
 * consent, then the profile (with the age attestation), then the facts her
 * stage gave. Nothing about her body is stored before she consents, and "a
 * profile exists" stays the one sign that onboarding is done, which is what
 * the (app) layout tests before it sends her here.
 *
 * Every write survives a retry without a duplicate. A POST carries the
 * `Idempotency-Key` and, where the route takes one, the record id the page
 * minted once for that body (architecture 5.3), so a second try is replayed
 * or answers that the record is there; a PUT replaces the same values. The
 * page keeps the keys; this module only sends them.
 */

/** What stops a write: why, the HTTP status (0 when no answer came) and the problem's detail. */
export interface WriteFailure {
  cause: FailureCause;
  status: number;
  detail?: string;
}

export type WriteOutcome = { ok: true } | { ok: false; failure: WriteFailure };

const DONE: WriteOutcome = { ok: true };

/** The order of the writes for a stage and the facts she gave. */
export function planWrites(input: {
  stage: Stage;
  consent: boolean;
  start: boolean;
  since: boolean;
}): WriteId[] {
  const plan: WriteId[] = [];
  if (input.consent) plan.push("consent");
  plan.push("profile");
  if (input.stage === "cycle" && input.start) plan.push("start");
  if (input.stage === "pregnancy") plan.push("pregnancy");
  if (input.stage === "postpartum") {
    plan.push("child");
    if (input.since) plan.push("since");
  }
  return plan;
}

/** Why a status stops a write. A 403 is the cross-site check or a refused session: Try again cannot fix it either. */
export function causeOf(status: number): FailureCause {
  if (status === 0) return "network";
  if (status === 401) return "session";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  return "refused";
}

/** The `detail` of an RFC 9457 problem body, when it has one. */
export function detailOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("detail" in body)) return undefined;
  const detail = (body as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail : undefined;
}

function failure(status: number, body?: unknown): WriteOutcome {
  const detail = detailOf(body);
  return {
    ok: false,
    failure:
      detail === undefined
        ? { cause: causeOf(status), status }
        : { cause: causeOf(status), status, detail },
  };
}

interface Answer {
  status: number;
  body: unknown;
}

/** One request's status and body; a request that never got an answer is status 0. */
async function answer(
  request: Promise<{ data?: unknown; error?: unknown; response: Response }>,
): Promise<Answer> {
  try {
    const { data, error, response } = await request;
    return { status: response.status, body: data ?? error };
  } catch {
    return { status: 0, body: undefined };
  }
}

/**
 * POST /v1/me/consents: the categories the record listed, the consent text
 * version it showed and the terms version accepted beside it. The server
 * writes the catalog's own sentences and hashes the disclosure; a replay of
 * the same key answers the record's id only, which is all the page needs.
 */
export async function recordConsent(
  client: ApiClient,
  input: { categories: readonly DataCategory[]; key: string },
): Promise<WriteOutcome> {
  const sent = await answer(
    client.POST("/api/v1/me/consents", {
      params: { header: { "idempotency-key": input.key } },
      body: {
        categories: [...input.categories],
        textVersion: currentConsentVersion(),
        termsVersion: TERMS_VERSION,
      },
    }),
  );
  return sent.status === 201 ? DONE : failure(sent.status, sent.body);
}

export interface ProfileBody {
  displayName: string | null;
  timeZone: string;
  stage: Stage;
  weekStart: number;
}

/** The detail E2 answers a PUT with when a profile exists and the request named no version. */
const IF_MATCH_REQUIRED = "if_match_required";

/** The fields of a profile read back, when the body has them. */
interface SavedProfile extends ProfileBody {
  version: number;
}

function savedProfile(body: unknown): SavedProfile | null {
  if (typeof body !== "object" || body === null) return null;
  const read = body as Partial<Record<keyof SavedProfile, unknown>>;
  if (
    typeof read.version !== "number" ||
    typeof read.timeZone !== "string" ||
    typeof read.stage !== "string" ||
    typeof read.weekStart !== "number" ||
    !(typeof read.displayName === "string" || read.displayName === null)
  ) {
    return null;
  }
  return read as SavedProfile;
}

/** Whether the profile read back holds what she chose this time. */
export function profileMatches(saved: ProfileBody, body: ProfileBody): boolean {
  return (
    saved.timeZone === body.timeZone &&
    saved.stage === body.stage &&
    saved.weekStart === body.weekStart &&
    saved.displayName === body.displayName
  );
}

/**
 * What every profile write from this page carries beside her choices: the
 * age attestation and the terms version she accepted. Both are ticked on the
 * agreement step on every path, the here-for-someone-else one included,
 * where no consent is asked and so no consent record carries the terms.
 */
const AGREED = { ageAttested: true, termsVersion: TERMS_VERSION } as const;

/**
 * PUT /v1/me/profile, creating it with the age attestation and the terms
 * version accepted. A retry after a
 * create whose answer never arrived meets a profile that exists: the API
 * then asks for its version (`if_match_required`), so the page reads the
 * profile once. When it holds what she chose, the write is done instead of
 * failing on its own success. When she went Back and changed her zone or
 * stage in between, the page replaces it once with the version it read, so
 * the saved profile follows her latest choice rather than the one she undid.
 */
export async function createProfile(client: ApiClient, body: ProfileBody): Promise<WriteOutcome> {
  const sent = await answer(client.PUT("/api/v1/me/profile", { body: { ...body, ...AGREED } }));
  if (sent.status === 200 || sent.status === 201) return DONE;
  if (sent.status !== 422 || detailOf(sent.body) !== IF_MATCH_REQUIRED) {
    return failure(sent.status, sent.body);
  }
  const read = await answer(client.GET("/api/v1/me/profile"));
  if (read.status !== 200) return failure(read.status, read.body);
  const saved = savedProfile(read.body);
  if (saved === null) return failure(read.status, read.body);
  if (profileMatches(saved, body)) return DONE;
  const replaced = await answer(
    client.PUT("/api/v1/me/profile", {
      params: { header: { "if-match": String(saved.version) } },
      body: { ...body, ...AGREED },
    }),
  );
  return replaced.status === 200 ? DONE : failure(replaced.status, replaced.body);
}

/**
 * PUT /v1/cycle/entries/{date}: a period day is a day whose flow is light,
 * medium or heavy (the API has no period flag). The date travels in the
 * path, which is allowed; the flow in the body. A retry writes the same.
 */
export async function writePeriodDay(
  client: ApiClient,
  input: { date: string; flow: FlowLevel },
): Promise<WriteOutcome> {
  const sent = await answer(
    client.PUT("/api/v1/cycle/entries/{date}", {
      params: { path: { date: input.date } },
      body: { flow: input.flow },
    }),
  );
  return sent.status === 200 ? DONE : failure(sent.status, sent.body);
}

/** E4's details for a pregnancy that is already there: this page's own earlier try, or another tab's. */
const PREGNANCY_THERE = new Set(["pregnancy_open", "id_in_use"]);

/**
 * POST /v1/pregnancies with the id and key minted once for this dating. A
 * 409 that says a pregnancy is open, or that the id is taken, means the
 * first try landed: the record exists and the page moves on.
 */
export async function startPregnancy(
  client: ApiClient,
  input: { id: string; key: string; dating: PregnancyDatingInput },
): Promise<WriteOutcome> {
  const sent = await answer(
    client.POST("/api/v1/pregnancies", {
      headers: { "Idempotency-Key": input.key },
      body: { id: input.id, dating: input.dating },
    }),
  );
  if (sent.status === 201) return DONE;
  if (sent.status === 409 && PREGNANCY_THERE.has(detailOf(sent.body) ?? "")) return DONE;
  return failure(sent.status, sent.body);
}

/** The guardian consent text version the form showed: the newest (E12). */
export function currentChildConsentVersion(): ChildConsentTextVersion {
  const version = childConsentTextVersions[childConsentTextVersions.length - 1];
  if (version === undefined) throw new Error("the guardian consent catalog has no version");
  return version;
}

/**
 * POST /v1/children with the id and key minted once for this child and the
 * guardian's consent on the child's behalf (E12), which the API records in
 * the same transaction. A 409 for the id means the first try landed.
 */
export async function addChild(
  client: ApiClient,
  input: { id: string; key: string; displayName: string; dateOfBirth: string },
): Promise<WriteOutcome> {
  const sent = await answer(
    client.POST("/api/v1/children", {
      headers: { "Idempotency-Key": input.key },
      body: {
        id: input.id,
        displayName: input.displayName,
        dateOfBirth: input.dateOfBirth,
        guardianConsent: { given: true, textVersion: currentChildConsentVersion() },
      },
    }),
  );
  if (sent.status === 201) return DONE;
  if (sent.status === 409 && detailOf(sent.body) === "id_in_use") return DONE;
  return failure(sent.status, sent.body);
}
