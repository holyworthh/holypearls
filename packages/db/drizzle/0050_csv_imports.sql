CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"collection_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"headers" text[] NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"imported_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_status" CHECK ("import_batches"."status" in ('UPLOADED', 'CHECKED', 'IMPORTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"raw" text[] NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_of_participant_id" uuid,
	"decision" text,
	"outcome" text DEFAULT 'PENDING' NOT NULL,
	"participant_id" uuid,
	CONSTRAINT "import_rows_outcome" CHECK ("import_rows"."outcome" in ('PENDING', 'IMPORTED', 'SKIPPED')),
	CONSTRAINT "import_rows_decision" CHECK ("import_rows"."decision" is null or "import_rows"."decision" in ('MERGE', 'KEEP_BOTH', 'REPLACE', 'SKIP'))
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "import_row" integer;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_collection_id_group_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."group_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_collection_idx" ON "import_batches" USING btree ("collection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_line_unique" ON "import_rows" USING btree ("batch_id","line");