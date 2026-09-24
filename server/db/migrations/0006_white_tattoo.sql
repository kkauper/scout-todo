CREATE TYPE "public"."task_size" AS ENUM('xs', 's', 'm', 'l', 'xl');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "size" "task_size";