CREATE TYPE "public"."bot_status" AS ENUM('inactive', 'active', 'strategy_unconfigured');--> statement-breakpoint
CREATE TABLE "bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "bot_status" DEFAULT 'strategy_unconfigured' NOT NULL,
	"strategy_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bots_user_id_idx" ON "bots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bots_strategy_key_idx" ON "bots" USING btree ("id","strategy_key") WHERE "bots"."strategy_key" IS NOT NULL;