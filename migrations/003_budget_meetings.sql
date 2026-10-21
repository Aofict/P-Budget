CREATE TABLE budget_meetings (
    id TEXT PRIMARY KEY,
    year_be INTEGER NOT NULL CHECK(year_be BETWEEN 2400 AND 3000),
    round_no INTEGER NOT NULL CHECK(round_no BETWEEN 1 AND 999),
    title TEXT NOT NULL,
    meeting_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','closed')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(year_be, round_no)
);
CREATE TABLE meeting_projects (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES budget_meetings(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    snapshot_json TEXT NOT NULL,
    before_baht INTEGER NOT NULL CHECK(before_baht > 0),
    after_baht INTEGER NOT NULL CHECK(after_baht >= 0),
    plan_json TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0,1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(meeting_id, project_id)
);
CREATE TABLE meeting_project_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL REFERENCES meeting_projects(id),
    snapshot_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
CREATE INDEX meeting_projects_round_idx ON meeting_projects(meeting_id);
CREATE INDEX meeting_events_entry_idx ON meeting_project_events(entry_id,id);
