#!/usr/bin/env bash
# Provision a fresh Ubuntu 24.04 x86-64 host as a HiveMind lab worker (Stage 02, D-005, D-030).
#
#   sudo tools/host/provision.sh [--source /opt/hivemind] [--no-tunnel] [--no-images] [--ci] [--check]
#
# Idempotent: every step checks before it changes anything, so re-running after a
# partial failure or an upgrade is safe. The host holds no authoritative data
# (D-020): rebuilding it is this script plus the secrets in /etc/hivemind/worker.env.
#
# Environment (read once; written to /etc/hivemind/worker.env, mode 0600, never to git):
#   HIVEMIND_WORKER_ID              ubuntu-lab-worker-1 (default)
#   HIVEMIND_SESSION_URL            https://hivemind.jryans.dev (default)
#   HIVEMIND_WORKER_ENDPOINT        https://lab-worker.jryans.dev (default)
#   HIVEMIND_ACCESS_TEAM_DOMAIN     https://royal-breeze-2b7c.cloudflareaccess.com (default)
#   HIVEMIND_WORKER_ACCESS_AUD      AUD tag of the lab-worker Access application (required unless --ci)
#   HIVEMIND_ACCESS_CLIENT_ID       agent's service token (scope worker:callback) (required unless --ci)
#   HIVEMIND_ACCESS_CLIENT_SECRET
#   HIVEMIND_TUNNEL_TOKEN           cloudflared tunnel token (required unless --no-tunnel or --ci)
#   HIVEMIND_GIT_URL                repository to clone when --source does not exist
#   HIVEMIND_GIT_REF                branch or tag to check out (default: main)
#
# Pinned versions (bump deliberately; images are pinned by digest in the archetypes).
set -euo pipefail

CONTAINERLAB_VERSION="0.79.0"
LINUX_LAB_IMAGE_VERSION="1.0.0"
FRR_IMAGE="quay.io/frrouting/frr:10.7.1@sha256:e995beaa50fdc9edb35eadcfefa29b7f062cc06f2b812613789b68fa541554d2"
AGENT_LISTEN="127.0.0.1:8790"
STATE_DIR="/var/lib/hivemind-worker"
ENV_FILE="/etc/hivemind/worker.env"
UNIT_NAME="hivemind-worker"

log() { printf '==> %s\n' "$*" >&2; }
fail() { printf 'provision: %s\n' "$*" >&2; exit 1; }

SOURCE="/opt/hivemind"
WITH_TUNNEL=1
WITH_IMAGES=1
CI=0
CHECK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source=*) SOURCE="${1#*=}" ;;
    --source) shift; SOURCE="${1:?--source needs a path}" ;;
    --no-tunnel) WITH_TUNNEL=0 ;;
    --no-images) WITH_IMAGES=0 ;;
    --ci) CI=1; WITH_TUNNEL=0 ;;
    --check) CHECK=1 ;;
    -h|--help) sed -n 2,22p "$0"; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
  shift
done

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "run as root (sudo)"
  fi
}

require_ubuntu() {
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    fail "expected Ubuntu, found ${PRETTY_NAME:-unknown} (D-005: a dedicated Ubuntu x86-64 host)"
  fi
  if [[ "$(uname -m)" != "x86_64" && "$CI" -eq 0 ]]; then
    fail "expected x86_64, found $(uname -m)"
  fi
}

apt_install() {
  local missing=()
  for pkg in "$@"; do
    dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "installing ${missing[*]}"
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
  fi
}

step_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt_install ca-certificates curl gnupg git iptables jq lsb-release
}

step_docker() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    log "docker present: $(docker version --format '{{.Server.Version}}')"
  else
    log "installing Docker Engine from download.docker.com"
    install -m 0755 -d /etc/apt/keyrings
    if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
    fi
    . /etc/os-release
    cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    apt-get update -qq
    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin
    systemctl enable --now docker
  fi
  # Labs never get the socket; the agent (root) uses it locally. Keep the daemon
  # off the network and off any public port.
  if [[ ! -f /etc/docker/daemon.json ]]; then
    cat >/etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "default-address-pools": [{ "base": "172.30.0.0/16", "size": 24 }]
}
EOF
    systemctl restart docker
  fi
}

