-- CreateEnum
CREATE TYPE "CashFlowDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('ENCAISSEMENT_CLIENT', 'DECAISSEMENT_FOURNISSEUR', 'SALAIRES', 'IMPOTS_TAXES', 'INVESTISSEMENT', 'FINANCEMENT', 'AUTRE_ENTREE', 'AUTRE_SORTIE', 'LEGACY');

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "account_name" TEXT,
ADD COLUMN     "account_number" TEXT,
ADD COLUMN     "bank_name" TEXT;

-- AlterTable
ALTER TABLE "cash_flow_plans" ADD COLUMN     "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bank_account_id" TEXT,
ADD COLUMN     "direction" "CashFlowDirection" NOT NULL DEFAULT 'OUT',
ADD COLUMN     "flow_type" "CashFlowType" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "planned_date" TIMESTAMP(3);

-- Backfill strict columns from legacy values
UPDATE "bank_accounts"
SET
	"bank_name" = COALESCE("bank_name", "name"),
	"account_name" = COALESCE("account_name", "name")
WHERE "bank_name" IS NULL OR "account_name" IS NULL;

UPDATE "cash_flow_plans" c
SET
	"planned_date" = p."start_date" + ((GREATEST(c."week_number", 1) - 1) * INTERVAL '7 days'),
	"direction" = CASE WHEN COALESCE(c."inflow", 0) >= COALESCE(c."outflow", 0)
		THEN 'IN'::"CashFlowDirection"
		ELSE 'OUT'::"CashFlowDirection"
	END,
	"amount" = CASE WHEN COALESCE(c."inflow", 0) >= COALESCE(c."outflow", 0)
		THEN COALESCE(c."inflow", 0)
		ELSE COALESCE(c."outflow", 0)
	END,
	"flow_type" = 'LEGACY'::"CashFlowType"
FROM "periods" p
WHERE c."period_id" = p."id";

-- CreateIndex
CREATE INDEX "cash_flow_plans_org_id_planned_date_idx" ON "cash_flow_plans"("org_id", "planned_date");

-- AddForeignKey
ALTER TABLE "cash_flow_plans" ADD CONSTRAINT "cash_flow_plans_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
