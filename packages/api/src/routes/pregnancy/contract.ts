import { createRoute, z } from "@hono/zod-openapi";
import {
  CalendarDate,
  DueDateChangeList,
  Id,
  Pregnancy,
  PregnancyDatingInput,
  PregnancyEndInput,
  PregnancyEvent,
  PregnancyEventInput,
  PregnancyEventList,
  PregnancyEventUpdate,
  PregnancyStartInput,
  PregnancyView,
  Problem,
} from "@tidefern/schemas";

import { requireActor, requireFreshAuth } from "../../auth";

/**
 * The route definitions of the pregnancy area (architecture 5.1): the
 * schemas come from packages/schemas, so the committed OpenAPI document is
 * generated from the same objects that validate requests. Only ids and
 * dates ever appear in a path or a query string.
 */

const tags = ["pregnancy"];

function problemResponse(description: string) {
  return { description, content: { "application/problem+json": { schema: Problem } } };
}

const noSession = problemResponse("No session");
const notFound = problemResponse(
  "No such pregnancy the actor may see; denial is not distinguished",
);
const invalid = problemResponse("Validation failed; field errors name the input");
const conflict = problemResponse("The If-Match version is stale, or the record's state refuses it");

const IdParam = z.object({ id: Id });
const EventParams = z.object({ id: Id, eventId: Id });

/** Updates take the version the client last read; a stale one answers 409 (architecture 5.1). */
const IfMatch = z.object({
  "if-match": z
    .string()
    .regex(/^[1-9]\d*$/, "Expected the row version")
    .openapi({
      description: "The version the client last read; the answer is 409 when it is stale",
    }),
});

/** Lists page with an opaque cursor and a limit of 1 to 200, default 50. */
const Paging = {
  cursor: z.string().optional().openapi({ description: "The nextCursor of the previous page" }),
  limit: z.coerce.number().int().min(1).max(200).default(50),
};