step_containerlab() {
  if command -v containerlab >/dev/null 2>&1 &&
     containerlab version 2>/dev/null | grep -q "version: ${CONTAINERLAB_VERSION}"; then
    log "containerlab ${CONTAINERLAB_VERSION} present"
    return
  fi
  log "installing containerlab ${CONTAINERLAB_VERSION}"
  local deb="/tmp/containerlab_${CONTAINERLAB_VERSION}_linux_amd64.deb"
  curl -fsSL -o "$deb" \
    "https://github.com/srl-labs/containerlab/releases/download/v${CONTAINERLAB_VERSION}/containerlab_${CONTAINERLAB_VERSION}_linux_amd64.deb"
  dpkg -i "$deb" >/dev/null
  rm -f "$deb"
  containerlab version | grep -q "version: ${CONTAINERLAB_VERSION}" || fail "containerlab install failed"
}

step_sysctl() {
  # containerlab and FRR need forwarding and generous inotify/arp tables.
  cat >/etc/sysctl.d/90-hivemind-lab.conf <<'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
fs.inotify.max_user_instances = 8192
fs.inotify.max_user_watches = 524288
net.ipv4.neigh.default.gc_thresh1 = 4096
net.ipv4.neigh.default.gc_thresh2 = 8192
net.ipv4.neigh.default.gc_thresh3 = 16384
EOF
  sysctl -q --system >/dev/null
}

step_uv() {
  if [[ -x /usr/local/bin/uv ]]; then
    log "uv present: $(/usr/local/bin/uv --version)"
  else
    log "installing uv"
    curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin INSTALLER_NO_MODIFY_PATH=1 sh >/dev/null
  fi
}

step_source() {
  if [[ "$CI" -eq 1 ]]; then
    log "using the checked-out source at $SOURCE"
  elif [[ -d "$SOURCE/.git" ]]; then
    log "updating source in $SOURCE"
    git -C "$SOURCE" fetch -q --all
    git -C "$SOURCE" checkout -q "${HIVEMIND_GIT_REF:-main}"
    git -C "$SOURCE" pull -q --ff-only || true
  elif [[ -d "$SOURCE/services/lab-worker" ]]; then
    log "using source tree at $SOURCE (not a git checkout)"
  else
    [[ -n "${HIVEMIND_GIT_URL:-}" ]] || fail "$SOURCE has no source; set HIVEMIND_GIT_URL or --source"
    log "cloning ${HIVEMIND_GIT_URL} into $SOURCE"
    git clone -q --branch "${HIVEMIND_GIT_REF:-main}" "$HIVEMIND_GIT_URL" "$SOURCE"
  fi
  log "syncing the agent's virtualenv"
  (cd "$SOURCE/services/lab-worker" && /usr/local/bin/uv sync --frozen --no-dev -q)
}

step_images() {
  [[ "$WITH_IMAGES" -eq 1 ]] || return 0
  local tag="hivemind/linux-lab:${LINUX_LAB_IMAGE_VERSION}"
  if docker image inspect "$tag" >/dev/null 2>&1; then
    log "$tag present"
  else
    log "building $tag"
    docker build -q -t "$tag" "$SOURCE/services/lab-worker/images/linux-lab" >/dev/null
  fi
  if docker image inspect "$FRR_IMAGE" >/dev/null 2>&1; then
    log "FRR image present"
  else
    log "pulling $FRR_IMAGE"
    docker pull -q "$FRR_IMAGE" >/dev/null
  fi
}

