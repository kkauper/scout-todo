CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_end_after_start" CHECK ("time_entries"."ended_at" IS NULL OR "time_entries"."ended_at" >= "time_entries"."started_at")
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_task_id_idx" ON "time_entries" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_running_per_user" ON "time_entries" USING btree ("user_id") WHERE "time_entries"."ended_at" IS NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scout_app') THEN
    ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS scout_app_all ON public.time_entries;
    CREATE POLICY scout_app_all ON public.time_entries FOR ALL TO scout_app USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scout_app') THEN
    ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS scout_app_all ON public.task_links;
    CREATE POLICY scout_app_all ON public.task_links FOR ALL TO scout_app USING (true) WITH CHECK (true);
  END IF;
END $$;