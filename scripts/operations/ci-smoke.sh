#!/usr/bin/env bash
set -euo pipefail

# Only runs against the disposable CI project, never an existing deployment.
[[ "${CI:-}" == "true" && "${COMPOSE_PROJECT_NAME:-}" == "polls-ci" ]] || exit 1
cleanup() { docker compose down --volumes --remove-orphans; }
trap cleanup EXIT
docker compose config --quiet
docker compose build
docker compose up -d
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null
# Exercise the shipped seed with the restricted runtime role, keeping all sources disabled.
docker compose exec -T worker node dist-worker/composition/seed-cli.js
curl --fail --silent http://127.0.0.1:3000/usa/midterms/2026 >/dev/null
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -X POST -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{}' http://127.0.0.1:3000/api/admin)"
[[ "$status" == 401 ]]
# Reapplying the release step must preserve data and succeed.
docker compose run --rm migrate
docker compose exec -T postgres psql -U polls_owner -d polls -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'polls_app' AND
    (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Runtime role has elevated privileges';
  END IF;
  IF has_schema_privilege('polls_app', 'public', 'CREATE') OR
     has_schema_privilege('polls_app', 'polls_jobs', 'CREATE') THEN
    RAISE EXCEPTION 'Runtime role can create tables';
  END IF;
END $$;
SQL
docker compose exec -T worker node -e "fetch('http://web:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# A bounded CI smoke measurement, not a representative VPS capacity test.
docker compose exec -T -e LOAD_BASE_URL=http://web:3000 -e LOAD_REQUESTS=40 \
  -e LOAD_CONCURRENCY=4 worker node --input-type=module < scripts/operations/load-check.mjs
worker="$(docker compose ps -q worker)"
[[ -n "$worker" ]]
[[ "$(docker inspect --format '{{.RestartCount}}' "$worker")" == 0 ]]
printf 'Container startup, readiness, authorization and runtime permissions passed.\n'
