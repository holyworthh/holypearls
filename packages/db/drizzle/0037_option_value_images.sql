ALTER TABLE "product_option_values" ADD COLUMN "image_file_id" uuid;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD COLUMN "image_alt" text;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;