export const startRoute = createRoute({
  method: "post",
  path: "/v1/pregnancies",
  tags,
  summary: "Start a pregnancy",
  description:
    "Creates the signed-in subject's pregnancy from a dating method and its input; the due date is computed on the server and the profile stage moves to pregnancy. One open pregnancy per subject.",
  middleware: [requireActor] as const,
  request: { body: { content: { "application/json": { schema: PregnancyStartInput } } } },
  responses: {
    201: { description: "The pregnancy", content: { "application/json": { schema: Pregnancy } } },
    401: noSession,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

export const currentRoute = createRoute({
  method: "get",
  path: "/v1/pregnancies/current",
  tags,
  summary: "The current pregnancy",
  description:
    "The most recent pregnancy of the actor, or of a subject the actor holds a pregnancy.overview grant for. A grantee sees the week and the due date while it continues and a paused state once it has ended.",
  middleware: [requireActor] as const,
  request: {
    query: z.object({
      subject: Id.optional().openapi({
        description: "Whose pregnancy; the actor's own when absent",
      }),
    }),
  },
  responses: {
    200: {
      description: "The pregnancy",
      content: { "application/json": { schema: PregnancyView } },
    },
    401: noSession,
    404: notFound,
    422: invalid,
  },
});

/** The resource a start's `Location` names (and E1's idempotent replay of it). */
export const pregnancyRoute = createRoute({
  method: "get",
  path: "/v1/pregnancies/{id}",
  tags,
  summary: "One pregnancy",
  description:
    "A pregnancy by id: her whole record, or for a pregnancy.overview grantee the week and the due date while it continues and a paused state once it has ended.",
  middleware: [requireActor] as const,
  request: { params: IdParam },
  responses: {
    200: {
      description: "The pregnancy",
      content: { "application/json": { schema: PregnancyView } },
    },
    401: noSession,
    404: notFound,
    422: invalid,
  },
});

export const datingRoute = createRoute({
  method: "put",
  path: "/v1/pregnancies/{id}/dating",
  tags,
  summary: "Change the due date",
  description:
    "Replaces the due date from a new dating input and appends the change to the history she alone reads. The same date by the same method changes nothing, and the same date by another method changes only the method. A scan replaces a due date set from the last period only when the discrepancy passes the ACOG CO 700 band for the scan's gestational age; inside the band the answer is the unchanged pregnancy.",
  middleware: [requireActor] as const,
  request: {
    params: IdParam,
    headers: IfMatch,
    body: { content: { "application/json": { schema: PregnancyDatingInput } } },
  },
  responses: {
    200: {
      description: "The pregnancy",
      content: { "application/json": { schema: PregnancyView } },
    },
    401: noSession,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

export const datingHistoryRoute = createRoute({
  method: "get",
  path: "/v1/pregnancies/{id}/dating-history",
  tags,
  summary: "The due date history",
  description: "Every change of the due date, oldest first. Visible to the subject only.",
  middleware: [requireActor] as const,
  request: { params: IdParam, query: z.object(Paging) },
  responses: {
    200: {
      description: "The changes",
      content: { "application/json": { schema: DueDateChangeList } },
    },
    401: noSession,
    404: notFound,
    422: invalid,
  },
});

export const createEventRoute = createRoute({
  method: "post",
  path: "/v1/pregnancies/{id}/events",
  tags,
  summary: "Add an appointment or milestone",
  description:
    "Adds an event. The detail is free text and is stored encrypted under the subject's key; a contributor's event is still hers.",
  middleware: [requireActor] as const,
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: PregnancyEventInput } } },
  },
  responses: {
    201: { description: "The event", content: { "application/json": { schema: PregnancyEvent } } },
    401: noSession,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

export const listEventsRoute = createRoute({
  method: "get",
  path: "/v1/pregnancies/{id}/events",
  tags,
  summary: "List appointments and milestones",
  description:
    "Events by date, oldest first. With updatedSince the list is a sync feed that includes tombstones. A summary grantee sees kinds and dates without the detail.",
  middleware: [requireActor] as const,
  request: {
    params: IdParam,
    query: z.object({
      from: CalendarDate.optional(),
      to: CalendarDate.optional(),
      updatedSince: z.iso.datetime().optional(),
      ...Paging,
    }),
  },
  responses: {
    200: {
      description: "The events",
      content: { "application/json": { schema: PregnancyEventList } },
    },
    401: noSession,
    404: notFound,
    422: invalid,
  },
});

/** The resource an event create's `Location` names. */
export const eventRoute = createRoute({
  method: "get",
  path: "/v1/pregnancies/{id}/events/{eventId}",
  tags,
  summary: "One appointment or milestone",
  description:
    "An event by id. A summary grantee sees the kind and the date without the detail; once the pregnancy has ended a grantee sees no event.",
  middleware: [requireActor] as const,
  request: { params: EventParams },
  responses: {
    200: { description: "The event", content: { "application/json": { schema: PregnancyEvent } } },
    401: noSession,
    404: notFound,
    422: invalid,
  },
});

export const updateEventRoute = createRoute({
  method: "put",
  path: "/v1/pregnancies/{id}/events/{eventId}",
  tags,
  summary: "Replace an event",
  middleware: [requireActor] as const,
  request: {
    params: EventParams,
    headers: IfMatch,
    body: { content: { "application/json": { schema: PregnancyEventUpdate } } },
  },
  responses: {
    200: { description: "The event", content: { "application/json": { schema: PregnancyEvent } } },
    401: noSession,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

export const deleteEventRoute = createRoute({
  method: "delete",
  path: "/v1/pregnancies/{id}/events/{eventId}",
  tags,
  summary: "Delete an event",
  description: "Leaves a content-free tombstone for syncing clients. The subject only.",
  middleware: [requireActor] as const,
  request: { params: EventParams, headers: IfMatch },
  responses: {
    204: { description: "Deleted" },
    401: noSession,
    404: notFound,
    409: conflict,
    422: invalid,
  },
});

export const endRoute = createRoute({
  method: "post",
  path: "/v1/pregnancies/{id}/end",
  tags,
  summary: "End a pregnancy",
  description:
    "Records the ending day and the reason, which is shown to nobody but her. The stage moves per the reason, predictions are cleared and queued reminders are cancelled; every grantee's view becomes paused with no notification. Needs a fresh authentication.",
  middleware: [requireActor, requireFreshAuth()] as const,
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: PregnancyEndInput } } },
  },
  responses: {
    200: { description: "The pregnancy", content: { "application/json": { schema: Pregnancy } } },
    401: problemResponse(
      "No session, or the session is older than the fresh authentication window",
    ),
    404: notFound,
    409: conflict,
    422: invalid,
  },
});
