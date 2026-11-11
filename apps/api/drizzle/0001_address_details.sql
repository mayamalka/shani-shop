ALTER TABLE "orders" ADD COLUMN "city_code" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "house_number" text DEFAULT '' NOT NULL;