INSERT OR IGNORE INTO funding_sources
    (id, code, name, active, parent_id, created_at, updated_at)
VALUES
    ('foreign-loan', 'FOREIGN_LOAN', 'เงินกู้ต่างประเทศ', 1, 'domestic-loan',
     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
