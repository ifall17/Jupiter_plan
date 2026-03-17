-- Enforce at most one reference budget per org and fiscal year.
-- Keep the most recently updated reference when duplicates exist.
WITH ranked_references AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, fiscal_year_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM budgets
  WHERE is_reference = true
)
UPDATE budgets b
SET is_reference = false
FROM ranked_references r
WHERE b.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_one_reference_per_org_fy
  ON budgets (org_id, fiscal_year_id)
  WHERE is_reference = true;
