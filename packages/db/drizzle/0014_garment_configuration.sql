CREATE TYPE "public"."configuration_file_role" AS ENUM('ARTWORK', 'LOGO', 'REFERENCE', 'GARMENT_PHOTO');--> statement-breakpoint
CREATE TYPE "public"."decoration_method" AS ENUM('EMBROIDERY', 'PRINT', 'BOTH', 'RECOMMEND');--> statement-breakpoint
CREATE TYPE "public"."garment_sourcing" AS ENUM('SOURCE_CUSTOMIZE', 'MAKE_FROM_SCRATCH', 'CUSTOMER_SUPPLIED', 'HELP_ME_CHOOSE');--> statement-breakpoint
CREATE TYPE "public"."low_resolution_action" AS ENUM('REPLACE', 'CLEANUP', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."placement_position" AS ENUM('LEFT_CHEST', 'RIGHT_CHEST', 'CENTRE_CHEST', 'FULL_FRONT', 'UPPER_BACK', 'FULL_BACK', 'LEFT_SLEEVE', 'RIGHT_SLEEVE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."placement_size" AS ENUM('SMALL', 'STANDARD', 'LARGE');--> statement-breakpoint
ALTER TYPE "public"."artwork_choice" ADD VALUE 'LOGO';--> statement-breakpoint
ALTER TYPE "public"."artwork_choice" ADD VALUE 'REFERENCE';--> statement-breakpoint
CREATE TABLE "configuration_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"configuration_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"role" "configuration_file_role" NOT NULL,
	"low_resolution_action" "low_resolution_action",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuration_personalization_rows" (
	"configuration_id" uuid NOT NULL,
	"row" integer NOT NULL,
	"name" text,
	"number" text,
	"department" text,
	"size" text,
	CONSTRAINT "configuration_personalization_rows_configuration_id_row_pk" PRIMARY KEY("configuration_id","row")
);
--> statement-breakpoint
CREATE TABLE "configuration_placements" (
	"configuration_id" uuid NOT NULL,
	"position" "placement_position" NOT NULL,
	"size" "placement_size" DEFAULT 'STANDARD' NOT NULL,
	"method" "decoration_method",
	"note" text,
	CONSTRAINT "configuration_placements_configuration_id_position_pk" PRIMARY KEY("configuration_id","position")
);
--> statement-breakpoint
CREATE TABLE "configuration_sizes" (
	"configuration_id" uuid NOT NULL,
	"size" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "configuration_sizes_configuration_id_size_pk" PRIMARY KEY("configuration_id","size")
);
--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "sourcing" "garment_sourcing";--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "decoration" "decoration_method";--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "sizes_unknown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "configuration_files" ADD CONSTRAINT "configuration_files_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_files" ADD CONSTRAINT "configuration_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_personalization_rows" ADD CONSTRAINT "configuration_personalization_rows_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_placements" ADD CONSTRAINT "configuration_placements_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_sizes" ADD CONSTRAINT "configuration_sizes_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "configuration_files_unique" ON "configuration_files" USING btree ("configuration_id","file_id");