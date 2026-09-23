CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
INSERT INTO "users" ("id", "username", "password_hash") VALUES ('00000000-0000-4000-8000-000000000001', 'owner', NULL);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
UPDATE "projects" SET "user_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
UPDATE "tags" SET "user_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "board_columns" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
UPDATE "board_columns" SET "user_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "board_columns" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "user_id" uuid;
--> statement-breakpoint
UPDATE "tasks" SET "user_id" = '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_name_unique";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_id_name_unique" ON "projects" USING btree ("user_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_id_name_unique" ON "tags" USING btree ("user_id","name");
--> statement-breakpoint
CREATE INDEX "board_columns_user_id_position_idx" ON "board_columns" USING btree ("user_id","position");
--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");
