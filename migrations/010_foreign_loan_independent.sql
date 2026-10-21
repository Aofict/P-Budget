-- Foreign loans are an independent funding source, not a loan component.
UPDATE funding_sources
SET parent_id=NULL,
    version=version+1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id='foreign-loan' AND parent_id IS NOT NULL;
