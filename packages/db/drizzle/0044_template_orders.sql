CREATE TABLE "template_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"ordered_by_user_id" uuid,
	"route" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_orders_route" CHECK ("template_orders"."route" in ('CHECKOUT', 'QUOTE'))
);
--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "controls" jsonb;--> statement-breakpoint
ALTER TABLE "template_orders" ADD CONSTRAINT "template_orders_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_orders" ADD CONSTRAINT "template_orders_ordered_by_user_id_users_id_fk" FOREIGN KEY ("ordered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_orders" ADD CONSTRAINT "template_orders_template_fk" FOREIGN KEY ("template_id","organization_id") REFERENCES "public"."templates"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_orders" ADD CONSTRAINT "template_orders_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "template_orders_configuration_unique" ON "template_orders" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "template_orders_template_idx" ON "template_orders" USING btree ("template_id","created_at");