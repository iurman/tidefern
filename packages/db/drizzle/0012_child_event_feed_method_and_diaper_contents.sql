CREATE TYPE "public"."child_event_diaper_contents" AS ENUM('wet', 'dirty', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."child_event_feed_method" AS ENUM('breast', 'bottle', 'solids');--> statement-breakpoint
ALTER TABLE "child_events" ADD COLUMN "feed_method" "child_event_feed_method";--> statement-breakpoint
ALTER TABLE "child_events" ADD COLUMN "diaper_contents" "child_event_diaper_contents";--> statement-breakpoint
ALTER TABLE "child_events" ADD CONSTRAINT "child_events_feed_method_is_for_feed" CHECK ("child_events"."feed_method" is null or "child_events"."kind" = 'feed');--> statement-breakpoint
ALTER TABLE "child_events" ADD CONSTRAINT "child_events_diaper_contents_is_for_diaper" CHECK ("child_events"."diaper_contents" is null or "child_events"."kind" = 'diaper');