ALTER TABLE "checkouts" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "checkouts" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkouts_organization_idx" ON "checkouts" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "quotes_organization_idx" ON "quotes" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "orders_organization_idx" ON "orders" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "projects_organization_idx" ON "projects" USING btree ("organization_id","location_id");--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_placement" CHECK (("checkouts"."organization_id" is null) = ("checkouts"."location_id" is null));--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_placement" CHECK (("quotes"."organization_id" is null) = ("quotes"."location_id" is null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_placement" CHECK (("orders"."organization_id" is null) = ("orders"."location_id" is null));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_placement" CHECK (("projects"."organization_id" is null) = ("projects"."location_id" is null));