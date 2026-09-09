-- Stage 01 foundation schema (D-030, STAGE_01 "Data/schema changes").
-- Replaces the scaffold's 0001 tables, which held nothing real. JSON columns carry
-- the canonical contract document (packages/schema); indexed columns are copied
-- out for querying. Every learner-scoped table carries learner_id (D-008).
-- Down script: migrations/down/0002_foundation.down.sql (applied by `hivemind db migrate --down`).

DROP TABLE IF EXISTS skill_mastery;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS lab_sessions;
DROP TABLE IF EXISTS skill_relationships;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS users;

-- Identity -------------------------------------------------------------------

CREATE TABLE learners (
    id TEXT PRIMARY KEY,                -- HM-LRN-nnnnnn
    display_name TEXT NOT NULL,
    email TEXT UNIQUE,                  -- bound from the first validated Access identity
    access_subject TEXT,
    settings_json TEXT NOT NULL,        -- LearnerSettings
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO learners (id, display_name, email, access_subject, settings_json, created_at, updated_at)
VALUES (
    'HM-LRN-000001',
    'Jacob',
    NULL,
    NULL,
    '{"ai_execution":{"tutor":"external","review":"external","interview":"external","coach":"external"}}',
    '2026-09-09T00:00:00Z',
    '2026-09-09T00:00:00Z'
);

-- Content (immutable per content version, invariant 6) ------------------------

CREATE TABLE content_versions (
    id TEXT PRIMARY KEY,                -- HM-CV-nnnn
    created_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    git_commit TEXT,
    published_by TEXT NOT NULL,
    note TEXT,
    version_json TEXT NOT NULL          -- ContentVersion
);

CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    domain TEXT NOT NULL,
    status TEXT NOT NULL,
    latest_content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE course_versions (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    course_id TEXT NOT NULL,
    version TEXT NOT NULL,
    uses_labs INTEGER NOT NULL,
    manifest_json TEXT NOT NULL,        -- CourseManifest
    PRIMARY KEY (content_version_id, course_id)
);

CREATE TABLE modules (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    module_json TEXT NOT NULL,          -- Module
    PRIMARY KEY (content_version_id, id)
);

CREATE TABLE lessons (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    id TEXT NOT NULL,                   -- HM-LESSON-<course>-<nn>
    course_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    version TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    qa_state TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    lesson_json TEXT NOT NULL,          -- Lesson (sections, questions, claims, labs)
    PRIMARY KEY (content_version_id, id)
);

CREATE INDEX idx_lessons_course ON lessons (content_version_id, course_id, module_id, "order");

CREATE TABLE lesson_questions (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    lesson_id TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    question_json TEXT NOT NULL,        -- Question
    PRIMARY KEY (content_version_id, lesson_id, id)
);

CREATE TABLE skills (
    id TEXT PRIMARY KEY,                -- domain.area.skill
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    status TEXT NOT NULL,
    latest_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE skill_versions (
    skill_id TEXT NOT NULL REFERENCES skills(id),
    version TEXT NOT NULL,
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    definition_json TEXT NOT NULL,      -- SkillDefinition
    created_at TEXT NOT NULL,
    PRIMARY KEY (skill_id, version)
);

CREATE TABLE skill_relationships (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    skill_id TEXT NOT NULL,
    related_skill_id TEXT NOT NULL,
    kind TEXT NOT NULL,                 -- prerequisite | related | supersedes
    PRIMARY KEY (content_version_id, skill_id, related_skill_id, kind)
);

CREATE TABLE sources (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    trust_tier TEXT NOT NULL,
    ingested INTEGER NOT NULL,
    source_json TEXT NOT NULL,          -- SourceRecord
    PRIMARY KEY (content_version_id, id)
);

CREATE TABLE content_claims (
    content_version_id TEXT NOT NULL REFERENCES content_versions(id),
    lesson_id TEXT NOT NULL,
    id TEXT NOT NULL,
    verification TEXT NOT NULL,
    claim_json TEXT NOT NULL,           -- Claim
    PRIMARY KEY (content_version_id, lesson_id, id)
);

-- Careers (D-002) ----------------------------------------------------------------

CREATE TABLE role_profiles (
    id TEXT NOT NULL,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    family TEXT NOT NULL,
    level TEXT NOT NULL,
    status TEXT NOT NULL,
    profile_json TEXT NOT NULL,         -- RoleProfile
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, version)
);

CREATE TABLE competencies (
    id TEXT NOT NULL,
    version TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    competency_json TEXT NOT NULL,      -- Competency
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, version)
);

