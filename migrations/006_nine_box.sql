CREATE TABLE nine_box_state (
    id INTEGER PRIMARY KEY CHECK(id=1),
    data_json TEXT NOT NULL,
    current_year TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE nine_box_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_json TEXT NOT NULL,
    current_year TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
