#!/usr/bin/env bash
set -euo pipefail

# Run from the repository/release directory. Restic encrypts before remote storage.
: "${RESTIC_REPOSITORY:?Set an external restic repository}"
: "${RESTIC_PASSWORD_FILE:?Set a protected password file outside the repository}"
case "$RESTIC_REPOSITORY" in
  sftp:*|s3:*|b2:*|azure:*|gs:*|rest:https://*) ;;
  *) echo 'Backup requires a supported external encrypted repository.' >&2; exit 1 ;;
esac
command -v restic >/dev/null
command -v docker >/dev/null

# Restic checks pg_dump's exit code and will not publish a partial snapshot.
restic backup --stdin-filename polls.pgcustom --tag polls --tag postgres \
  --stdin-from-command -- docker compose exec -T postgres pg_dump \
  -U polls_owner -d polls --format=custom --no-owner --no-acl
restic check
# Retention is a separate, explicit maintenance command documented in BACKUP_RESTORE.md.
