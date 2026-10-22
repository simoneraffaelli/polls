#!/usr/bin/env bash
set -euo pipefail

: "${RESTIC_REPOSITORY:?Set the external restic repository}"
: "${RESTIC_PASSWORD_FILE:?Set a protected password file}"
snapshot="${1:?Pass an explicit restic snapshot ID}"
[[ "$snapshot" =~ ^[a-f0-9]{8,64}$ ]] || { echo 'Invalid snapshot ID.' >&2; exit 1; }
container="polls-restore-check-$(date +%s)-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
started="$(date +%s)"
# No network or host volume: the only target is this disposable test container.
docker run --detach --rm --name "$container" --network none --memory 768m \
  --tmpfs /var/lib/postgresql/data:rw,size=2g \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=polls_restore_test \
  -e POSTGRES_DB=polls_restore_test postgres:17.11-bookworm >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$container" pg_isready -U polls_restore_test -d polls_restore_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Restore database did not start.' >&2; exit 1; }
restic dump "$snapshot" /polls.pgcustom \
  | docker exec -i "$container" pg_restore -U polls_restore_test -d polls_restore_test \
      --no-owner --no-acl --exit-on-error
docker exec "$container" psql -U polls_restore_test -d polls_restore_test -v ON_ERROR_STOP=1 \
  -c 'SELECT count(*) AS countries FROM countries;' \
  -c 'SELECT count(*) AS poll_revisions FROM poll_revisions;' \
  -c 'SELECT count(*) AS forecast_runs FROM forecast_runs;'
printf 'Restore check succeeded in %s seconds; snapshot %s.\n' "$(( $(date +%s) - started ))" "$snapshot"
