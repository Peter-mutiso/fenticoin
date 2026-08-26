CREATE TYPE "public"."account_type" AS ENUM('real', 'demo');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_type" "account_type" DEFAULT 'real' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo_of_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_demo_of_user_id_users_id_fk" FOREIGN KEY ("demo_of_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_account_type_idx" ON "users" USING btree ("account_type");--> statement-breakpoint
CREATE UNIQUE INDEX "users_demo_of_user_id_idx" ON "users" USING btree ("demo_of_user_id") WHERE "users"."demo_of_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_type_shape" CHECK (("users"."account_type" = 'demo' AND "users"."demo_of_user_id" IS NOT NULL) OR ("users"."account_type" = 'real' AND "users"."demo_of_user_id" IS NULL));