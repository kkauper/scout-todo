CREATE TYPE "public"."task_link_type" AS ENUM('blocks', 'relates', 'duplicates');--> statement-breakpoint
CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_task_id" uuid NOT NULL,
	"to_task_id" uuid NOT NULL,
	"type" "task_link_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_no_self" CHECK ("task_links"."from_task_id" <> "task_links"."to_task_id")
);
--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_from_task_id_tasks_id_fk" FOREIGN KEY ("from_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_to_task_id_tasks_id_fk" FOREIGN KEY ("to_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_links_from_to_type_unique" ON "task_links" USING btree ("from_task_id","to_task_id","type");--> statement-breakpoint
CREATE INDEX "task_links_to_task_id_idx" ON "task_links" USING btree ("to_task_id");