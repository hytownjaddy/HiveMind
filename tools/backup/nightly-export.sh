#!/usr/bin/env bash
# Export the production D1 database and store it in R2 (D-020, D-030).
# Runs nightly from .github/workflows/d1-export.yml; also usable by hand.
#
#   tools/backup/nightly-export.sh [dev|production] [output-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
WRANGLER="$ROOT/apps/web/node_modules/.bin/wrangler"
TARGET="${1:-production}"
OUT_DIR="${2:-.hivemind/exports}"
case "$TARGET" in
  dev) ENV_ARGS=(); BUCKET="hivemind-exports-dev" ;;
  production) ENV_ARGS=(--env production); BUCKET="hivemind-exports" ;;
  *) echo "target must be dev or production" >&2; exit 2 ;;
esac
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/d1-$STAMP.sql"

echo "==> Exporting D1 ($TARGET) to $FILE"
"$WRANGLER" d1 export DB --remote --output "$FILE" -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
echo "==> Uploading to r2://$BUCKET/exports/d1/$STAMP.sql"
"$WRANGLER" r2 object put "$BUCKET/exports/d1/$STAMP.sql" --file "$FILE" --content-type application/sql
echo "$FILE"
