CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_webhook_outcome" AS ENUM('processed', 'duplicate_ignored', 'invalid_signature', 'unrecognized_reference', 'verification_mismatch', 'error');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('pending_review', 'approved', 'rejected', 'submitted', 'completed', 'failed', 'reversed');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'withdrawal_hold';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'withdrawal_release';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'withdrawal_settlement';--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" bigint NOT NULL,
	"status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"provider_name" varchar(64) NOT NULL,
	"provider_reference" varchar(128),
	"redirect_url" text,
	"transaction_id" uuid,
	"failure_reason" text,
	"expires_at" timestamp with time zone,
	"idempotency_key" varchar(128),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_amount_positive" CHECK ("deposits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_name" varchar(64) NOT NULL,
	"provider_reference" varchar(128),
	"kind" varchar(32),
	"raw_body_hash" varchar(64) NOT NULL,
	"signature_valid" boolean NOT NULL,
	"outcome" "payment_webhook_outcome" NOT NULL,
	"related_deposit_id" uuid,
	"related_withdrawal_id" uuid,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" bigint NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending_review' NOT NULL,
	"provider_name" varchar(64),
	"provider_reference" varchar(128),
	"hold_transaction_id" uuid NOT NULL,
	"release_transaction_id" uuid,
	"settlement_transaction_id" uuid,
	"reversal_transaction_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"failure_reason" text,
	"idempotency_key" varchar(128),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawals_amount_positive" CHECK ("withdrawals"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_receipts" ADD CONSTRAINT "payment_webhook_receipts_related_deposit_id_deposits_id_fk" FOREIGN KEY ("related_deposit_id") REFERENCES "public"."deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_receipts" ADD CONSTRAINT "payment_webhook_receipts_related_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("related_withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_hold_transaction_id_transactions_id_fk" FOREIGN KEY ("hold_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_release_transaction_id_transactions_id_fk" FOREIGN KEY ("release_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_settlement_transaction_id_transactions_id_fk" FOREIGN KEY ("settlement_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reversal_transaction_id_transactions_id_fk" FOREIGN KEY ("reversal_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_idempotency_key_idx" ON "deposits" USING btree ("idempotency_key") WHERE "deposits"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_provider_reference_idx" ON "deposits" USING btree ("provider_name","provider_reference") WHERE "deposits"."provider_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "deposits_user_id_created_at_idx" ON "deposits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "deposits_status_expires_at_idx" ON "deposits" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "payment_webhook_receipts_provider_reference_idx" ON "payment_webhook_receipts" USING btree ("provider_name","provider_reference");--> statement-breakpoint
CREATE INDEX "payment_webhook_receipts_received_at_idx" ON "payment_webhook_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_idempotency_key_idx" ON "withdrawals" USING btree ("idempotency_key") WHERE "withdrawals"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_provider_reference_idx" ON "withdrawals" USING btree ("provider_name","provider_reference") WHERE "withdrawals"."provider_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "withdrawals_user_id_created_at_idx" ON "withdrawals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "withdrawals" USING btree ("status");