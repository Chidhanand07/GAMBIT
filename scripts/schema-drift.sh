#!/usr/bin/env bash
#
# Schema drift check (SEC-08, GIT-08): does the hosted Supabase database still match
# supabase/migrations?
#
# The CLI builds a shadow database from supabase/migrations and diffs the linked project against
# it. Any SQL in the diff means somebody changed the remote outside a migration (or a migration in
# the repo was never applied). This script only reads: it never pushes, repairs or resets anything.
#
# Usage (repo root):   scripts/schema-drift.sh
# Needs:               Supabase CLI and a running Docker daemon (the shadow database is a container).
#
# Environment
#   SUPABASE_ACCESS_TOKEN   personal access token (CI). Locally `supabase login` does the same.
#   SUPABASE_DB_PASSWORD    database password of the project (read by the CLI, never echoed here).
#   SUPABASE_PROJECT_REF    project ref. When set, the script links first. When unset, the working
#                           copy must already be linked (`supabase link <ref>`).
#   SCHEMA_DRIFT_SCHEMAS    comma-separated schemas to compare. Default: public. Without a schema
#                           list the CLI diffs every schema, including the Supabase-managed ones
#                           (auth, storage, ...) that migrations here do not own.
#   SCHEMA_DRIFT_TARGET     override the target flag (default: --remote on CLI >= 3, --linked on 2.x).
#   SCHEMA_DRIFT_OUTPUT     where to write the diff SQL (default: a temp file, removed on exit).
#
# Exit codes: 0 no drift, 1 drift found, 2 the check could not run (treat as a failure, not as "clean").
#
# Verification status (2026-11): written against the CLI v3.1.0 reference docs
# (`db diff --remote`, `-s/--schema`, `link --project-ref`, `migration list --remote`; diff SQL goes
# to stdout). It has NOT been executed against a real project: no CLI or Docker was available where
# it was written. The CLI 2.x branch (`--linked`) is from the v3 migration guide, also not executed.

set -euo pipefail

SCHEMAS="${SCHEMA_DRIFT_SCHEMAS:-public}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "schema-drift: $*" >&2
  exit 2
}

command -v supabase >/dev/null 2>&1 || fail "the Supabase CLI is not installed (https://supabase.com/docs/guides/local-development/cli/getting-started)"
docker info >/dev/null 2>&1 || fail "Docker is not running; the CLI needs it for the shadow database"
[ -d supabase/migrations ] || fail "supabase/migrations not found under $REPO_ROOT"

# --remote replaced --linked in CLI v3; --linked is removed in v4.
VERSION="$(supabase --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
MAJOR="${VERSION%%.*}"
if [ -n "${SCHEMA_DRIFT_TARGET:-}" ]; then
  TARGET="$SCHEMA_DRIFT_TARGET"
elif [ -n "$MAJOR" ] && [ "$MAJOR" -lt 3 ]; then
  TARGET="--linked"
else
  TARGET="--remote"
fi
echo "schema-drift: Supabase CLI ${VERSION:-unknown}, target flag $TARGET, schemas: $SCHEMAS"

if [ -n "${SUPABASE_PROJECT_REF:-}" ]; then
  [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || fail "SUPABASE_PROJECT_REF is set but SUPABASE_ACCESS_TOKEN is not"
  [ -n "${SUPABASE_DB_PASSWORD:-}" ] || fail "SUPABASE_PROJECT_REF is set but SUPABASE_DB_PASSWORD is not"
  # Output discarded: it would only repeat the project ref. The password travels in the environment.
  supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null 2>&1 ||
    fail "supabase link failed (check the project ref, the access token and the database password)"
elif [ ! -f supabase/.temp/project-ref ]; then
  fail "not linked: run 'supabase link <project-ref>' or set SUPABASE_PROJECT_REF"
fi

if [ -n "${SCHEMA_DRIFT_OUTPUT:-}" ]; then
  DIFF_FILE="$SCHEMA_DRIFT_OUTPUT"
else
  DIFF_FILE="$(mktemp)"
  trap 'rm -f "$DIFF_FILE"' EXIT
fi

# Informational only: the applied-migration history next to the files. A mismatch here is repaired
# with `supabase migration repair`, never by editing the remote. It does not decide the exit code,
# because the table layout is not a stable interface to parse.
echo "schema-drift: migration history (local files vs remote):"
# shellcheck disable=SC2086
supabase migration list $TARGET || echo "schema-drift: could not list the migration history (continuing with the diff)" >&2

# Diff SQL on stdout -> file. Progress and "No schema changes found" go to stderr and stay visible.
# No --debug on purpose: debug logs can include connection details.
# shellcheck disable=SC2086
if ! supabase db diff $TARGET --schema "$SCHEMAS" >"$DIFF_FILE"; then
  fail "supabase db diff failed; drift is UNKNOWN"
fi

# Drift = any line that is neither blank nor an SQL line comment.
if grep -Ev '^[[:space:]]*(--.*)?$' "$DIFF_FILE" >/dev/null; then
  echo "schema-drift: DRIFT FOUND. The remote differs from supabase/migrations by:" >&2
  echo "----------------------------------------------------------------------"
  cat "$DIFF_FILE"
  echo "----------------------------------------------------------------------"
  echo "schema-drift: capture it in a migration (supabase migration new <name>), or write a migration" >&2
  echo "schema-drift: that reverts it. Never edit the remote by hand (SEC-08). See DEPLOY.md section 9." >&2
  exit 1
fi

echo "schema-drift: OK, the remote schema matches supabase/migrations ($SCHEMAS)."
