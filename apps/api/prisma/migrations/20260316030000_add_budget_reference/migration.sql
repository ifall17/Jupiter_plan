-- Add reference/reforecast fields to budgets
ALTER TABLE "budgets"
  ADD COLUMN IF NOT EXISTS "is_reference" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "parent_budget_id" TEXT;

-- Self-reference for reforecast genealogy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_parent_budget_id_fkey'
  ) THEN
    ALTER TABLE "budgets"
      ADD CONSTRAINT "budgets_parent_budget_id_fkey"
      FOREIGN KEY ("parent_budget_id") REFERENCES "budgets"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "budgets_org_id_fiscal_year_id_is_reference_idx"
  ON "budgets"("org_id", "fiscal_year_id", "is_reference");

CREATE INDEX IF NOT EXISTS "budgets_parent_budget_id_idx"
  ON "budgets"("parent_budget_id");
