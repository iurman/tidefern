CREATE TYPE "public"."child_event_kind" AS ENUM('milestone', 'feed', 'sleep', 'diaper');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TABLE "child_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" "child_event_kind" NOT NULL,
	"date" date NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"milestone_id" text,
	"quantity_ml" integer,
	"note" "bytea",
	"kek_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "child_events_milestone_id_matches_kind" CHECK (("child_events"."kind" = 'milestone') = ("child_events"."milestone_id" is not null)),
	CONSTRAINT "child_events_span_is_ordered" CHECK ("child_events"."ended_at" is null or "child_events"."started_at" is null or "child_events"."ended_at" >= "child_events"."started_at"),
	CONSTRAINT "child_events_quantity_is_positive" CHECK ("child_events"."quantity_ml" is null or "child_events"."quantity_ml" > 0),
	CONSTRAINT "child_events_note_has_kek_version" CHECK (("child_events"."note" is null) = ("child_events"."kek_version" is null))
);
--> statement-breakpoint
ALTER TABLE "child_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "child_guardians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "child_measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"author_id" uuid,
	"date" date NOT NULL,
	"weight_grams" integer,
	"length_millimetres" integer,
	"head_millimetres" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "child_measurements_has_a_value" CHECK ("child_measurements"."weight_grams" is not null or "child_measurements"."length_millimetres" is not null or "child_measurements"."head_millimetres" is not null),
	CONSTRAINT "child_measurements_values_are_positive" CHECK (("child_measurements"."weight_grams" is null or "child_measurements"."weight_grams" > 0) and ("child_measurements"."length_millimetres" is null or "child_measurements"."length_millimetres" > 0) and ("child_measurements"."head_millimetres" is null or "child_measurements"."head_millimetres" > 0))
);
--> statement-breakpoint
ALTER TABLE "child_measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"sex" "sex",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "children" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "child_events" ADD CONSTRAINT "child_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_events" ADD CONSTRAINT "child_events_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_guardians" ADD CONSTRAINT "child_guardians_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_guardians" ADD CONSTRAINT "child_guardians_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_measurements" ADD CONSTRAINT "child_measurements_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_measurements" ADD CONSTRAINT "child_measurements_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "child_events_child_date_idx" ON "child_events" USING btree ("child_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "child_guardians_child_user_unique" ON "child_guardians" USING btree ("child_id","user_id");--> statement-breakpoint
CREATE INDEX "child_guardians_user_idx" ON "child_guardians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "child_measurements_child_date_idx" ON "child_measurements" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "children_household_idx" ON "children" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;