#!/usr/bin/env bash
# Restore drill (D-020, Stage 01 acceptance 5): import a D1 export into a FRESH
# database and prove the learner and the published content survive.
#
#   tools/backup/restore-drill.sh <export.sql> [--remote <database-name>] [--expect-lesson <id>]
#
# Default target is a fresh local D1 under a temporary persist directory. With
# --remote, a brand-new remote database is created with that name (delete it
# afterwards with `wrangler d1 delete`). Exit code 0 means every check passed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
WRANGLER="$ROOT/apps/web/node_modules/.bin/wrangler"
CONFIG="apps/web/wrangler.jsonc"

EXPORT="${1:-}"
shift || true
REMOTE=""
EXPECT_LESSON="${HIVEMIND_EXPECT_LESSON:-HM-LESSON-linux-networking-01}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote) REMOTE="$2"; shift 2 ;;
    --expect-lesson) EXPECT_LESSON="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$EXPORT" || ! -f "$EXPORT" ]]; then
  echo "usage: tools/backup/restore-drill.sh <export.sql> [--remote <database-name>] [--expect-lesson <id>]" >&2
  exit 2
fi

if [[ -n "$REMOTE" ]]; then
  echo "==> Creating fresh remote database $REMOTE"
  "$WRANGLER" d1 create "$REMOTE" >/dev/null
  TARGET=(d1 execute "$REMOTE" --remote)
  QUERY=(d1 execute "$REMOTE" --remote --json)
else
  PERSIST="$(mktemp -d "${TMPDIR:-/tmp}/hivemind-restore-XXXXXX")"
  echo "==> Fresh local database under $PERSIST"
  TARGET=(d1 execute DB --local --persist-to "$PERSIST" -c "$CONFIG")
  QUERY=(d1 execute DB --local --persist-to "$PERSIST" -c "$CONFIG" --json)
fi

echo "==> Importing $EXPORT"
"$WRANGLER" "${TARGET[@]}" --file "$EXPORT" >/dev/null

count() {
  "$WRANGLER" "${QUERY[@]}" --command "$1" | python3 -c 'import sys,json; rows=json.load(sys.stdin)[0]["results"]; print(rows[0]["n"] if rows else 0)'
}

fail=0
check() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS  $label = $actual"
  else
    echo "FAIL  $label = $actual (expected $expected)"
    fail=1
  fi
}

echo "==> Checks"
check "seeded learner present" "$(count "SELECT COUNT(*) AS n FROM learners WHERE id = 'HM-LRN-000001'")" 1
check "migrations recorded" "$(count "SELECT COUNT(*) AS n FROM d1_migrations WHERE name = '0002_foundation.sql'")" 1
check "attempts trigger present" "$(count "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = 'attempts_no_delete'")" 1
versions="$(count "SELECT COUNT(*) AS n FROM content_versions")"
echo "INFO  content versions = $versions"
if [[ "$versions" != "0" ]]; then
  check "gold lesson $EXPECT_LESSON in latest version" "$(count "SELECT COUNT(*) AS n FROM lessons WHERE id = '$EXPECT_LESSON' AND content_version_id = (SELECT MAX(id) FROM content_versions)")" 1
else
  echo "FAIL  no content versions in export; publish before exporting"
  fail=1
fi

if [[ -n "$REMOTE" ]]; then
  echo "==> Remote database $REMOTE left in place for inspection; delete with: $WRANGLER d1 delete $REMOTE"
fi
exit "$fail"
