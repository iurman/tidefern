CREATE TYPE "public"."data_request_kind" AS ENUM('export', 'closure', 'access', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."data_request_state" AS ENUM('requested', 'in_progress', 'completed', 'cancelled', 'refused');--> statement-breakpoint
CREATE TYPE "public"."idempotency_state" AS ENUM('in_flight', 'done');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."note_category" AS ENUM('journal.private', 'cycle.symptoms', 'pregnancy.overview');--> statement-breakpoint
CREATE TYPE "public"."photo_category" AS ENUM('pregnancy.photos', 'child');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."photo_variant_kind" AS ENUM('thumbnail', 'preview', 'full');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" "data_category",
	"child_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email_hmac" text,
	"kind" "data_request_kind" NOT NULL,
	"state" "data_request_state" DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"undo_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_requests_has_a_requester" CHECK ("data_requests"."user_id" is not null or "data_requests"."email_hmac" is not null),
	CONSTRAINT "data_requests_undo_is_for_closure" CHECK ("data_requests"."undo_until" is null or "data_requests"."kind" = 'closure'),
	CONSTRAINT "data_requests_completed_matches_state" CHECK (("data_requests"."state" in ('completed', 'cancelled', 'refused')) = ("data_requests"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "data_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "disclosures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"contact" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disclosures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" "idempotency_state" DEFAULT 'in_flight' NOT NULL,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"author_id" uuid,
	"category" "note_category" DEFAULT 'journal.private' NOT NULL,
	"date" date NOT NULL,
	"body" "bytea" NOT NULL,
	"kek_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photo_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"photo_id" uuid NOT NULL,
	"variant" "photo_variant_kind" NOT NULL,
	"object_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_length" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"child_id" uuid,
	"author_id" uuid,
	"category" "photo_category" NOT NULL,
	"status" "photo_status" DEFAULT 'pending' NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"width" integer,
	"height" integer,
	"caption" "bytea",
	"kek_version" text,
	"taken_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "photos_child_id_matches_category" CHECK (("photos"."category" = 'child') = ("photos"."child_id" is not null)),
	CONSTRAINT "photos_caption_has_kek_version" CHECK (("photos"."caption" is null) = ("photos"."kek_version" is null)),
	CONSTRAINT "photos_byte_length_is_positive" CHECK ("photos"."byte_length" > 0)
);
--> statement-breakpoint
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"name" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_events_count_is_not_negative" CHECK ("product_events"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_variants" ADD CONSTRAINT "photo_variants_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_subject_created_idx" ON "audit_events" USING btree ("subject_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_occurred_idx" ON "audit_events" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_dedupe_key_unique" ON "audit_events" USING btree ("dedupe_key") WHERE "audit_events"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "data_requests_user_idx" ON "data_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_requests_state_deadline_idx" ON "data_requests" USING btree ("state","deadline_at");--> statement-breakpoint
CREATE INDEX "disclosures_user_idx" ON "disclosures" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_actor_key_unique" ON "idempotency_keys" USING btree ("actor_id","key");--> statement-breakpoint
CREATE INDEX "jobs_status_run_after_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "notes_subject_date_idx" ON "notes" USING btree ("subject_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_variants_photo_variant_unique" ON "photo_variants" USING btree ("photo_id","variant");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_variants_object_key_unique" ON "photo_variants" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_object_key_unique" ON "photos" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "photos_subject_created_idx" ON "photos" USING btree ("subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_events_day_name_unique" ON "product_events" USING btree ("day","name");