CREATE TYPE "public"."dating_method" AS ENUM('lmp', 'ultrasound', 'transfer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ended_reason" AS ENUM('birth', 'loss', 'other');--> statement-breakpoint
CREATE TYPE "public"."pregnancy_event_kind" AS ENUM('appointment', 'milestone');--> statement-breakpoint
CREATE TABLE "due_date_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pregnancy_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"previous_due_date" date NOT NULL,
	"next_due_date" date NOT NULL,
	"method" "dating_method" NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "due_date_changes_is_a_change" CHECK ("due_date_changes"."previous_due_date" <> "due_date_changes"."next_due_date")
);
--> statement-breakpoint
ALTER TABLE "due_date_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pregnancies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"dating_method" "dating_method" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" date,
	"ended_reason" "ended_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pregnancies_ended_reason_matches_ended_at" CHECK (("pregnancies"."ended_at" is null) = ("pregnancies"."ended_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "pregnancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pregnancy_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pregnancy_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" "pregnancy_event_kind" NOT NULL,
	"date" date NOT NULL,
	"label" "bytea",
	"kek_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pregnancy_events_label_has_kek_version" CHECK (("pregnancy_events"."label" is null) = ("pregnancy_events"."kek_version" is null))
);
--> statement-breakpoint
ALTER TABLE "pregnancy_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "due_date_changes" ADD CONSTRAINT "due_date_changes_pregnancy_id_pregnancies_id_fk" FOREIGN KEY ("pregnancy_id") REFERENCES "public"."pregnancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_date_changes" ADD CONSTRAINT "due_date_changes_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_events" ADD CONSTRAINT "pregnancy_events_pregnancy_id_pregnancies_id_fk" FOREIGN KEY ("pregnancy_id") REFERENCES "public"."pregnancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_events" ADD CONSTRAINT "pregnancy_events_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_events" ADD CONSTRAINT "pregnancy_events_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "due_date_changes_pregnancy_idx" ON "due_date_changes" USING btree ("pregnancy_id","changed_at");--> statement-breakpoint
CREATE INDEX "pregnancies_subject_idx" ON "pregnancies" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pregnancies_subject_open_unique" ON "pregnancies" USING btree ("subject_id") WHERE "pregnancies"."ended_at" is null and "pregnancies"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pregnancy_events_pregnancy_date_idx" ON "pregnancy_events" USING btree ("pregnancy_id","date");--> statement-breakpoint
CREATE INDEX "pregnancy_events_subject_idx" ON "pregnancy_events" USING btree ("subject_id");