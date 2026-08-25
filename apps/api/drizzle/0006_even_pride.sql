ALTER TYPE "public"."withdrawal_status" ADD VALUE 'unknown' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "settlement_claim_token" varchar(64);