step_env_file() {
  [[ "$CI" -eq 0 ]] || return 0
  install -d -m 0750 /etc/hivemind "$STATE_DIR"
  if [[ -f "$ENV_FILE" && -z "${HIVEMIND_ACCESS_CLIENT_ID:-}" ]]; then
    log "keeping existing $ENV_FILE"
    return
  fi
  : "${HIVEMIND_WORKER_ACCESS_AUD:?set HIVEMIND_WORKER_ACCESS_AUD (docs/runbooks/lab-host.md)}"
  : "${HIVEMIND_ACCESS_CLIENT_ID:?set HIVEMIND_ACCESS_CLIENT_ID}"
  : "${HIVEMIND_ACCESS_CLIENT_SECRET:?set HIVEMIND_ACCESS_CLIENT_SECRET}"
  umask 077
  cat >"$ENV_FILE" <<EOF
HIVEMIND_WORKER_ID=${HIVEMIND_WORKER_ID:-ubuntu-lab-worker-1}
HIVEMIND_SESSION_URL=${HIVEMIND_SESSION_URL:-https://hivemind.jryans.dev}
HIVEMIND_WORKER_ENDPOINT=${HIVEMIND_WORKER_ENDPOINT:-https://lab-worker.jryans.dev}
HIVEMIND_ACCESS_TEAM_DOMAIN=${HIVEMIND_ACCESS_TEAM_DOMAIN:-https://royal-breeze-2b7c.cloudflareaccess.com}
HIVEMIND_WORKER_ACCESS_AUD=${HIVEMIND_WORKER_ACCESS_AUD}
HIVEMIND_ACCESS_CLIENT_ID=${HIVEMIND_ACCESS_CLIENT_ID}
HIVEMIND_ACCESS_CLIENT_SECRET=${HIVEMIND_ACCESS_CLIENT_SECRET}
HIVEMIND_WORKER_LISTEN=${AGENT_LISTEN}
HIVEMIND_WORKER_STATE_DIR=${STATE_DIR}
EOF
  chmod 0600 "$ENV_FILE"
  log "wrote $ENV_FILE"
}

step_service() {
  [[ "$CI" -eq 0 ]] || return 0
  local unit="/etc/systemd/system/${UNIT_NAME}.service"
  sed "s#/opt/hivemind#${SOURCE}#g" "$SOURCE/services/lab-worker/deploy/hivemind-worker.service" >"$unit"
  systemctl daemon-reload
  systemctl enable -q "$UNIT_NAME"
  systemctl restart "$UNIT_NAME"
  log "agent (re)started"
}

step_tunnel() {
  [[ "$WITH_TUNNEL" -eq 1 ]] || return 0
  if ! command -v cloudflared >/dev/null 2>&1; then
    log "installing cloudflared"
    install -m 0755 -d /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
      >/etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq
    apt_install cloudflared
  fi
  if systemctl is-active -q cloudflared; then
    log "cloudflared service active"
  else
    : "${HIVEMIND_TUNNEL_TOKEN:?set HIVEMIND_TUNNEL_TOKEN or pass --no-tunnel}"
    log "installing the cloudflared service from the tunnel token"
    cloudflared service install "$HIVEMIND_TUNNEL_TOKEN" >/dev/null
    systemctl enable -q --now cloudflared
  fi
}

step_check() {
  log "checking the host"
  docker info >/dev/null || fail "docker is not running"
  containerlab version | grep -q "version: ${CONTAINERLAB_VERSION}" || fail "containerlab version mismatch"
  [[ "$(sysctl -n net.ipv4.ip_forward)" == "1" ]] || fail "ip_forward is off"
  if [[ "$WITH_IMAGES" -eq 1 ]]; then
    docker image inspect "hivemind/linux-lab:${LINUX_LAB_IMAGE_VERSION}" >/dev/null || fail "linux-lab image missing"
    docker image inspect "$FRR_IMAGE" >/dev/null || fail "FRR image missing"
  fi
  (cd "$SOURCE/services/lab-worker" && .venv/bin/hivemind-worker --version >/dev/null) || fail "agent venv broken"
  if [[ "$CI" -eq 0 ]]; then
    systemctl is-active -q "$UNIT_NAME" || fail "agent service not active"
    curl -fsS "http://${AGENT_LISTEN}/health" | jq -e '.ok == true' >/dev/null || fail "agent health failed"
    # No public ports beyond sshd (Stage 02 acceptance 1): everything else is loopback.
    local public
    public="$(ss -Hltn | awk '{print $4}' | grep -Ev '^(127\.|\[::1\]|::1)' | grep -Ev ':22$' || true)"
    if [[ -n "$public" ]]; then
      fail "unexpected public listeners: $public"
    fi
    if [[ "$WITH_TUNNEL" -eq 1 ]]; then
      systemctl is-active -q cloudflared || fail "cloudflared not active"
    fi
  fi
  log "host ok"
}

main() {
  require_root
  require_ubuntu
  if [[ "$CHECK" -eq 1 ]]; then
    step_check
    return
  fi
  step_base_packages
  step_docker
  step_containerlab
  step_sysctl
  step_uv
  step_source
  step_images
  step_env_file
  step_service
  step_tunnel
  step_check
  log "done: the worker registers itself by heartbeat; see the Infrastructure console"
}

main "$@"
