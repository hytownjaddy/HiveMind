-- Stage 02 lab runtime (STAGE_02 "Data/schema changes"): the lab worker registry,
-- the session index columns for provider class, worker, topology instance, nodes,
-- and recording references, and the durable session event log. Live session state
-- stays in the LabSession Durable Object (D-030); these rows answer "what ran where"
-- for the Infrastructure console, reconciliation, and history.
-- Down script: migrations/down/0003_lab_runtime.down.sql.

CREATE TABLE lab_workers (
    id TEXT PRIMARY KEY,                -- worker id from the heartbeat, e.g. ubuntu-lab-worker-1
    status TEXT NOT NULL,               -- online | degraded | offline (derived on read from the heartbeat age)
    capabilities_json TEXT NOT NULL,    -- Capability[]
    endpoint TEXT,                      -- https://lab-worker.jryans.dev
    agent_version TEXT,
    hostname TEXT,
    runtime_versions_json TEXT NOT NULL,
    load_json TEXT NOT NULL,            -- {cpu_percent, memory_percent}
    active_sessions INTEGER NOT NULL,
    registered_at TEXT NOT NULL,
    last_heartbeat_at TEXT NOT NULL
);

ALTER TABLE lab_sessions ADD COLUMN archetype TEXT;
ALTER TABLE lab_sessions ADD COLUMN archetype_version TEXT;
ALTER TABLE lab_sessions ADD COLUMN seed INTEGER;
ALTER TABLE lab_sessions ADD COLUMN provider_class TEXT;     -- A | B | C
ALTER TABLE lab_sessions ADD COLUMN worker_id TEXT;
ALTER TABLE lab_sessions ADD COLUMN topology_json TEXT;      -- TopologyInstance
ALTER TABLE lab_sessions ADD COLUMN nodes_json TEXT;         -- [{name, role, address?}]
ALTER TABLE lab_sessions ADD COLUMN recording_keys_json TEXT; -- R2 keys per node
ALTER TABLE lab_sessions ADD COLUMN reason TEXT;             -- failure or destroy reason
ALTER TABLE lab_sessions ADD COLUMN hard_ttl_at TEXT;
ALTER TABLE lab_sessions ADD COLUMN finished_at TEXT;

CREATE INDEX idx_lab_sessions_status ON lab_sessions (status, updated_at DESC);
CREATE INDEX idx_lab_sessions_worker ON lab_sessions (worker_id, status);

CREATE TABLE lab_session_events (
    lab_session_id TEXT NOT NULL REFERENCES lab_sessions(id),
    sequence INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,                 -- status_changed | notice | log (never pty_output)
    event_json TEXT NOT NULL,           -- SessionEvent
    PRIMARY KEY (lab_session_id, sequence)
);

CREATE INDEX idx_lab_session_events_at ON lab_session_events (at DESC);
