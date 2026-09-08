-- Phase 1 seed of the RFP §78 data model. Durable Object SQLite owns live lab
-- session state; D1 holds the durable, queryable index across sessions.

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    guest_id TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id),
    name TEXT NOT NULL,
    definition_json TEXT NOT NULL
);

CREATE TABLE skill_relationships (
    skill_id TEXT NOT NULL REFERENCES skills(id),
    prerequisite_id TEXT NOT NULL REFERENCES skills(id),
    PRIMARY KEY (skill_id, prerequisite_id)
);

CREATE TABLE lab_sessions (
    id TEXT PRIMARY KEY,
    guest_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    problem_ref TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_lab_sessions_guest ON lab_sessions (guest_id, created_at DESC);

CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    guest_id TEXT NOT NULL,
    lab_session_id TEXT REFERENCES lab_sessions(id),
    skill_id TEXT,
    outcome TEXT NOT NULL,
    score_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE skill_mastery (
    guest_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    mastery REAL NOT NULL DEFAULT 0,
    last_tested_at TEXT,
    PRIMARY KEY (guest_id, skill_id)
);
