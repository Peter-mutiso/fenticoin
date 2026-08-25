CREATE TYPE "public"."settlement_outcome" AS ENUM('win', 'loss', 'push', 'failed');--> statement-breakpoint
ALTER TYPE "public"."bet_status" ADD VALUE 'requires_review';--> statement-breakpoint
CREATE TABLE "bet_settlement_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bet_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculation_version" integer NOT NULL,
	"opening_price" bigint NOT NULL,
	"opening_price_source" varchar(64) NOT NULL,
	"opening_price_observed_at" timestamp with time zone NOT NULL,
	"closing_price" bigint,
	"closing_price_source" varchar(64),
	"closing_price_observed_at" timestamp with time zone,
	"stake_amount" bigint NOT NULL,
	"payout_rate_basis_points" bigint NOT NULL,
	"computed_payout" bigint,
	"outcome" "settlement_outcome" NOT NULL,
	"final_status" "bet_status",
	"settlement_transaction_id" uuid,
	"is_manual_resolution" boolean DEFAULT false NOT NULL,
	"actor_user_id" uuid,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "entry_price_source" varchar(64);--> statement-breakpoint
ALTER TABLE "bet_settlement_audits" ADD CONSTRAINT "bet_settlement_audits_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_settlement_audits" ADD CONSTRAINT "bet_settlement_audits_settlement_transaction_id_transactions_id_fk" FOREIGN KEY ("settlement_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_settlement_audits" ADD CONSTRAINT "bet_settlement_audits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bet_settlement_audits_bet_id_attempted_at_idx" ON "bet_settlement_audits" USING btree ("bet_id","attempted_at");--> statement-breakpoint
CREATE INDEX "bet_settlement_audits_outcome_idx" ON "bet_settlement_audits" USING btree ("outcome");