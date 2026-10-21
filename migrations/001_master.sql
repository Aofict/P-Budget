CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE funding_sources (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE project_statuses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    is_terminal INTEGER NOT NULL DEFAULT 0 CHECK(is_terminal IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE project_sequences (
    year_be INTEGER PRIMARY KEY,
    last_number INTEGER NOT NULL CHECK(last_number >= 0)
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 180),
    funding_source_id TEXT NOT NULL REFERENCES funding_sources(id),
    status_id TEXT NOT NULL REFERENCES project_statuses(id),
    budget_baht INTEGER NOT NULL CHECK(budget_baht > 0 AND budget_baht <= 9000000000000000),
    spent_baht INTEGER NOT NULL CHECK(spent_baht >= 0 AND spent_baht <= budget_baht),
    progress REAL NOT NULL CHECK(progress >= 0 AND progress <= 100),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX projects_funding_idx ON projects(funding_source_id);
CREATE INDEX projects_status_idx ON projects(status_id);
CREATE INDEX projects_updated_idx ON projects(deleted_at, updated_at DESC);

CREATE TRIGGER immutable_project_identity
BEFORE UPDATE OF id, code ON projects
WHEN NEW.id != OLD.id OR NEW.code != OLD.code
BEGIN
    SELECT RAISE(ABORT, 'Project identity is immutable');
END;

CREATE TABLE project_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id),
    action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete', 'import')),
    snapshot_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
