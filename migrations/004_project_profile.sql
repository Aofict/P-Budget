ALTER TABLE projects ADD COLUMN loan_baht INTEGER NOT NULL DEFAULT 0 CHECK(loan_baht >= 0);
ALTER TABLE projects ADD COLUMN revenue_baht INTEGER NOT NULL DEFAULT 0 CHECK(revenue_baht >= 0);
ALTER TABLE projects ADD COLUMN oh_baht INTEGER NOT NULL DEFAULT 0 CHECK(oh_baht >= 0);
ALTER TABLE projects ADD COLUMN idc_baht INTEGER NOT NULL DEFAULT 0 CHECK(idc_baht >= 0);
ALTER TABLE projects ADD COLUMN loan_spent_baht INTEGER NOT NULL DEFAULT 0 CHECK(loan_spent_baht >= 0);
ALTER TABLE projects ADD COLUMN revenue_spent_baht INTEGER NOT NULL DEFAULT 0 CHECK(revenue_spent_baht >= 0);
ALTER TABLE projects ADD COLUMN unallocated_baht INTEGER NOT NULL DEFAULT 0 CHECK(unallocated_baht >= 0);
ALTER TABLE projects ADD COLUMN unallocated_spent_baht INTEGER NOT NULL DEFAULT 0 CHECK(unallocated_spent_baht >= 0);
ALTER TABLE projects ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';
UPDATE projects SET
    loan_baht=CASE WHEN funding_source_id='domestic-loan' THEN budget_baht ELSE 0 END,
    revenue_baht=CASE WHEN funding_source_id IN ('pea-revenue','oh','idc') THEN budget_baht ELSE 0 END,
    oh_baht=CASE WHEN funding_source_id='oh' THEN budget_baht ELSE 0 END,
    idc_baht=CASE WHEN funding_source_id='idc' THEN budget_baht ELSE 0 END,
    loan_spent_baht=CASE WHEN funding_source_id='domestic-loan' THEN spent_baht ELSE 0 END,
    revenue_spent_baht=CASE WHEN funding_source_id IN ('pea-revenue','oh','idc') THEN spent_baht ELSE 0 END,
    unallocated_baht=CASE WHEN funding_source_id NOT IN ('domestic-loan','pea-revenue','oh','idc') THEN budget_baht ELSE 0 END,
    unallocated_spent_baht=CASE WHEN funding_source_id NOT IN ('domestic-loan','pea-revenue','oh','idc') THEN spent_baht ELSE 0 END;
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
