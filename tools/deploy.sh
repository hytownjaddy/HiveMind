#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WRANGLER="$ROOT/node_modules/.bin/wrangler"
if [[ ! -x "$WRANGLER" ]]; then
  echo "Missing wrangler binary. Run: bun install" >&2
  exit 1
fi

usage() {
  cat <<'USAGE'
Usage:
  tools/deploy.sh [realtime|web|secret|migrate|all] [dev|production]

Commands:
  realtime  Deploy the realtime Worker (gateway + LabSession Durable Object)
  web       Build the OpenNext bundle and deploy the web Worker
  secret    Set GUEST_SESSION_SECRET on both Workers
  migrate   Apply D1 migrations to the remote database
  all       realtime, secret, migrate, web (default)

Environment (default: dev = top-level wrangler config; production = --env production)

Variables:
  HIVEMIND_GUEST_SESSION_SECRET
      Optional. If unset during secret/all, a new secret is generated and printed.
USAGE
}

command="${1:-all}"
target="${2:-dev}"
case "$target" in
  dev) ENV_ARGS=() ;;
  production) ENV_ARGS=(--env production) ;;
  *) echo "Unknown environment: $target" >&2; usage >&2; exit 1 ;;
esac

ensure_logged_in() {
  if ! "$WRANGLER" whoami >/dev/null 2>&1; then
    echo "Wrangler is not authenticated. Run: $WRANGLER login" >&2
    exit 1
  fi
}

deploy_realtime() {
  echo "==> Deploying realtime Worker ($target)"
  "$WRANGLER" deploy -c apps/realtime-worker/wrangler.jsonc "${ENV_ARGS[@]}"
}

deploy_web() {
  echo "==> Building OpenNext bundle"
  bun run build:web
  echo "==> Deploying web Worker ($target)"
  "$WRANGLER" deploy -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
}

put_secrets() {
  local secret="${HIVEMIND_GUEST_SESSION_SECRET:-}"
  if [[ -z "$secret" ]]; then
    secret="$(openssl rand -base64 48)"
    echo "==> Generated GUEST_SESSION_SECRET (save it; re-run with HIVEMIND_GUEST_SESSION_SECRET=... to reuse)"
    echo "$secret"
    echo
  else
    echo "==> Using HIVEMIND_GUEST_SESSION_SECRET from environment"
  fi
  echo "==> Setting secret on realtime Worker"
  printf '%s' "$secret" | "$WRANGLER" secret put GUEST_SESSION_SECRET \
    -c apps/realtime-worker/wrangler.jsonc "${ENV_ARGS[@]}"
  echo "==> Setting secret on web Worker"
  printf '%s' "$secret" | "$WRANGLER" secret put GUEST_SESSION_SECRET \
    -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
}

migrate() {
  echo "==> Applying D1 migrations ($target)"
  "$WRANGLER" d1 migrations apply DB --remote -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
}

case "$command" in
  -h | --help | help) usage ;;
  realtime) ensure_logged_in; deploy_realtime ;;
  web) ensure_logged_in; deploy_web ;;
  secret) ensure_logged_in; put_secrets ;;
  migrate) ensure_logged_in; migrate ;;
  all)
    ensure_logged_in
    deploy_realtime
    put_secrets
    migrate
    deploy_web
    echo
    echo "Deploy complete. Open the web Worker URL from the output above and launch a lab."
    ;;
  *) usage >&2; exit 1 ;;
esac
