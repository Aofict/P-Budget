ALTER TABLE funding_sources ADD COLUMN parent_id TEXT REFERENCES funding_sources(id);
UPDATE funding_sources SET name='เงินกู้', version=version+1 WHERE id='domestic-loan';
UPDATE funding_sources SET name='เงินรายได้', version=version+1 WHERE id='pea-revenue';
UPDATE funding_sources SET parent_id='pea-revenue', version=version+1 WHERE id IN ('oh','idc');
UPDATE funding_sources SET parent_id='domestic-loan', version=version+1 WHERE id='foreign-loan';
-- Legacy sources are retained for existing references; never guess their funding source.
UPDATE funding_sources SET active=0, version=version+1
WHERE id NOT IN ('domestic-loan','foreign-loan','pea-revenue','oh','idc');
