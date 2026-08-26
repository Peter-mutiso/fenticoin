CREATE TYPE "public"."bot_log_level" AS ENUM('info', 'success', 'skipped', 'error');--> statement-breakpoint
CREATE TABLE "trading_bot_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" "bot_log_level" NOT NULL,
	"message" text NOT NULL,
	"bet_id" uuid,
	"signal" jsonb
);
--> statement-breakpoint
DROP INDEX "bots_strategy_key_idx";--> statement-breakpoint
DROP INDEX "bots_user_id_idx";--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "bot_id" uuid;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "name" varchar(80) NOT NULL DEFAULT 'Trading bot';--> statement-breakpoint
ALTER TABLE "bots" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trading_bot_logs" ADD CONSTRAINT "trading_bot_logs_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_bot_logs" ADD CONSTRAINT "trading_bot_logs_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trading_bot_logs_bot_id_occurred_at_idx" ON "trading_bot_logs" USING btree ("bot_id","occurred_at");--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_bot_id_idx" ON "bets" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bots_status_idx" ON "bots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bots_user_id_idx" ON "bots" USING btree ("user_id");