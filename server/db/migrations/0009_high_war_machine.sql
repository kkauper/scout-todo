CREATE TYPE "public"."time_entry_source" AS ENUM('timer', 'manual');--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "source" time_entry_source DEFAULT 'timer' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "original_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "original_ended_at" timestamp with time zone;