CREATE TABLE role_competencies (
    role_profile_id TEXT NOT NULL,
    role_profile_version TEXT NOT NULL,
    competency_id TEXT NOT NULL,
    weight REAL NOT NULL,
    required INTEGER NOT NULL,
    min_readiness REAL,
    PRIMARY KEY (role_profile_id, role_profile_version, competency_id),
    FOREIGN KEY (role_profile_id, role_profile_version) REFERENCES role_profiles(id, version)
);

CREATE TABLE career_targets (
    learner_id TEXT NOT NULL REFERENCES learners(id),
    role_profile_id TEXT NOT NULL,
    role_profile_version TEXT NOT NULL,
    active INTEGER NOT NULL,
    set_at TEXT NOT NULL,
    notes TEXT,
    PRIMARY KEY (learner_id, role_profile_id, role_profile_version)
);

-- Work orders and review (D-009) --------------------------------------------------

CREATE TABLE work_orders (
    id TEXT PRIMARY KEY,                -- HM-WO-nnnn
    template TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    execution TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT,
    requested_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    order_json TEXT NOT NULL            -- WorkOrder
);

CREATE INDEX idx_work_orders_status ON work_orders (status, updated_at DESC);

CREATE TABLE review_items (
    id TEXT PRIMARY KEY,                -- HM-RVW-nnnn
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    qa_state TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    resolved_at TEXT,
    reviewer TEXT,
    resolution TEXT,
    work_order_id TEXT REFERENCES work_orders(id),
    item_json TEXT NOT NULL             -- ReviewItem
);

-- Practice history (append-only, invariant 9) ------------------------------------

CREATE TABLE lab_sessions (
    id TEXT PRIMARY KEY,                -- HM-LAB-nnnnnn; live state stays in the Durable Object
    learner_id TEXT NOT NULL REFERENCES learners(id),
    problem_instance_id TEXT,
    provider_id TEXT,
    requires_json TEXT NOT NULL,        -- Capability[]
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT
);

CREATE INDEX idx_lab_sessions_learner ON lab_sessions (learner_id, created_at DESC);

CREATE TABLE problem_instances (
    id TEXT PRIMARY KEY,                -- HM-PI-nnnnnn
    problem_id TEXT NOT NULL,
    problem_version TEXT NOT NULL,
    seed INTEGER NOT NULL,
    spec_hash TEXT NOT NULL,
    validation TEXT NOT NULL,
    instance_json TEXT NOT NULL,        -- ProblemInstance
    created_at TEXT NOT NULL
);

CREATE TABLE attempts (
    id TEXT PRIMARY KEY,                -- HM-ATT-nnnnnn
    learner_id TEXT NOT NULL REFERENCES learners(id),
    mode TEXT NOT NULL,
    lesson_id TEXT,
    problem_instance_id TEXT REFERENCES problem_instances(id),
    lab_session_id TEXT REFERENCES lab_sessions(id),
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    attempt_json TEXT NOT NULL,         -- Attempt
    result_json TEXT                    -- AttemptResult, written once when graded
);

CREATE INDEX idx_attempts_learner ON attempts (learner_id, started_at DESC);

-- Historical attempts are immutable (invariant 9): the only permitted write after
-- insert is recording the result once. packages/core enforces the same rule.
CREATE TRIGGER attempts_no_delete BEFORE DELETE ON attempts
BEGIN
    SELECT RAISE(ABORT, 'attempts are immutable');
END;

CREATE TRIGGER attempts_no_rewrite BEFORE UPDATE ON attempts
WHEN OLD.result_json IS NOT NULL
  OR NEW.id <> OLD.id
  OR NEW.learner_id <> OLD.learner_id
  OR NEW.attempt_json <> OLD.attempt_json
BEGIN
    SELECT RAISE(ABORT, 'attempts are immutable');
END;

-- Versioned algorithms (D-014) ------------------------------------------------------

CREATE TABLE algorithm_versions (
    id TEXT NOT NULL,                   -- e.g. mastery.evidence_weighted
    version TEXT NOT NULL,
    kind TEXT NOT NULL,                 -- mastery | difficulty | retention | readiness
    description TEXT NOT NULL,
    active INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, version)
);
