# Lab host runbook (Stage 02, D-005, D-030, D-047)

The Ubuntu x86-64 lab host runs privileged networking labs (Class B) and single-node
Linux labs (Class C). It is disposable: every fact worth keeping lives in D1 and R2, so a
lost host is `tools/host/provision.sh` on a new machine plus the secrets below.

```text
hivemind.jryans.dev (web Worker) ──/session/*──▶ session Worker ──jobs──▶ lab-worker.jryans.dev
                                                        ▲                       │ Tunnel
                                                        │ heartbeat, events,    ▼
                                                        └────── reconcile ── Python agent (127.0.0.1:8790)
                                                                                 │ Docker socket (local only)
                                                                                 ▼
                                                                    docker + containerlab + FRR
```

## One-time Cloudflare setup

1. **Tunnel.** Zero Trust → Networking → Tunnels → Create a tunnel (Cloudflared), name
   `hivemind-lab-worker-1`. Copy the token: that is `HIVEMIND_TUNNEL_TOKEN`. Add a
   published application route: hostname `lab-worker` on `jryans.dev`, service
   `http://localhost:8790`.
2. **Access application for the worker.** Access → Applications → Self-hosted, domain
   `lab-worker.jryans.dev`. Policy: `Service Auth`, allow the service token from step 3.
   Copy the application AUD tag: that is `HIVEMIND_WORKER_ACCESS_AUD`. No human policy is
   needed; only the session Worker calls this hostname.
3. **Service token for the session Worker → worker path.** Access → Service Auth → Create
   token `hivemind-session-worker`. Put it on the session Worker as secrets:
   `LAB_WORKER_CLIENT_ID` and `LAB_WORKER_CLIENT_SECRET` (`tools/deploy.sh secrets production`
   with `HIVEMIND_LAB_WORKER_CLIENT_ID` / `HIVEMIND_LAB_WORKER_CLIENT_SECRET` set).
4. **Service token for the worker → session Worker path.** Create token `hivemind-lab-worker-1`
   and grant it the `worker:callback` scope on both Workers, keyed by its Client ID
   (`docs/runbooks/access.md` step 4):
   `{"<client-id>.access":["worker:callback"]}` merged into `HIVEMIND_SERVICE_TOKEN_SCOPES`.
   Also add an `Allow` policy with `Service Auth` = this token on the `hivemind.jryans.dev`
   application so Access lets its calls through to `/session/worker/*`.
5. **CLI scope.** Grant the existing `hivemind-cli` token `lab:operate` the same way so
   `hivemind lab` can act for the learner.
6. **Buckets and schema.** `wrangler r2 bucket create hivemind-artifacts` (and
   `hivemind-artifacts-dev`), then `hivemind db migrate --production` (migration 0003) and
   `tools/deploy.sh all production` (the session Worker deploy also builds and pushes the
   Sandbox image; Docker must be running where you deploy from).

## Provision the host

Rent an Ubuntu 24.04 x86-64 host (4 vCPU, 8 GB, 80 GB is plenty for the first track), or
use home hardware: [home-laptop.md](home-laptop.md) takes a Windows laptop to a Wi-Fi-only
Ubuntu Server box that runs this section unchanged. Only sshd may listen publicly; the
agent and cloudflared are loopback-only.

```bash
ssh root@<host>
export HIVEMIND_GIT_URL=git@github.com:<owner>/HiveMind.git   # or copy the tree to /opt/hivemind
export HIVEMIND_WORKER_ACCESS_AUD=<aud from step 2>
export HIVEMIND_ACCESS_CLIENT_ID=<client id from step 4>
export HIVEMIND_ACCESS_CLIENT_SECRET=<client secret from step 4>
export HIVEMIND_TUNNEL_TOKEN=<token from step 1>
curl -fsSL https://raw.githubusercontent.com/<owner>/HiveMind/main/tools/host/provision.sh | bash
```

The script installs Docker, containerlab 0.79.0, uv, the agent's virtualenv, builds
`hivemind/linux-lab` from its digest-pinned base, pulls FRR by digest, writes
`/etc/hivemind/worker.env` (0600), installs and starts the `hivemind-worker` systemd unit,
installs cloudflared from the token, and runs its own checks. Re-run it any time; it only
changes what differs. Fifteen minutes on a fresh host is the budget (acceptance 1).

Verify from your laptop:

```bash
hivemind lab up linux.single --seed 1     # ready in < 10 s on the worker, drops into a shell
hivemind lab up bgp.dual_spine --seed 7   # four FRR routers in < 60 s
hivemind lab ls
hivemind lab down --all
ssh root@<host> 'docker ps -a --filter label=hivemind.session; containerlab inspect --all'
```

The Infrastructure console (`/system/infrastructure`) shows the worker `online` with its
runtime versions within one heartbeat interval (15 s).

## Operations

- **Upgrade the agent.** `sudo tools/host/provision.sh` (pulls `main`, re-syncs the venv,
  restarts the unit). Rolling back is `HIVEMIND_GIT_REF=<previous tag>` and the same command;
  in-flight sessions become `failed` with `worker_lost_session` on the next reconcile.
- **Logs.** `journalctl -u hivemind-worker -f` and `journalctl -u cloudflared -f`.
- **Sweeper.** The agent reconciles with the session Worker every 60 s and destroys labs
  the objects no longer expect or whose hard TTL passed. By hand:
  `/opt/hivemind/services/lab-worker/.venv/bin/hivemind-worker agent reconcile`.
- **Orphans without a control plane.** `hivemind-worker lab ls` and
  `hivemind-worker lab destroy --session HM-LAB-nnnnnn` work offline.
- **Kill test (acceptance 7).** `systemctl kill -s KILL hivemind-worker` mid-session; the
  unit restarts in 3 s, reports its local sessions, and the objects reconcile: sessions
  still present stay `active`, missing ones fail with a reason.

## Rebuild drill

1. Destroy the host at the provider.
2. Rent a new one; run the provisioning block above with the same environment.
3. `hivemind lab up linux.single --seed 1`. No learner history is on the host; nothing is lost.

## Break-glass

- **Tunnel down.** `systemctl restart cloudflared`; if the token was rotated, re-run
  `cloudflared service uninstall` then provision with the new `HIVEMIND_TUNNEL_TOKEN`.
- **Agent rejects the session Worker (401).** The worker's Access app AUD or the team domain
  changed: update `/etc/hivemind/worker.env` and `systemctl restart hivemind-worker`.
- **Session Worker rejects the agent (401/403).** The worker's service token is missing the
  `worker:callback` scope on the Workers, or the Access policy on `hivemind.jryans.dev`
  does not allow the token. Fix in Zero Trust and `tools/deploy.sh secrets production`.
- **Labs can reach the internet.** `iptables -S DOCKER-USER | grep hivemind:` must show a
  DROP per running session; `iptables -S INPUT | grep hivemind:` likewise. Re-provision to
  restore the rules, or destroy the session and start again.
