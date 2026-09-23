CREATE TYPE "public"."column_kind" AS ENUM('open', 'active', 'done');--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "column_kind" NOT NULL,
	"position" double precision DEFAULT 1000 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_state" text
);
--> statement-breakpoint
INSERT INTO "board_columns" ("name", "kind", "position", "legacy_state") VALUES
	('Backlog', 'open', 1000, 'backlog'),
	('To do', 'open', 2000, 'todo'),
	('In progress', 'active', 3000, 'in_progress'),
	('Review', 'active', 4000, 'review'),
	('Done', 'done', 5000, 'done');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "column_id" uuid;--> statement-breakpoint
UPDATE "tasks" t SET "column_id" = c."id" FROM "board_columns" c WHERE c."legacy_state" = t."state"::text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "column_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_column_id_position_idx" ON "tasks" USING btree ("column_id","position");--> statement-breakpoint
ALTER TABLE "task_state_events" ADD COLUMN "from_column_id" uuid;--> statement-breakpoint
ALTER TABLE "task_state_events" ADD COLUMN "to_column_id" uuid;--> statement-breakpoint
ALTER TABLE "task_state_events" ADD COLUMN "to_kind" "column_kind";--> statement-breakpoint
UPDATE "task_state_events" e SET "from_column_id" = fc."id" FROM "board_columns" fc WHERE e."from_state" IS NOT NULL AND fc."legacy_state" = e."from_state"::text;--> statement-breakpoint
UPDATE "task_state_events" e SET "to_column_id" = tc."id", "to_kind" = tc."kind" FROM "board_columns" tc WHERE tc."legacy_state" = e."to_state"::text;--> statement-breakpoint
ALTER TABLE "task_state_events" ALTER COLUMN "to_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "task_state_events" ADD CONSTRAINT "task_state_events_from_column_id_board_columns_id_fk" FOREIGN KEY ("from_column_id") REFERENCES "public"."board_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_state_events" ADD CONSTRAINT "task_state_events_to_column_id_board_columns_id_fk" FOREIGN KEY ("to_column_id") REFERENCES "public"."board_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX "tasks_state_position_idx";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "task_state_events" DROP COLUMN "from_state";--> statement-breakpoint
ALTER TABLE "task_state_events" DROP COLUMN "to_state";--> statement-breakpoint
DROP TYPE "public"."task_state";--> statement-breakpoint
ALTER TABLE "board_columns" DROP COLUMN "legacy_state";
