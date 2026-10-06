CREATE TYPE "public"."child_event_side" AS ENUM('left', 'right', 'both');--> statement-breakpoint
ALTER TABLE "child_events" ADD COLUMN "side" "child_event_side";--> statement-breakpoint
CREATE UNIQUE INDEX "data_requests_open_closure_unique" ON "data_requests" USING btree ("user_id") WHERE "data_requests"."kind" = 'closure' and "data_requests"."state" in ('requested', 'in_progress');--> statement-breakpoint
ALTER TABLE "child_events" ADD CONSTRAINT "child_events_side_is_for_feed" CHECK ("child_events"."side" is null or "child_events"."kind" = 'feed');