CREATE TABLE "article_edition_links" (
	"article_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"topic" text,
	CONSTRAINT "article_edition_links_article_id_edition_id_pk" PRIMARY KEY("article_id","edition_id")
);
--> statement-breakpoint
CREATE TABLE "article_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"supersedes_revision_id" uuid,
	"source_revision" text,
	"content_hash" text NOT NULL,
	"source_url" text NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"excerpt_reuse_permitted" boolean NOT NULL,
	"observed_kind" text NOT NULL,
	"observed_date" date,
	"observed_start_date" date,
	"observed_end_date" date,
	"observed_at" timestamp with time zone,
	"language" text,
	"declared_publication_kind" text,
	"declared_publication_date" date,
	"declared_publication_at" timestamp with time zone,
	"acquired_at" timestamp with time zone NOT NULL,
	"parser_version" text NOT NULL,
	"transform_version" text NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	CONSTRAINT "article_revisions_article_no_unique" UNIQUE("article_id","revision_no"),
	CONSTRAINT "article_revisions_id_article_unique" UNIQUE("id","article_id"),
	CONSTRAINT "article_revisions_publication_shape_check" CHECK (("article_revisions"."declared_publication_kind" is null and "article_revisions"."declared_publication_date" is null and "article_revisions"."declared_publication_at" is null) or ("article_revisions"."declared_publication_kind" = 'date' and "article_revisions"."declared_publication_date" is not null and "article_revisions"."declared_publication_at" is null) or ("article_revisions"."declared_publication_kind" = 'instant' and "article_revisions"."declared_publication_date" is null and "article_revisions"."declared_publication_at" is not null)),
	CONSTRAINT "article_revisions_observed_shape_check" CHECK (("article_revisions"."observed_kind" = 'date' and "article_revisions"."observed_date" is not null and "article_revisions"."observed_start_date" is null and "article_revisions"."observed_end_date" is null and "article_revisions"."observed_at" is null) or ("article_revisions"."observed_kind" = 'date_period' and "article_revisions"."observed_date" is null and "article_revisions"."observed_start_date" is not null and "article_revisions"."observed_end_date" is not null and "article_revisions"."observed_end_date" >= "article_revisions"."observed_start_date" and "article_revisions"."observed_at" is null) or ("article_revisions"."observed_kind" = 'instant' and "article_revisions"."observed_date" is null and "article_revisions"."observed_start_date" is null and "article_revisions"."observed_end_date" is null and "article_revisions"."observed_at" is not null)),
	CONSTRAINT "article_revisions_excerpt_rights_check" CHECK ("article_revisions"."excerpt" is null or "article_revisions"."excerpt_reuse_permitted" = true)
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "articles_source_external_unique" UNIQUE("source_id","external_id"),
	CONSTRAINT "articles_id_source_unique" UNIQUE("id","source_id")
);
--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text NOT NULL,
	"cursor_before" text,
	"cursor_after" text,
	"started_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "collection_runs_id_source_unique" UNIQUE("id","source_id"),
	CONSTRAINT "collection_runs_status_check" CHECK ("collection_runs"."status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "configured_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"attribution" text,
	"terms_url" text,
	"license_note" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code"),
	CONSTRAINT "countries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "current_publications" (
	"question_id" uuid PRIMARY KEY NOT NULL,
	"edition_id" text NOT NULL,
	"publication_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	CONSTRAINT "current_publications_publication_id_unique" UNIQUE("publication_id")
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" text PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "editions_section_slug_unique" UNIQUE("section_id","slug"),
	CONSTRAINT "editions_id_section_unique" UNIQUE("id","section_id")
);
--> statement-breakpoint
CREATE TABLE "forecast_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" text NOT NULL,
	"race_id" uuid,
	"slug" text NOT NULL,
	"outcome_definition" text NOT NULL,
	"resolution_rule_version" text NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"cutoff_local" text NOT NULL,
	"cutoff_time_zone" text NOT NULL,
	"cutoff_calendar_reference" text NOT NULL,
	"cutoff_version" integer NOT NULL,
	"stored_state" text DEFAULT 'open' NOT NULL,
	"resolution_status" text DEFAULT 'pending' NOT NULL,
	"verified_outcome_id" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "forecast_questions_edition_slug_unique" UNIQUE("edition_id","slug"),
	CONSTRAINT "forecast_questions_id_edition_unique" UNIQUE("id","edition_id"),
	CONSTRAINT "forecast_questions_state_check" CHECK ("forecast_questions"."stored_state" in ('open', 'closed', 'archived')),
	CONSTRAINT "forecast_questions_resolution_check" CHECK (("forecast_questions"."resolution_status" = 'pending' and "forecast_questions"."verified_outcome_id" is null) or ("forecast_questions"."resolution_status" = 'verified' and "forecast_questions"."verified_outcome_id" is not null)),
	CONSTRAINT "forecast_questions_cutoff_version_check" CHECK ("forecast_questions"."cutoff_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "forecast_results" (
	"run_id" uuid NOT NULL,
	"outcome_id" text NOT NULL,
	"probability" numeric(9, 8) NOT NULL,
	CONSTRAINT "forecast_results_run_id_outcome_id_pk" PRIMARY KEY("run_id","outcome_id"),
	CONSTRAINT "forecast_results_probability_check" CHECK ("forecast_results"."probability" >= 0 and "forecast_results"."probability" <= 1)
);
--> statement-breakpoint
CREATE TABLE "forecast_run_poll_inputs" (
	"run_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"poll_link_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	CONSTRAINT "forecast_run_poll_inputs_run_id_revision_id_pk" PRIMARY KEY("run_id","revision_id")
);
--> statement-breakpoint
CREATE TABLE "forecast_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sealed" boolean DEFAULT false NOT NULL,
	"question_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"run_sequence" bigserial NOT NULL,
	"kind" text NOT NULL,
	"input_as_of" timestamp with time zone NOT NULL,
	"input_snapshot_hash" text NOT NULL,
	"model_version" text NOT NULL,
	"model_status" text NOT NULL,
	"parameter_version" text NOT NULL,
	"seed" text NOT NULL,
	"quality_status" text DEFAULT 'incomplete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"completed_at" timestamp with time zone,
	"diagnostics" jsonb,
	CONSTRAINT "forecast_runs_run_sequence_unique" UNIQUE("run_sequence"),
	CONSTRAINT "forecast_runs_id_question_scope_unique" UNIQUE("id","question_id","edition_id"),
	CONSTRAINT "forecast_runs_id_edition_unique" UNIQUE("id","edition_id"),
	CONSTRAINT "forecast_runs_kind_check" CHECK ("forecast_runs"."kind" in ('forecast', 'retrospective_reconstruction')),
	CONSTRAINT "forecast_runs_quality_check" CHECK ("forecast_runs"."quality_status" in ('complete', 'incomplete')),
	CONSTRAINT "forecast_runs_model_status_check" CHECK ("forecast_runs"."model_status" in ('experimental', 'validated')),
	CONSTRAINT "forecast_runs_completion_check" CHECK ("forecast_runs"."completed_at" is null or "forecast_runs"."completed_at" >= "forecast_runs"."created_at"),
	CONSTRAINT "forecast_runs_input_as_of_check" CHECK ("forecast_runs"."input_as_of" <= "forecast_runs"."created_at")
);
--> statement-breakpoint
CREATE TABLE "market_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"resolution_rules" text NOT NULL,
	"closes_at" timestamp with time zone,
	CONSTRAINT "market_contracts_source_external_unique" UNIQUE("source_id","external_id"),
	CONSTRAINT "market_contracts_id_source_unique" UNIQUE("id","source_id")
);
--> statement-breakpoint
CREATE TABLE "market_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "market_outcomes_contract_external_unique" UNIQUE("contract_id","external_id"),
	CONSTRAINT "market_outcomes_id_source_unique" UNIQUE("id","source_id")
);
--> statement-breakpoint
CREATE TABLE "market_question_links" (
	"outcome_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"equivalence_status" text DEFAULT 'unverified' NOT NULL,
	"checked_at" timestamp with time zone,
	"explanation" text,
	CONSTRAINT "market_question_links_outcome_id_question_id_pk" PRIMARY KEY("outcome_id","question_id"),
	CONSTRAINT "market_question_links_status_check" CHECK ("market_question_links"."equivalence_status" in ('unverified', 'equivalent', 'not_equivalent'))
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"snapshot_id" text NOT NULL,
	"source_revision" text,
	"content_hash" text NOT NULL,
	"source_url" text NOT NULL,
	"price_type" text NOT NULL,
	"bid" numeric(14, 12),
	"ask" numeric(14, 12),
	"midpoint" numeric(14, 12),
	"last_trade" numeric(14, 12),
	"spread" numeric(14, 12),
	"comparison_status" text,
	"exclusion_reason" text,
	"expected_price_type" text,
	"unavailable_reason" text,
	"source_observed_at" timestamp with time zone NOT NULL,
	"declared_publication_kind" text,
	"declared_publication_date" date,
	"declared_publication_at" timestamp with time zone,
	"acquired_at" timestamp with time zone NOT NULL,
	"quality_policy_version" text NOT NULL,
	"quality_state" text NOT NULL,
	"parser_version" text NOT NULL,
	"transform_version" text NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	CONSTRAINT "market_quotes_snapshot_revision_unique" UNIQUE NULLS NOT DISTINCT("source_id","outcome_id","snapshot_id","source_revision"),
	CONSTRAINT "market_quotes_price_type_check" CHECK ("market_quotes"."price_type" in ('bid_ask_midpoint', 'last_trade', 'unavailable')),
	CONSTRAINT "market_quotes_price_range_check" CHECK (("market_quotes"."bid" is null or "market_quotes"."bid" between 0 and 1) and ("market_quotes"."ask" is null or "market_quotes"."ask" between 0 and 1) and ("market_quotes"."midpoint" is null or "market_quotes"."midpoint" between 0 and 1) and ("market_quotes"."last_trade" is null or "market_quotes"."last_trade" between 0 and 1) and ("market_quotes"."spread" is null or "market_quotes"."spread" between 0 and 1)),
	CONSTRAINT "market_quotes_shape_check" CHECK (("market_quotes"."price_type" = 'bid_ask_midpoint' and "market_quotes"."bid" is not null and "market_quotes"."ask" is not null and "market_quotes"."midpoint" is not null and "market_quotes"."spread" is not null and "market_quotes"."last_trade" is null and "market_quotes"."bid" <= "market_quotes"."ask" and abs("market_quotes"."midpoint" - ("market_quotes"."bid" + "market_quotes"."ask") / 2) <= 0.00000001 and abs("market_quotes"."spread" - ("market_quotes"."ask" - "market_quotes"."bid")) <= 0.00000001 and "market_quotes"."comparison_status" in ('eligible', 'excluded') and (("market_quotes"."comparison_status" = 'eligible' and "market_quotes"."exclusion_reason" is null) or ("market_quotes"."comparison_status" = 'excluded' and "market_quotes"."exclusion_reason" is not null)) and "market_quotes"."expected_price_type" is null and "market_quotes"."unavailable_reason" is null) or ("market_quotes"."price_type" = 'last_trade' and "market_quotes"."last_trade" is not null and "market_quotes"."bid" is null and "market_quotes"."ask" is null and "market_quotes"."midpoint" is null and "market_quotes"."spread" is null and "market_quotes"."comparison_status" is null and "market_quotes"."exclusion_reason" is null and "market_quotes"."expected_price_type" is null and "market_quotes"."unavailable_reason" is null) or ("market_quotes"."price_type" = 'unavailable' and "market_quotes"."last_trade" is null and "market_quotes"."midpoint" is null and "market_quotes"."spread" is null and "market_quotes"."comparison_status" is null and "market_quotes"."exclusion_reason" is null and "market_quotes"."expected_price_type" is not null and "market_quotes"."expected_price_type" in ('bid_ask_midpoint', 'last_trade', 'unknown') and "market_quotes"."unavailable_reason" is not null)),
	CONSTRAINT "market_quotes_publication_shape_check" CHECK (("market_quotes"."declared_publication_kind" is null and "market_quotes"."declared_publication_date" is null and "market_quotes"."declared_publication_at" is null) or ("market_quotes"."declared_publication_kind" = 'date' and "market_quotes"."declared_publication_date" is not null and "market_quotes"."declared_publication_at" is null) or ("market_quotes"."declared_publication_kind" = 'instant' and "market_quotes"."declared_publication_date" is null and "market_quotes"."declared_publication_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "poll_acquisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"source_revision" text,
	"content_hash" text NOT NULL,
	"source_url" text NOT NULL,
	"parser_version" text NOT NULL,
	"transform_version" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	CONSTRAINT "poll_acquisitions_poll_run_unique" UNIQUE("poll_id","ingestion_run_id")
);
--> statement-breakpoint
CREATE TABLE "poll_edition_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"race_id" uuid,
	CONSTRAINT "poll_edition_links_identity_unique" UNIQUE NULLS NOT DISTINCT("poll_id","edition_id","race_id"),
	CONSTRAINT "poll_edition_links_id_scope_poll_unique" UNIQUE("id","edition_id","poll_id")
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"revision_id" uuid NOT NULL,
	"external_question_id" text NOT NULL,
	"option_id" text NOT NULL,
	"label" text NOT NULL,
	"percentage" numeric(7, 4) NOT NULL,
	CONSTRAINT "poll_options_revision_id_external_question_id_option_id_pk" PRIMARY KEY("revision_id","external_question_id","option_id"),
	CONSTRAINT "poll_options_percentage_check" CHECK ("poll_options"."percentage" >= 0 and "poll_options"."percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "poll_questions" (
	"revision_id" uuid NOT NULL,
	"external_question_id" text NOT NULL,
	"wording" text,
	"kind" text NOT NULL,
	"population_kind" text NOT NULL,
	"population_description" text NOT NULL,
	"sample_group_id" text NOT NULL,
	"sample_size" integer,
	CONSTRAINT "poll_questions_revision_id_external_question_id_pk" PRIMARY KEY("revision_id","external_question_id")
);
--> statement-breakpoint
CREATE TABLE "poll_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "poll_records_source_external_unique" UNIQUE("source_id","external_id"),
	CONSTRAINT "poll_records_id_source_unique" UNIQUE("id","source_id")
);
--> statement-breakpoint
CREATE TABLE "poll_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sealed" boolean DEFAULT false NOT NULL,
	"poll_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"supersedes_revision_id" uuid,
	"source_revision" text,
	"content_hash" text NOT NULL,
	"source_url" text NOT NULL,
	"pollster" text NOT NULL,
	"sponsors" text[] NOT NULL,
	"fieldwork_start" date NOT NULL,
	"fieldwork_end" date NOT NULL,
	"declared_publication_kind" text,
	"declared_publication_date" date,
	"declared_publication_at" timestamp with time zone,
	"acquired_at" timestamp with time zone NOT NULL,
	"parser_version" text NOT NULL,
	"transform_version" text NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	CONSTRAINT "poll_revisions_poll_no_unique" UNIQUE("poll_id","revision_no"),
	CONSTRAINT "poll_revisions_id_poll_unique" UNIQUE("id","poll_id"),
	CONSTRAINT "poll_revisions_fieldwork_check" CHECK ("poll_revisions"."fieldwork_end" >= "poll_revisions"."fieldwork_start"),
	CONSTRAINT "poll_revisions_no_positive_check" CHECK ("poll_revisions"."revision_no" > 0),
	CONSTRAINT "poll_revisions_publication_shape_check" CHECK (("poll_revisions"."declared_publication_kind" is null and "poll_revisions"."declared_publication_date" is null and "poll_revisions"."declared_publication_at" is null) or ("poll_revisions"."declared_publication_kind" = 'date' and "poll_revisions"."declared_publication_date" is not null and "poll_revisions"."declared_publication_at" is null) or ("poll_revisions"."declared_publication_kind" = 'instant' and "poll_revisions"."declared_publication_date" is null and "poll_revisions"."declared_publication_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"run_sequence" bigint NOT NULL,
	"input_as_of" timestamp with time zone NOT NULL,
	"cutoff_version" integer NOT NULL,
	"cutoff_at_publication" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "publication_history_run_unique" UNIQUE("run_id"),
	CONSTRAINT "publication_history_pointer_unique" UNIQUE("id","question_id","edition_id","run_id"),
	CONSTRAINT "publication_history_before_cutoff_check" CHECK ("publication_history"."published_at" < "publication_history"."cutoff_at_publication")
);
--> statement-breakpoint
CREATE TABLE "question_cutoff_revisions" (
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"cutoff_local" text NOT NULL,
	"time_zone" text NOT NULL,
	"calendar_reference" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "question_cutoff_revisions_question_id_version_pk" PRIMARY KEY("question_id","version")
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"chamber_code" text,
	"territory_code" text,
	CONSTRAINT "races_edition_slug_unique" UNIQUE("edition_id","slug"),
	CONSTRAINT "races_id_edition_unique" UNIQUE("id","edition_id")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" text PRIMARY KEY NOT NULL,
	"country_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "sections_country_slug_unique" UNIQUE("country_id","slug"),
	CONSTRAINT "sections_id_country_unique" UNIQUE("id","country_id")
);
--> statement-breakpoint
CREATE TABLE "source_cursors" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"cursor" text,
	"last_run_id" uuid,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_section_bindings" (
	"source_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "source_section_bindings_source_id_section_id_pk" PRIMARY KEY("source_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "article_edition_links" ADD CONSTRAINT "article_edition_links_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_edition_links" ADD CONSTRAINT "article_edition_links_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_source_fk" FOREIGN KEY ("article_id","source_id") REFERENCES "articles"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_run_source_fk" FOREIGN KEY ("ingestion_run_id","source_id") REFERENCES "collection_runs"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_supersedes_same_article_fk" FOREIGN KEY ("supersedes_revision_id","article_id") REFERENCES "article_revisions"("id","article_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_configured_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "configured_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_source_id_configured_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "configured_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configured_sources" ADD CONSTRAINT "configured_sources_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_publications" ADD CONSTRAINT "current_publications_question_scope_fk" FOREIGN KEY ("question_id","edition_id") REFERENCES "forecast_questions"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_publications" ADD CONSTRAINT "current_publications_run_scope_fk" FOREIGN KEY ("run_id","question_id","edition_id") REFERENCES "forecast_runs"("id","question_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_publications" ADD CONSTRAINT "current_publications_history_scope_fk" FOREIGN KEY ("publication_id","question_id","edition_id","run_id") REFERENCES "publication_history"("id","question_id","edition_id","run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_questions" ADD CONSTRAINT "forecast_questions_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_questions" ADD CONSTRAINT "forecast_questions_race_scope_fk" FOREIGN KEY ("race_id","edition_id") REFERENCES "races"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_results" ADD CONSTRAINT "forecast_results_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "forecast_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_run_poll_inputs" ADD CONSTRAINT "forecast_run_inputs_run_scope_fk" FOREIGN KEY ("run_id","edition_id") REFERENCES "forecast_runs"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_run_poll_inputs" ADD CONSTRAINT "forecast_run_inputs_link_scope_poll_fk" FOREIGN KEY ("poll_link_id","edition_id","poll_id") REFERENCES "poll_edition_links"("id","edition_id","poll_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_run_poll_inputs" ADD CONSTRAINT "forecast_run_inputs_revision_poll_fk" FOREIGN KEY ("revision_id","poll_id") REFERENCES "poll_revisions"("id","poll_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_runs" ADD CONSTRAINT "forecast_runs_question_scope_fk" FOREIGN KEY ("question_id","edition_id") REFERENCES "forecast_questions"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_contracts" ADD CONSTRAINT "market_contracts_source_id_configured_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "configured_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_outcomes" ADD CONSTRAINT "market_outcomes_contract_source_fk" FOREIGN KEY ("contract_id","source_id") REFERENCES "market_contracts"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_question_links" ADD CONSTRAINT "market_question_links_outcome_id_market_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "market_outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_question_links" ADD CONSTRAINT "market_question_links_question_id_forecast_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "forecast_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_question_links" ADD CONSTRAINT "market_question_links_question_scope_fk" FOREIGN KEY ("question_id","edition_id") REFERENCES "forecast_questions"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_outcome_source_fk" FOREIGN KEY ("outcome_id","source_id") REFERENCES "market_outcomes"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_run_source_fk" FOREIGN KEY ("ingestion_run_id","source_id") REFERENCES "collection_runs"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_acquisitions" ADD CONSTRAINT "poll_acquisitions_poll_source_fk" FOREIGN KEY ("poll_id","source_id") REFERENCES "poll_records"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_acquisitions" ADD CONSTRAINT "poll_acquisitions_run_source_fk" FOREIGN KEY ("ingestion_run_id","source_id") REFERENCES "collection_runs"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_acquisitions" ADD CONSTRAINT "poll_acquisitions_revision_poll_fk" FOREIGN KEY ("revision_id","poll_id") REFERENCES "poll_revisions"("id","poll_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_edition_links" ADD CONSTRAINT "poll_edition_links_poll_id_poll_records_id_fk" FOREIGN KEY ("poll_id") REFERENCES "poll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_edition_links" ADD CONSTRAINT "poll_edition_links_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_edition_links" ADD CONSTRAINT "poll_edition_links_race_scope_fk" FOREIGN KEY ("race_id","edition_id") REFERENCES "races"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_question_fk" FOREIGN KEY ("revision_id","external_question_id") REFERENCES "poll_questions"("revision_id","external_question_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_questions" ADD CONSTRAINT "poll_questions_revision_id_poll_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "poll_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_records" ADD CONSTRAINT "poll_records_source_id_configured_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "configured_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_revisions" ADD CONSTRAINT "poll_revisions_record_source_fk" FOREIGN KEY ("poll_id","source_id") REFERENCES "poll_records"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_revisions" ADD CONSTRAINT "poll_revisions_run_source_fk" FOREIGN KEY ("ingestion_run_id","source_id") REFERENCES "collection_runs"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_revisions" ADD CONSTRAINT "poll_revisions_supersedes_same_poll_fk" FOREIGN KEY ("supersedes_revision_id","poll_id") REFERENCES "poll_revisions"("id","poll_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_run_scope_fk" FOREIGN KEY ("run_id","question_id","edition_id") REFERENCES "forecast_runs"("id","question_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_cutoff_version_fk" FOREIGN KEY ("question_id","cutoff_version") REFERENCES "question_cutoff_revisions"("question_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_cutoff_revisions" ADD CONSTRAINT "question_cutoff_revisions_question_id_forecast_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "forecast_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_cursors" ADD CONSTRAINT "source_cursors_source_id_configured_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "configured_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_cursors" ADD CONSTRAINT "source_cursors_run_source_fk" FOREIGN KEY ("last_run_id","source_id") REFERENCES "collection_runs"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_section_bindings" ADD CONSTRAINT "source_section_bindings_source_id_configured_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "configured_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_section_bindings" ADD CONSTRAINT "source_section_bindings_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_quotes_outcome_acquired_idx" ON "market_quotes" USING btree ("outcome_id","acquired_at");
--> statement-breakpoint
-- Historical observations and published forecast inputs are append-only. Data corrections create new rows.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical row in % is immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'poll_records', 'poll_acquisitions', 'poll_questions', 'poll_options', 'poll_edition_links',
    'article_revisions', 'article_edition_links', 'market_quotes',
    'forecast_run_poll_inputs', 'forecast_results',
    'publication_history', 'question_cutoff_revisions'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()',
      table_name || '_immutable', table_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION seal_history_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sealed historical parent cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.sealed = true OR NEW.sealed <> true
     OR (to_jsonb(NEW) - 'sealed') IS DISTINCT FROM (to_jsonb(OLD) - 'sealed') THEN
    RAISE EXCEPTION 'Sealed historical parent cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER poll_revisions_seal BEFORE UPDATE OR DELETE ON poll_revisions
FOR EACH ROW EXECUTE FUNCTION seal_history_parent();
--> statement-breakpoint
CREATE TRIGGER forecast_runs_seal BEFORE UPDATE OR DELETE ON forecast_runs
FOR EACH ROW EXECUTE FUNCTION seal_history_parent();
--> statement-breakpoint
CREATE FUNCTION guard_history_child_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_sealed boolean;
BEGIN
  IF TG_TABLE_NAME = 'poll_questions' OR TG_TABLE_NAME = 'poll_options' THEN
    SELECT sealed INTO parent_sealed FROM poll_revisions WHERE id = NEW.revision_id FOR UPDATE;
    IF parent_sealed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Poll revision is sealed or missing' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'forecast_run_poll_inputs' OR TG_TABLE_NAME = 'forecast_results' THEN
    SELECT sealed INTO parent_sealed FROM forecast_runs WHERE id = NEW.run_id FOR UPDATE;
    IF parent_sealed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Forecast run is sealed or missing' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER poll_questions_parent_open BEFORE INSERT ON poll_questions
FOR EACH ROW EXECUTE FUNCTION guard_history_child_insert();
--> statement-breakpoint
CREATE TRIGGER poll_options_parent_open BEFORE INSERT ON poll_options
FOR EACH ROW EXECUTE FUNCTION guard_history_child_insert();
--> statement-breakpoint
CREATE TRIGGER forecast_run_inputs_parent_open BEFORE INSERT ON forecast_run_poll_inputs
FOR EACH ROW EXECUTE FUNCTION guard_history_child_insert();
--> statement-breakpoint
CREATE TRIGGER forecast_results_parent_open BEFORE INSERT ON forecast_results
FOR EACH ROW EXECUTE FUNCTION guard_history_child_insert();
--> statement-breakpoint
CREATE FUNCTION guard_poll_acquisition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_sealed boolean;
BEGIN
  SELECT sealed INTO parent_sealed FROM poll_revisions WHERE id = NEW.revision_id;
  IF parent_sealed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Poll acquisition must refer to a sealed revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER poll_acquisitions_sealed_revision BEFORE INSERT ON poll_acquisitions
FOR EACH ROW EXECUTE FUNCTION guard_poll_acquisition();
--> statement-breakpoint
CREATE FUNCTION guard_forecast_question() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cutoff_version <> 1 THEN
      RAISE EXCEPTION 'Initial cutoff version must be 1' USING ERRCODE = '23514';
    END IF;
    IF NEW.stored_state = 'open' AND clock_timestamp() >= NEW.cutoff_at THEN
      NEW.stored_state := 'closed';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW.edition_id <> OLD.edition_id OR NEW.race_id IS DISTINCT FROM OLD.race_id THEN
    RAISE EXCEPTION 'Question identity and scope are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.stored_state <> 'open' AND NEW.stored_state = 'open' THEN
    RAISE EXCEPTION 'Closed question cannot reopen' USING ERRCODE = '23514';
  END IF;
  IF OLD.stored_state = 'archived' AND NEW.stored_state <> 'archived' THEN
    RAISE EXCEPTION 'Archived question cannot reopen' USING ERRCODE = '23514';
  END IF;
  IF (NEW.cutoff_at, NEW.cutoff_local, NEW.cutoff_time_zone, NEW.cutoff_calendar_reference)
     IS DISTINCT FROM (OLD.cutoff_at, OLD.cutoff_local, OLD.cutoff_time_zone, OLD.cutoff_calendar_reference) THEN
    IF OLD.stored_state <> 'open' OR clock_timestamp() >= OLD.cutoff_at THEN
      RAISE EXCEPTION 'Cutoff cannot change after closure' USING ERRCODE = '23514';
    END IF;
    IF NEW.cutoff_version <> OLD.cutoff_version + 1 THEN
      RAISE EXCEPTION 'Cutoff version must advance exactly once' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.cutoff_version <> OLD.cutoff_version THEN
    RAISE EXCEPTION 'Cutoff version changed without cutoff revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER forecast_questions_guard BEFORE INSERT OR UPDATE ON forecast_questions
FOR EACH ROW EXECUTE FUNCTION guard_forecast_question();
--> statement-breakpoint
CREATE FUNCTION record_question_cutoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.cutoff_version <> OLD.cutoff_version THEN
    INSERT INTO question_cutoff_revisions
      (question_id, version, cutoff_at, cutoff_local, time_zone, calendar_reference)
    VALUES
      (NEW.id, NEW.cutoff_version, NEW.cutoff_at, NEW.cutoff_local, NEW.cutoff_time_zone, NEW.cutoff_calendar_reference);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER forecast_questions_record_cutoff AFTER INSERT OR UPDATE ON forecast_questions
FOR EACH ROW EXECUTE FUNCTION record_question_cutoff();
--> statement-breakpoint
CREATE FUNCTION guard_forecast_poll_input() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acquired_at timestamptz;
DECLARE input_as_of timestamptz;
BEGIN
  SELECT r.acquired_at INTO acquired_at FROM poll_revisions r WHERE r.id = NEW.revision_id;
  IF NOT EXISTS (SELECT 1 FROM poll_revisions r WHERE r.id = NEW.revision_id AND r.sealed = true) THEN
    RAISE EXCEPTION 'Forecast input requires a sealed poll revision' USING ERRCODE = '23514';
  END IF;
  SELECT f.input_as_of INTO input_as_of FROM forecast_runs f WHERE f.id = NEW.run_id;
  IF acquired_at > input_as_of THEN
    RAISE EXCEPTION 'Run input revision was acquired after input as-of' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER forecast_run_poll_inputs_guard BEFORE INSERT ON forecast_run_poll_inputs
FOR EACH ROW EXECUTE FUNCTION guard_forecast_poll_input();
--> statement-breakpoint
-- The question row serializes concurrent publications. Fetch the DB clock only after the lock wait.
CREATE FUNCTION guard_forecast_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q forecast_questions%ROWTYPE;
DECLARE r forecast_runs%ROWTYPE;
DECLARE previous publication_history%ROWTYPE;
DECLARE observed_now timestamptz;
BEGIN
  SELECT * INTO q FROM forecast_questions WHERE id = NEW.question_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown forecast question' USING ERRCODE = '23503';
  END IF;
  observed_now := clock_timestamp();
  IF q.edition_id <> NEW.edition_id OR q.stored_state <> 'open' OR observed_now >= q.cutoff_at THEN
    RAISE EXCEPTION 'Forecast question is closed' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO r FROM forecast_runs WHERE id = NEW.run_id;
  IF NOT FOUND OR r.question_id <> q.id OR r.edition_id <> q.edition_id THEN
    RAISE EXCEPTION 'Forecast run does not belong to question scope' USING ERRCODE = '23503';
  END IF;
  IF r.sealed <> true OR r.kind <> 'forecast' OR r.quality_status <> 'complete' OR r.completed_at IS NULL
     OR r.completed_at > observed_now OR r.input_as_of > observed_now THEN
    RAISE EXCEPTION 'Forecast run is ineligible for publication' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM forecast_run_poll_inputs WHERE run_id = r.id)
     OR NOT EXISTS (SELECT 1 FROM forecast_results WHERE run_id = r.id) THEN
    RAISE EXCEPTION 'Forecast run has no frozen inputs or results' USING ERRCODE = '23514';
  END IF;
  SELECT h.* INTO previous FROM current_publications c
    JOIN publication_history h ON h.id = c.publication_id WHERE c.question_id = q.id;
  IF FOUND AND (r.input_as_of < previous.input_as_of OR r.run_sequence <= previous.run_sequence) THEN
    RAISE EXCEPTION 'A newer forecast is already published' USING ERRCODE = '23514';
  END IF;
  NEW.run_sequence := r.run_sequence;
  NEW.input_as_of := r.input_as_of;
  NEW.cutoff_version := q.cutoff_version;
  NEW.cutoff_at_publication := q.cutoff_at;
  NEW.published_at := observed_now;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER publication_history_guard BEFORE INSERT ON publication_history
FOR EACH ROW EXECUTE FUNCTION guard_forecast_publication();
--> statement-breakpoint
CREATE FUNCTION point_to_new_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO current_publications (question_id, edition_id, publication_id, run_id)
    VALUES (NEW.question_id, NEW.edition_id, NEW.id, NEW.run_id)
    ON CONFLICT (question_id) DO UPDATE SET
      edition_id = EXCLUDED.edition_id,
      publication_id = EXCLUDED.publication_id,
      run_id = EXCLUDED.run_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER publication_history_point AFTER INSERT ON publication_history
FOR EACH ROW EXECUTE FUNCTION point_to_new_publication();
--> statement-breakpoint
CREATE FUNCTION guard_publication_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous publication_history%ROWTYPE;
DECLARE replacement publication_history%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Published forecast pointer cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.question_id <> OLD.question_id OR NEW.edition_id <> OLD.edition_id THEN
      RAISE EXCEPTION 'Publication pointer scope cannot change' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO previous FROM publication_history WHERE id = OLD.publication_id;
    SELECT * INTO replacement FROM publication_history WHERE id = NEW.publication_id;
    IF NOT FOUND OR replacement.run_sequence <= previous.run_sequence
       OR replacement.input_as_of < previous.input_as_of THEN
      RAISE EXCEPTION 'Publication pointer cannot regress' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER current_publications_guard BEFORE UPDATE OR DELETE ON current_publications
FOR EACH ROW EXECUTE FUNCTION guard_publication_pointer();
