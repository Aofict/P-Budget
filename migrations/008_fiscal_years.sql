CREATE TABLE fiscal_years (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO fiscal_years (id, code, name, created_at, updated_at)
SELECT CAST(year_be AS TEXT), CAST(year_be AS TEXT), 'ปีงบประมาณ ' || year_be,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
    SELECT 2569 AS year_be UNION ALL SELECT 2570 UNION ALL SELECT 2571
    UNION ALL SELECT 2572 UNION ALL SELECT 2573 UNION ALL SELECT 2574
    UNION ALL SELECT 2575
);
