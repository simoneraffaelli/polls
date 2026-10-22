CREATE TABLE "quarantined_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text,
	"content_hash" text NOT NULL,
	"reason_code" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quarantine_hash_check" CHECK (length("quarantined_observations"."content_hash") = 64)
);
--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "cursor_generation_before" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "cycle_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "cycle_started_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "page_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "queue_job_id" uuid;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "retry_not_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "has_more" boolean;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "page_hash" text;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "page_acquired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "saved_count" integer;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "quarantined_count" integer;--> statement-breakpoint
ALTER TABLE "source_cursors" ADD COLUMN "generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_cursors" ADD COLUMN "not_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_cursors" ADD COLUMN "blocked_reason_code" text;--> statement-breakpoint
-- Search-path relative reference keeps isolated PostgreSQL test schemas self-contained.
ALTER TABLE "quarantined_observations" ADD CONSTRAINT "quarantine_run_source_fk" FOREIGN KEY ("run_id","source_id") REFERENCES "collection_runs"("id","source_id") ON DELETE no action ON UPDATE no action;
