-- Down script for 0002_foundation.sql: drops the Stage 01 schema and restores the
-- scaffold's 0001 tables (empty). Applied by `hivemind db migrate --down 0002`.

DROP TRIGGER IF EXISTS attempts_no_rewrite;
DROP TRIGGER IF EXISTS attempts_no_delete;
DROP TABLE IF EXISTS algorithm_versions;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS problem_instances;
DROP TABLE IF EXISTS lab_sessions;
DROP TABLE IF EXISTS review_items;
DROP TABLE IF EXISTS work_orders;
DROP TABLE IF EXISTS career_targets;
DROP TABLE IF EXISTS role_competencies;
DROP TABLE IF EXISTS competencies;
DROP TABLE IF EXISTS role_profiles;
DROP TABLE IF EXISTS content_claims;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS skill_relationships;
DROP TABLE IF EXISTS skill_versions;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS lesson_questions;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS course_versions;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS content_versions;
DROP TABLE IF EXISTS learners;

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
