CREATE TYPE "public"."house_system_account_key" AS ENUM('house_cash', 'house_revenue', 'house_liability');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('available', 'locked', 'system');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_owner_type" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."transaction_actor_type" AS ENUM('user', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'posted', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('deposit', 'withdrawal', 'bet_placement', 'bet_refund', 'bet_win', 'bet_loss', 'bonus', 'adjustment', 'fee', 'reversal');--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"cached_balance" bigint NOT NULL,
	"computed_balance" bigint NOT NULL,
	"drift_amount" bigint NOT NULL,
	"is_drifted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid,
	"owner_type" "ledger_account_owner_type" NOT NULL,
	"kind" "ledger_account_kind" NOT NULL,
	"system_key" "house_system_account_key",
	"currency" varchar(3) NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_owner_shape" CHECK (("ledger_accounts"."owner_type" = 'user' AND "ledger_accounts"."wallet_id" IS NOT NULL AND "ledger_accounts"."kind" IN ('available', 'locked') AND "ledger_accounts"."system_key" IS NULL)
        OR ("ledger_accounts"."owner_type" = 'system' AND "ledger_accounts"."wallet_id" IS NULL AND "ledger_accounts"."kind" = 'system' AND "ledger_accounts"."system_key" IS NOT NULL)),
	CONSTRAINT "ledger_accounts_user_balance_non_negative" CHECK ("ledger_accounts"."owner_type" != 'user' OR "ledger_accounts"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"balance_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(128),
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'posted' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total_amount" bigint NOT NULL,
	"actor_type" "transaction_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"subject_user_id" uuid,
	"reason" text,
	"related_type" varchar(30),
	"related_id" varchar(64),
	"reversal_of_transaction_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "transactions_total_amount_non_negative" CHECK ("transactions"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_snapshots_ledger_account_id_idx" ON "balance_snapshots" USING btree ("ledger_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_wallet_kind_idx" ON "ledger_accounts" USING btree ("wallet_id","kind") WHERE "ledger_accounts"."wallet_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_system_key_currency_idx" ON "ledger_accounts" USING btree ("system_key","currency") WHERE "ledger_accounts"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_accounts_currency_idx" ON "ledger_accounts" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_ledger_account_id_idx" ON "ledger_entries" USING btree ("ledger_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idempotency_key_idx" ON "transactions" USING btree ("idempotency_key") WHERE "transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_subject_user_id_idx" ON "transactions" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_related_idx" ON "transactions" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_id_currency_idx" ON "wallets" USING btree ("user_id","currency");