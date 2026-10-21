-- A draft project may have no approved investment yet. Preserve every identity
-- and child reference while relaxing only the zero-budget constraints.
CREATE TABLE projects_v5 (
 id TEXT PRIMARY KEY, code TEXT NOT NULL COLLATE NOCASE UNIQUE,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 180),
 funding_source_id TEXT NOT NULL REFERENCES funding_sources(id),
 status_id TEXT NOT NULL REFERENCES project_statuses(id),
 budget_baht INTEGER NOT NULL CHECK(budget_baht >= 0 AND budget_baht <= 9000000000000000),
 spent_baht INTEGER NOT NULL CHECK(spent_baht >= 0 AND spent_baht <= budget_baht),
 progress REAL NOT NULL CHECK(progress >= 0 AND progress <= 100),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 loan_baht INTEGER NOT NULL DEFAULT 0 CHECK(loan_baht>=0),
 revenue_baht INTEGER NOT NULL DEFAULT 0 CHECK(revenue_baht>=0),
 oh_baht INTEGER NOT NULL DEFAULT 0 CHECK(oh_baht>=0),
 idc_baht INTEGER NOT NULL DEFAULT 0 CHECK(idc_baht>=0),
 loan_spent_baht INTEGER NOT NULL DEFAULT 0 CHECK(loan_spent_baht>=0),
 revenue_spent_baht INTEGER NOT NULL DEFAULT 0 CHECK(revenue_spent_baht>=0),
 unallocated_baht INTEGER NOT NULL DEFAULT 0 CHECK(unallocated_baht>=0),
 unallocated_spent_baht INTEGER NOT NULL DEFAULT 0 CHECK(unallocated_spent_baht>=0),
 details_json TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO projects_v5 SELECT * FROM projects;
DROP TABLE projects;
ALTER TABLE projects_v5 RENAME TO projects;
CREATE INDEX projects_funding_idx ON projects(funding_source_id);
CREATE INDEX projects_status_idx ON projects(status_id);
CREATE INDEX projects_updated_idx ON projects(deleted_at,updated_at DESC);
CREATE TRIGGER immutable_project_identity BEFORE UPDATE OF id,code ON projects
 WHEN NEW.id != OLD.id OR NEW.code != OLD.code
 BEGIN SELECT RAISE(ABORT,'Project identity is immutable'); END;
CREATE TRIGGER project_finances_insert BEFORE INSERT ON projects
 WHEN NEW.budget_baht != NEW.loan_baht+NEW.revenue_baht+NEW.unallocated_baht
 OR NEW.spent_baht != NEW.loan_spent_baht+NEW.revenue_spent_baht+NEW.unallocated_spent_baht
 OR NEW.oh_baht+NEW.idc_baht > NEW.revenue_baht
 OR NEW.loan_spent_baht > NEW.loan_baht OR NEW.revenue_spent_baht > NEW.revenue_baht
 OR NEW.unallocated_spent_baht > NEW.unallocated_baht
 BEGIN SELECT RAISE(ABORT,'Inconsistent project financing'); END;
CREATE TRIGGER project_finances_update BEFORE UPDATE ON projects
 WHEN NEW.budget_baht != NEW.loan_baht+NEW.revenue_baht+NEW.unallocated_baht
 OR NEW.spent_baht != NEW.loan_spent_baht+NEW.revenue_spent_baht+NEW.unallocated_spent_baht
 OR NEW.oh_baht+NEW.idc_baht > NEW.revenue_baht
 OR NEW.loan_spent_baht > NEW.loan_baht OR NEW.revenue_spent_baht > NEW.revenue_baht
 OR NEW.unallocated_spent_baht > NEW.unallocated_baht
 BEGIN SELECT RAISE(ABORT,'Inconsistent project financing'); END;
CREATE TABLE meeting_projects_v5 (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES budget_meetings(id),
 project_id TEXT NOT NULL REFERENCES projects(id), snapshot_json TEXT NOT NULL,
 before_baht INTEGER NOT NULL CHECK(before_baht>=0), after_baht INTEGER NOT NULL CHECK(after_baht>=0),
 plan_json TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN(0,1)), version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 workspace_json TEXT NOT NULL DEFAULT '{}', workspace_meta_json TEXT NOT NULL DEFAULT '{}',
 UNIQUE(meeting_id,project_id)
);
INSERT INTO meeting_projects_v5(id,meeting_id,project_id,snapshot_json,before_baht,after_baht,plan_json,reason,notes,reviewed,version,created_at,updated_at)
 SELECT id,meeting_id,project_id,snapshot_json,before_baht,after_baht,plan_json,reason,notes,reviewed,version,created_at,updated_at FROM meeting_projects;
DROP TABLE meeting_projects;
ALTER TABLE meeting_projects_v5 RENAME TO meeting_projects;
CREATE INDEX meeting_projects_round_idx ON meeting_projects(meeting_id);
CREATE TABLE meeting_workspace_state (
 meeting_id TEXT PRIMARY KEY REFERENCES budget_meetings(id),
 funds_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE meeting_legacy_imports (
 source_hash TEXT PRIMARY KEY, mapping_json TEXT NOT NULL, imported_at TEXT NOT NULL
);
