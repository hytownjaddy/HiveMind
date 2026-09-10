-- Down script for 0003_lab_runtime.sql. Applied by `hivemind db migrate --down 0003`.
-- SQLite drops columns in place (3.35+, which D1 runs); sessions created by Stage 02
-- keep their base columns and lose provider/topology detail.

DROP TABLE IF EXISTS lab_session_events;
DROP INDEX IF EXISTS idx_lab_sessions_worker;
DROP INDEX IF EXISTS idx_lab_sessions_status;
ALTER TABLE lab_sessions DROP COLUMN finished_at;
ALTER TABLE lab_sessions DROP COLUMN hard_ttl_at;
ALTER TABLE lab_sessions DROP COLUMN reason;
ALTER TABLE lab_sessions DROP COLUMN recording_keys_json;
ALTER TABLE lab_sessions DROP COLUMN nodes_json;
ALTER TABLE lab_sessions DROP COLUMN topology_json;
ALTER TABLE lab_sessions DROP COLUMN worker_id;
ALTER TABLE lab_sessions DROP COLUMN provider_class;
ALTER TABLE lab_sessions DROP COLUMN seed;
ALTER TABLE lab_sessions DROP COLUMN archetype_version;
ALTER TABLE lab_sessions DROP COLUMN archetype;
DROP TABLE IF EXISTS lab_workers;
