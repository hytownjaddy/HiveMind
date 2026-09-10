#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# bun installs wrangler under the workspace that depends on it.
WRANGLER="$ROOT/apps/web/node_modules/.bin/wrangler"
if [[ ! -x "$WRANGLER" ]]; then
  WRANGLER="$ROOT/node_modules/.bin/wrangler"
fi
if [[ ! -x "$WRANGLER" ]]; then
  echo "Missing wrangler binary. Run: bun install" >&2
  exit 1
fi

usage() {
  cat <<'USAGE'
Usage:
  tools/deploy.sh [session|web|secrets|migrate|all] [dev|production] [--sandbox]

Commands:
  session   Deploy the session Worker (gateway + LabSession Durable Object)
  web       Build the OpenNext bundle and deploy the web Worker
  secrets   Set SERVICE_TOKEN_SCOPES on both Workers from HIVEMIND_SERVICE_TOKEN_SCOPES
  migrate   Apply D1 migrations to the remote database
  all       migrate, session, web (default; run `secrets` once per environment)

Environment (default: dev = top-level wrangler config; production = --env production)

Identity (D-033) is configured as wrangler vars: ACCESS_TEAM_DOMAIN and ACCESS_AUD in
apps/web/wrangler.jsonc and apps/session-worker/wrangler.jsonc. See docs/runbooks/access.md.

Variables:
  HIVEMIND_SERVICE_TOKEN_SCOPES
      JSON map of Access service-token Client IDs (the JWT common_name) to scopes, e.g.
      {"<cli-id>.access":["content:publish","export:read","lab:operate"],
       "<worker-id>.access":["worker:callback"]}
  HIVEMIND_LAB_WORKER_CLIENT_ID / HIVEMIND_LAB_WORKER_CLIENT_SECRET
      Service token the session Worker presents to lab workers behind Access
      (docs/runbooks/lab-host.md step 3); set on the session Worker only.

The session Worker deploy builds and pushes the Sandbox container image
(apps/session-worker/sandbox/Dockerfile); Docker must be running locally.
USAGE
}

command="${1:-all}"
target="${2:-dev}"
SESSION_CONFIG="apps/session-worker/wrangler.jsonc"
for arg in "$@"; do
  # --sandbox deploys the session Worker with the Cloudflare Sandbox container (Workers Paid).
  [[ "$arg" == "--sandbox" ]] && SESSION_CONFIG="apps/session-worker/wrangler.sandbox.jsonc"
done
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

deploy_session() {
  echo "==> Deploying session Worker ($target)"
  "$WRANGLER" deploy -c "$SESSION_CONFIG" "${ENV_ARGS[@]}"
}

deploy_web() {
  echo "==> Building OpenNext bundle"
  bun run build:web
  echo "==> Deploying web Worker ($target)"
  "$WRANGLER" deploy -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
}

put_secrets() {
  local scopes="${HIVEMIND_SERVICE_TOKEN_SCOPES:-}"
  if [[ -z "$scopes" ]]; then
    echo "Set HIVEMIND_SERVICE_TOKEN_SCOPES to a JSON map of service-token common names to scopes." >&2
    exit 1
  fi
  echo "==> Setting SERVICE_TOKEN_SCOPES on session Worker"
  printf '%s' "$scopes" | "$WRANGLER" secret put SERVICE_TOKEN_SCOPES \
    -c apps/session-worker/wrangler.jsonc "${ENV_ARGS[@]}"
  echo "==> Setting SERVICE_TOKEN_SCOPES on web Worker"
  printf '%s' "$scopes" | "$WRANGLER" secret put SERVICE_TOKEN_SCOPES \
    -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
  if [[ -n "${HIVEMIND_LAB_WORKER_CLIENT_ID:-}" && -n "${HIVEMIND_LAB_WORKER_CLIENT_SECRET:-}" ]]; then
    echo "==> Setting LAB_WORKER_CLIENT_ID/SECRET on session Worker"
    printf '%s' "$HIVEMIND_LAB_WORKER_CLIENT_ID" | "$WRANGLER" secret put LAB_WORKER_CLIENT_ID \
      -c apps/session-worker/wrangler.jsonc "${ENV_ARGS[@]}"
    printf '%s' "$HIVEMIND_LAB_WORKER_CLIENT_SECRET" | "$WRANGLER" secret put LAB_WORKER_CLIENT_SECRET \
      -c apps/session-worker/wrangler.jsonc "${ENV_ARGS[@]}"
  fi
}

migrate() {
  echo "==> Applying D1 migrations ($target)"
  "$WRANGLER" d1 migrations apply DB --remote -c apps/web/wrangler.jsonc "${ENV_ARGS[@]}"
}

case "$command" in
  -h | --help | help) usage ;;
  session) ensure_logged_in; deploy_session ;;
  web) ensure_logged_in; deploy_web ;;
  secrets) ensure_logged_in; put_secrets ;;
  migrate) ensure_logged_in; migrate ;;
  all)
    ensure_logged_in
    migrate
    deploy_session
    deploy_web
    echo
    echo "Deploy complete. Sign in through Cloudflare Access at the web Worker URL."
    ;;
  *) usage >&2; exit 1 ;;
esac
