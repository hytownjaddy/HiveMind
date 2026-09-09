# Cloudflare Access setup and break-glass (D-033, D-040)

HiveMind trusts the identity Cloudflare Access puts on each request; it never runs its
own login. This runbook creates that setup once and gives a way back in if it locks you
out.

## One-time setup

1. **Google IdP.** In Google Cloud Console create an OAuth client (Web application) with
   redirect URI `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`. In Zero
   Trust → Settings → Authentication add Google with that client id and secret.
2. **Access application.** Zero Trust → Access → Applications → Self-hosted:
   domain `hivemind.jryans.dev`, session duration 24 h, identity provider
   Google only. Policy `Allow` with `Emails` = your Google address. Copy the application
   **AUD tag** (the 64-character hex string under Overview, not the Application ID UUID).
   Team domain for this account: `https://royal-breeze-2b7c.cloudflareaccess.com`.
3. **Worker vars.** Put the team domain and AUD into both wrangler configs
   (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` under `env.production` in `apps/web/wrangler.jsonc`
   and `apps/session-worker/wrangler.jsonc`), then deploy.
4. **Service token for the CLI.** Zero Trust → Access → Service Auth → Create token
   `hivemind-cli`. Add an `Allow` policy on the application with `Service Auth` = that
   token. Grant scopes on the Workers, keyed by the token's **Client ID** (the
   `…​.access` value; Access puts the Client ID, not the token name, in the JWT's
   `common_name` claim):
   `HIVEMIND_SERVICE_TOKEN_SCOPES='{"<client-id>.access":["content:publish","export:read"]}' tools/deploy.sh secrets production`.
   Locally export `HIVEMIND_ACCESS_CLIENT_ID` / `HIVEMIND_ACCESS_CLIENT_SECRET` and
   `HIVEMIND_API_URL=https://hivemind.jryans.dev` for `hivemind content publish`.
5. **First sign-in.** The seeded learner `HM-LRN-000001` binds to the first validated
   identity (`GET /api/me` shows it). Any other identity is rejected with 403 even if
   Access lets it through, so the Access policy and the binding agree.

## Break-glass

- **Locked out of Access (policy or IdP misconfiguration).** The Zero Trust dashboard is
  separate from the application; fix the policy there. No HiveMind change is needed.
- **Wrong identity bound to the learner** (for example a second Google account signed in
  first). Rebind with SQL — the mapping is one row:
  `wrangler d1 execute hivemind --remote --env production --command "UPDATE learners SET email = NULL, access_subject = NULL WHERE id = 'HM-LRN-000001'"`
  and sign in again with the right account.
- **AUD or team domain changed.** Every request gets 401 from the Worker even though Access
  allowed it. Update the vars and redeploy; `GET /api/health` needs no identity and confirms
  the Worker is up.
- **Need to run the CLI without a service token.** Only against a local dev server:
  `ACCESS_DEV_BYPASS_EMAIL` in `.dev.vars` works when `HIVEMIND_ENV=development`, never in
  production.
- **Pinned keys.** `ACCESS_JWKS` (a JSON Web Key Set) makes both Workers verify tokens
  offline. Leave it unset in production so rotation is picked up from
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.
