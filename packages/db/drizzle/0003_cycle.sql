CREATE TYPE "public"."flow_level" AS ENUM('none', 'spotting', 'light', 'medium', 'heavy');--> statement-breakpoint
CREATE TYPE "public"."mood_code" AS ENUM('low', 'steady', 'bright');--> statement-breakpoint
CREATE TYPE "public"."prediction_basis" AS ENUM('first_guess', 'estimate', 'not_enough_regular_cycles');--> statement-breakpoint
CREATE TYPE "public"."symptom_code" AS ENUM('cramps', 'headache', 'bloating', 'fatigue', 'tender_breasts', 'nausea', 'backache', 'acne', 'cravings', 'insomnia', 'spotting', 'discharge', 'hot_flashes', 'dizziness', 'mood_swings', 'anxiety', 'low_energy', 'high_energy', 'other');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_kind" AS ENUM('flow', 'symptom', 'mood');--> statement-breakpoint
CREATE TABLE "cycle_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"date" date NOT NULL,
	"flow" "flow_level",
	"mood" "mood_code",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cycle_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cycle_predictions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"basis" "prediction_basis" NOT NULL,
	"cycle_length" smallint,
	"sample_size" smallint DEFAULT 0 NOT NULL,
	"next_period_start" date,
	"ovulation" date,
	"fertile_window_start" date,
	"fertile_window_end" date,
	"uncertainty_days" smallint NOT NULL,
	"ovulation_band_days" smallint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cycle_predictions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entry_symptoms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"code" "symptom_code" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "entry_symptoms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"kind" "vocabulary_kind" NOT NULL,
	"code" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_pkey" PRIMARY KEY("kind","code")
);
--> statement-breakpoint
ALTER TABLE "cycle_entries" ADD CONSTRAINT "cycle_entries_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_predictions" ADD CONSTRAINT "cycle_predictions_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_symptoms" ADD CONSTRAINT "entry_symptoms_entry_id_cycle_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cycle_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_symptoms" ADD CONSTRAINT "entry_symptoms_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_entries_subject_date_unique" ON "cycle_entries" USING btree ("subject_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_predictions_subject_live_unique" ON "cycle_predictions" USING btree ("subject_id") WHERE "cycle_predictions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_symptoms_entry_code_unique" ON "entry_symptoms" USING btree ("entry_id","code");--> statement-breakpoint
CREATE INDEX "entry_symptoms_subject_idx" ON "entry_symptoms" USING btree ("subject_id");