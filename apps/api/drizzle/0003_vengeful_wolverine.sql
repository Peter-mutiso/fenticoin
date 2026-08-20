CREATE TYPE "public"."bet_result" AS ENUM('win', 'loss', 'push');--> statement-breakpoint
CREATE TYPE "public"."bet_status" AS ENUM('pending', 'open', 'won', 'lost', 'void', 'cancelled', 'refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."bet_type" AS ENUM('rise_fall', 'higher_lower', 'up_down');--> statement-breakpoint
CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"type" "bet_type" NOT NULL,
	"selection" varchar(10) NOT NULL,
	"stake_amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"entry_price" bigint NOT NULL,
	"entry_price_observed_at" timestamp with time zone NOT NULL,
	"target_price" bigint,
	"payout_rate_basis_points" bigint NOT NULL,
	"potential_payout" bigint NOT NULL,
	"status" "bet_status" DEFAULT 'open' NOT NULL,
	"result" "bet_result",
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settlement_price" bigint,
	"settlement_price_observed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"placement_transaction_id" uuid,
	"settlement_transaction_id" uuid,
	"idempotency_key" varchar(128),
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bets_stake_positive" CHECK ("bets"."stake_amount" > 0),
	CONSTRAINT "bets_potential_payout_at_least_stake" CHECK ("bets"."potential_payout" >= "bets"."stake_amount"),
	CONSTRAINT "bets_expires_after_placed" CHECK ("bets"."expires_at" > "bets"."placed_at")
);
--> statement-breakpoint
CREATE TABLE "betting_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"bet_type" "bet_type" NOT NULL,
	"min_stake" bigint NOT NULL,
	"max_stake" bigint NOT NULL,
	"payout_rate_basis_points" bigint NOT NULL,
	"max_exposure" bigint,
	"min_duration_seconds" bigint NOT NULL,
	"max_duration_seconds" bigint NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "betting_configs_stake_bounds" CHECK ("betting_configs"."min_stake" > 0 AND "betting_configs"."max_stake" >= "betting_configs"."min_stake"),
	CONSTRAINT "betting_configs_payout_rate_positive" CHECK ("betting_configs"."payout_rate_basis_points" > 0),
	CONSTRAINT "betting_configs_duration_bounds" CHECK ("betting_configs"."min_duration_seconds" > 0 AND "betting_configs"."max_duration_seconds" >= "betting_configs"."min_duration_seconds")
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_placement_transaction_id_transactions_id_fk" FOREIGN KEY ("placement_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_settlement_transaction_id_transactions_id_fk" FOREIGN KEY ("settlement_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "betting_configs" ADD CONSTRAINT "betting_configs_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bets_idempotency_key_idx" ON "bets" USING btree ("idempotency_key") WHERE "bets"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bets_user_id_created_at_idx" ON "bets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bets_instrument_id_status_idx" ON "bets" USING btree ("instrument_id","status");--> statement-breakpoint
CREATE INDEX "bets_status_expires_at_idx" ON "bets" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "betting_configs_instrument_id_bet_type_idx" ON "betting_configs" USING btree ("instrument_id","bet_type");