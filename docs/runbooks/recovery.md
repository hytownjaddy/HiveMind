# Recovery runbook (D-020, D-030)

"Destroy the entire lab server and my learning history still exists." Authoritative
data lives in D1 and R2; the Ubuntu lab worker holds nothing that cannot be rebuilt.

## What protects the data

| Layer            | Mechanism                                                                                                                               | Where                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Point-in-time    | D1 Time Travel, 30 days                                                                                                                 | `wrangler d1 time-travel restore hivemind --timestamp <iso>` |
| Nightly export   | `.github/workflows/d1-export.yml` → `wrangler d1 export` → R2 `hivemind-exports/exports/d1/<stamp>.sql` plus a 90-day workflow artifact | `tools/backup/nightly-export.sh`                             |
| Portable archive | `hivemind export [--sql production]` writes `archive.json` (learners, content versions, work orders, attempts) and the SQL dump         | `.hivemind/exports/<stamp>/`                                 |
| Content          | `content/` in git is the source; a content version can always be re-published with `hivemind content publish`                           | git                                                          |

Enable the nightly job by setting the repository variable `HIVEMIND_NIGHTLY_EXPORT=true`
and the secrets `CLOUDFLARE_API_TOKEN` (D1 read + R2 write for the account) and
`CLOUDFLARE_ACCOUNT_ID`. Retention on the bucket is a lifecycle rule; set it once:

```bash
apps/web/node_modules/.bin/wrangler r2 bucket lifecycle add hivemind-exports --prefix exports/d1/ --expire-days 400
```

## Restore drill (run at every stage milestone)

Wrangler's `r2 object get|put` and `d1 execute` talk to **local** miniflare storage unless
`--remote` is given; every command below that touches the real account says `--remote`.

The drill imports an export into a **fresh** database and checks that the seeded learner,
the migration record, the immutability trigger, and the latest content version with the
gold lesson are all present. It never touches the live database.

```bash
# from the latest nightly export in R2
apps/web/node_modules/.bin/wrangler r2 object get hivemind-exports/exports/d1/<stamp>.sql --remote --file /tmp/export.sql
tools/backup/restore-drill.sh /tmp/export.sql                       # fresh local D1
tools/backup/restore-drill.sh /tmp/export.sql --remote hivemind-drill  # fresh remote D1, then delete it

# read the restored content through the real service path (what /api/lessons uses)
HIVEMIND_RESTORE_EXPORT=/tmp/export.sql bun --cwd packages/core test -- test/restore-drill.test.ts
```

CI runs the same drill on every push (`restore-drill` job): it seeds a source database
offline (`hivemind content publish --sql-out`), exports it, restores into a fresh database,
and reads the gold lesson back through `ContentService`.

## Restoring production

1. Stop writes: pause the nightly job and do not run `hivemind content publish`.
2. Prefer Time Travel for anything within 30 days:
   `wrangler d1 time-travel restore hivemind --timestamp 2026-09-09T02:00:00Z --env production`.
3. Otherwise create a new database (`wrangler d1 create hivemind-restored`), import the
   chosen export (`wrangler d1 execute hivemind-restored --remote --file export.sql`), run
   the drill checks against it, then point `database_id` in both `apps/web/wrangler.jsonc`
   and `apps/session-worker/wrangler.jsonc` at it and deploy (`tools/deploy.sh all production`).
4. Re-publish content if the export predates the latest content version:
   `hivemind content publish content/`. Content versions are immutable; re-publishing an
   identical tree reuses the version with the same hash.
5. Verify: `GET /api/health`, `GET /api/me`, open the gold lesson in the Course Workspace.

## After a D1 schema migration

Published content versions are rows, not code, so a migration that changes content tables
must carry the rows forward in SQL. If a migration cannot, re-publish from git after
migrating: `hivemind content publish content/` creates a new version; older versions remain
readable through `/api/lessons/{id}?version=<HM-CV-…>` as long as their rows exist.
Rollback of a migration uses its down script: `hivemind db migrate --down 0002 --production`.

## Lab worker loss

Nothing to restore. Re-provision the host (`tools/host/provision.sh`, Stage 02), deploy the
worker, reconnect the Tunnel. Sessions that were live are marked `failed` by the
`LabSession` object's deadlines; history in D1 is untouched.
