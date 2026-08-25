CREATE TYPE "public"."instrument_status" AS ENUM('active', 'suspended', 'delisted');--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"display_symbol" varchar(24) NOT NULL,
	"name" varchar(80) NOT NULL,
	"category_key" varchar(30) NOT NULL,
	"provider_symbol" varchar(60),
	"price_precision" smallint DEFAULT 2 NOT NULL,
	"status" "instrument_status" DEFAULT 'active' NOT NULL,
	"max_price_age_seconds" integer DEFAULT 30 NOT NULL,
	"trading_schedule" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_price_precision_range" CHECK ("instruments"."price_precision" BETWEEN 0 AND 8),
	CONSTRAINT "instruments_max_price_age_positive" CHECK ("instruments"."max_price_age_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "market_categories" (
	"key" varchar(30) PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"source" varchar(60) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_ticks_price_positive" CHECK ("price_ticks"."price" > 0)
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_category_key_market_categories_key_fk" FOREIGN KEY ("category_key") REFERENCES "public"."market_categories"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_ticks" ADD CONSTRAINT "price_ticks_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_symbol_quote_currency_idx" ON "instruments" USING btree ("symbol","quote_currency");--> statement-breakpoint
CREATE INDEX "instruments_category_key_idx" ON "instruments" USING btree ("category_key");--> statement-breakpoint
CREATE INDEX "instruments_status_idx" ON "instruments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "price_ticks_instrument_id_observed_at_idx" ON "price_ticks" USING btree ("instrument_id","observed_at");