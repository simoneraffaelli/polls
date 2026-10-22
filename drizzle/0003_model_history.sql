CREATE TABLE "historical_result_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_doi" text NOT NULL,
	"contest_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "historical_result_records_identity_unique" UNIQUE("dataset_doi","contest_key")
);
--> statement-breakpoint
CREATE TABLE "historical_result_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"supersedes_revision_id" uuid,
	"dataset_version" text NOT NULL,
	"file_sha256" text NOT NULL,
	"content_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"year" integer NOT NULL,
	"state_code" text NOT NULL,
	"stage" text NOT NULL,
	"special" boolean NOT NULL,
	"total_votes" bigint NOT NULL,
	"unattributed_votes" bigint NOT NULL,
	"candidates" jsonb NOT NULL,
	"margin_status" text NOT NULL,
	"leading_candidate" text,
	"margin_votes" bigint,
	"margin_share" numeric(12, 10),
	"exclusion_reason" text,
	"source_versions" jsonb NOT NULL,
	CONSTRAINT "historical_result_revisions_record_no_unique" UNIQUE("record_id","revision_no"),
	CONSTRAINT "historical_result_revisions_receipt_unique" UNIQUE("record_id","dataset_version","file_sha256","content_hash","parser_version"),
	CONSTRAINT "historical_result_revisions_id_record_unique" UNIQUE("id","record_id"),
	CONSTRAINT "historical_result_revisions_no_check" CHECK ("historical_result_revisions"."revision_no" > 0),
	CONSTRAINT "historical_result_revisions_hash_check" CHECK (length("historical_result_revisions"."file_sha256") = 64 and length("historical_result_revisions"."content_hash") = 64),
	CONSTRAINT "historical_result_revisions_year_check" CHECK ("historical_result_revisions"."year" between 1788 and 2100),
	CONSTRAINT "historical_result_revisions_state_check" CHECK (length("historical_result_revisions"."state_code") = 2),
	CONSTRAINT "historical_result_revisions_votes_check" CHECK ("historical_result_revisions"."total_votes" >= 0 and "historical_result_revisions"."unattributed_votes" >= 0 and "historical_result_revisions"."unattributed_votes" <= "historical_result_revisions"."total_votes"),
	CONSTRAINT "historical_result_revisions_json_check" CHECK (jsonb_typeof("historical_result_revisions"."candidates") = 'array' and jsonb_typeof("historical_result_revisions"."source_versions") = 'array'),
	CONSTRAINT "historical_result_revisions_margin_status_check" CHECK ("historical_result_revisions"."margin_status" in ('eligible', 'excluded')),
	CONSTRAINT "historical_result_revisions_margin_shape_check" CHECK (("historical_result_revisions"."margin_status" = 'eligible' and "historical_result_revisions"."leading_candidate" is not null and "historical_result_revisions"."margin_votes" is not null and "historical_result_revisions"."margin_share" is not null and "historical_result_revisions"."exclusion_reason" is null and "historical_result_revisions"."margin_votes" >= 0 and "historical_result_revisions"."margin_share" between 0 and 1) or ("historical_result_revisions"."margin_status" = 'excluded' and "historical_result_revisions"."leading_candidate" is null and "historical_result_revisions"."margin_votes" is null and "historical_result_revisions"."margin_share" is null and "historical_result_revisions"."exclusion_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "poll_forecast_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"excluded" boolean NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_link_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_link_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"poll_id" uuid NOT NULL,
	"included" boolean NOT NULL,
	"actor_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_model_snapshots" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"result_hash" text NOT NULL,
	"iterations" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "run_model_snapshots_snapshot_hash_check" CHECK (length("run_model_snapshots"."snapshot_hash") = 64),
	CONSTRAINT "run_model_snapshots_result_hash_check" CHECK (length("run_model_snapshots"."result_hash") = 64),
	CONSTRAINT "run_model_snapshots_iterations_check" CHECK ("run_model_snapshots"."iterations" between 100 and 20000),
	CONSTRAINT "run_model_snapshots_snapshot_object_check" CHECK (jsonb_typeof("run_model_snapshots"."snapshot") = 'object'),
	CONSTRAINT "run_model_snapshots_result_object_check" CHECK (jsonb_typeof("run_model_snapshots"."result") = 'object')
);
--> statement-breakpoint
CREATE TABLE "structural_model_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"edition_id" text NOT NULL,
	"version" text NOT NULL,
	"schema_version" text NOT NULL,
	"source_url" text NOT NULL,
	"source_version" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "structural_model_references_question_version_unique" UNIQUE("question_id","version"),
	CONSTRAINT "structural_model_references_schema_check" CHECK ("structural_model_references"."schema_version" = 'structural-v1'),
	CONSTRAINT "structural_model_references_hash_check" CHECK (length("structural_model_references"."content_hash") = 64),
	CONSTRAINT "structural_model_references_time_check" CHECK ("structural_model_references"."available_at" <= "structural_model_references"."acquired_at" and "structural_model_references"."acquired_at" <= "structural_model_references"."reviewed_at"),
	CONSTRAINT "structural_model_references_payload_check" CHECK (jsonb_typeof("structural_model_references"."payload") = 'object')
);
--> statement-breakpoint
ALTER TABLE "historical_result_revisions" ADD CONSTRAINT "historical_result_revisions_record_id_historical_result_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "historical_result_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_result_revisions" ADD CONSTRAINT "historical_result_revisions_supersedes_same_record_fk" FOREIGN KEY ("supersedes_revision_id","record_id") REFERENCES "historical_result_revisions"("id","record_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_forecast_exclusions" ADD CONSTRAINT "poll_forecast_exclusions_poll_id_poll_records_id_fk" FOREIGN KEY ("poll_id") REFERENCES "poll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_forecast_exclusions" ADD CONSTRAINT "poll_forecast_exclusions_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "editions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_forecast_exclusions" ADD CONSTRAINT "poll_forecast_exclusions_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_link_decisions" ADD CONSTRAINT "poll_link_decisions_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_link_decisions" ADD CONSTRAINT "poll_link_decisions_link_scope_fk" FOREIGN KEY ("poll_link_id","edition_id","poll_id") REFERENCES "poll_edition_links"("id","edition_id","poll_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_model_snapshots" ADD CONSTRAINT "run_model_snapshots_run_scope_fk" FOREIGN KEY ("run_id","question_id","edition_id") REFERENCES "forecast_runs"("id","question_id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structural_model_references" ADD CONSTRAINT "structural_model_references_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structural_model_references" ADD CONSTRAINT "structural_model_references_question_scope_fk" FOREIGN KEY ("question_id","edition_id") REFERENCES "forecast_questions"("id","edition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_forecast_exclusions_latest_idx" ON "poll_forecast_exclusions" USING btree ("poll_id","edition_id","recorded_at");--> statement-breakpoint
CREATE INDEX "poll_link_decisions_latest_idx" ON "poll_link_decisions" USING btree ("poll_link_id","recorded_at");--> statement-breakpoint
-- Existing links receive the migration instant. This conservatively avoids claiming an
-- association existed at a historical as-of before this timestamp was recorded.
ALTER TABLE "poll_edition_links" ADD COLUMN "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;--> statement-breakpoint
CREATE FUNCTION guard_run_model_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent forecast_runs%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Model snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO parent FROM forecast_runs WHERE id = NEW.run_id FOR UPDATE;
  IF NOT FOUND OR parent.sealed OR parent.question_id <> NEW.question_id OR parent.edition_id <> NEW.edition_id THEN
    RAISE EXCEPTION 'Model snapshot requires an unsealed matching run' USING ERRCODE = '23514';
  END IF;
  IF NEW.schema_version IS DISTINCT FROM 'model-snapshot-v1'
     OR NEW.snapshot_hash IS DISTINCT FROM parent.input_snapshot_hash
     OR NEW.snapshot->>'questionId' IS DISTINCT FROM parent.question_id::text
     OR NEW.snapshot->'scope'->>'editionId' IS DISTINCT FROM parent.edition_id
     OR NEW.snapshot->>'kind' IS DISTINCT FROM parent.kind
     OR (NEW.snapshot->>'inputAsOf')::timestamptz IS DISTINCT FROM parent.input_as_of
     OR NEW.snapshot->>'modelVersion' IS DISTINCT FROM parent.model_version
     OR NEW.snapshot->>'parameterVersion' IS DISTINCT FROM parent.parameter_version
     OR NEW.snapshot->>'seed' IS DISTINCT FROM parent.seed
     OR NEW.result->>'seed' IS DISTINCT FROM parent.seed
     OR NEW.result->>'parametersVersion' IS DISTINCT FROM parent.parameter_version
     OR NEW.result->>'modelStatus' IS DISTINCT FROM parent.model_status
     OR (NEW.result->>'iterations')::integer IS DISTINCT FROM NEW.iterations THEN
    RAISE EXCEPTION 'Model snapshot does not match run metadata' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER run_model_snapshots_guard BEFORE INSERT OR UPDATE OR DELETE ON run_model_snapshots
FOR EACH ROW EXECUTE FUNCTION guard_run_model_snapshot();--> statement-breakpoint
CREATE FUNCTION guard_historical_result_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical result record identity is immutable' USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER historical_result_records_immutable BEFORE UPDATE OR DELETE ON historical_result_records
FOR EACH ROW EXECUTE FUNCTION guard_historical_result_record();--> statement-breakpoint
CREATE FUNCTION guard_historical_result_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous historical_result_revisions%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Historical result revision is immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM historical_result_records WHERE id = NEW.record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Historical result record is missing' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO previous FROM historical_result_revisions
    WHERE record_id = NEW.record_id ORDER BY revision_no DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW.revision_no <> 1 OR NEW.supersedes_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'Initial historical revision must start at one' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.revision_no <> previous.revision_no + 1
        OR NEW.supersedes_revision_id IS DISTINCT FROM previous.id
        OR NEW.acquired_at < previous.acquired_at THEN
    RAISE EXCEPTION 'Historical revision must follow latest acquisition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER historical_result_revisions_guard BEFORE INSERT OR UPDATE OR DELETE ON historical_result_revisions
FOR EACH ROW EXECUTE FUNCTION guard_historical_result_revision();--> statement-breakpoint
CREATE FUNCTION guard_structural_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Reviewed structural reference is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_memberships WHERE user_id = NEW.reviewed_by AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Structural reference requires an administrator reviewer' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER structural_model_references_guard BEFORE INSERT OR UPDATE OR DELETE ON structural_model_references
FOR EACH ROW EXECUTE FUNCTION guard_structural_reference();--> statement-breakpoint
CREATE FUNCTION guard_poll_admin_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Poll administration decision is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_memberships WHERE user_id = NEW.actor_user_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Poll decision requires an administrator' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER poll_forecast_exclusions_guard BEFORE INSERT OR UPDATE OR DELETE ON poll_forecast_exclusions
FOR EACH ROW EXECUTE FUNCTION guard_poll_admin_decision();--> statement-breakpoint
CREATE TRIGGER poll_link_decisions_guard BEFORE INSERT OR UPDATE OR DELETE ON poll_link_decisions
FOR EACH ROW EXECUTE FUNCTION guard_poll_admin_decision();--> statement-breakpoint
CREATE FUNCTION guard_question_definition_after_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.outcome_definition, NEW.resolution_rule_version, NEW.slug)
     IS DISTINCT FROM (OLD.outcome_definition, OLD.resolution_rule_version, OLD.slug)
     AND EXISTS (SELECT 1 FROM forecast_runs WHERE question_id = OLD.id) THEN
    RAISE EXCEPTION 'Question definition is frozen after its first run' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER forecast_question_definition_immutable BEFORE UPDATE ON forecast_questions
FOR EACH ROW EXECUTE FUNCTION guard_question_definition_after_run();

--> statement-breakpoint
CREATE TABLE "poll_model_option_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"external_question_id" text NOT NULL,
	"race_id" uuid NOT NULL,
	"positive_option_id" text NOT NULL,
	"negative_option_id" text NOT NULL,
	"positive_party_id" text NOT NULL,
	"negative_party_id" text NOT NULL,
	"positive_caucus_id" text,
	"negative_caucus_id" text,
	"reviewed_by" text NOT NULL,
	"reason" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "poll_model_option_mappings_distinct_check" CHECK ("poll_model_option_mappings"."positive_option_id" <> "poll_model_option_mappings"."negative_option_id" and "poll_model_option_mappings"."positive_party_id" <> "poll_model_option_mappings"."negative_party_id")
);
--> statement-breakpoint
ALTER TABLE "poll_model_option_mappings" ADD CONSTRAINT "poll_model_option_mappings_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_model_option_mappings" ADD CONSTRAINT "poll_model_option_mappings_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_model_option_mappings" ADD CONSTRAINT "poll_model_option_mappings_positive_fk" FOREIGN KEY ("revision_id","external_question_id","positive_option_id") REFERENCES "poll_options"("revision_id","external_question_id","option_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_model_option_mappings" ADD CONSTRAINT "poll_model_option_mappings_negative_fk" FOREIGN KEY ("revision_id","external_question_id","negative_option_id") REFERENCES "poll_options"("revision_id","external_question_id","option_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_model_option_mappings_latest_idx" ON "poll_model_option_mappings" USING btree ("revision_id","external_question_id","race_id","reviewed_at");--> statement-breakpoint
ALTER TABLE "run_model_snapshots" ADD CONSTRAINT "run_model_snapshots_request_unique" UNIQUE("question_id","snapshot_hash","iterations");--> statement-breakpoint
CREATE FUNCTION guard_poll_model_option_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Reviewed option mapping is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_memberships WHERE user_id = NEW.reviewed_by AND revoked_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM poll_revisions WHERE id = NEW.revision_id AND sealed = true) THEN
    RAISE EXCEPTION 'Option mapping requires active reviewer and sealed revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER poll_model_option_mappings_guard BEFORE INSERT OR UPDATE OR DELETE ON poll_model_option_mappings
FOR EACH ROW EXECUTE FUNCTION guard_poll_model_option_mapping();
