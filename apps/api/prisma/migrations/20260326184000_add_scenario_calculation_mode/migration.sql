-- CreateEnum
CREATE TYPE "ScenarioCalculationMode" AS ENUM ('GLOBAL', 'COMPTES_CIBLES');

-- AlterTable
ALTER TABLE "scenarios"
ADD COLUMN "calculation_mode" "ScenarioCalculationMode" NOT NULL DEFAULT 'GLOBAL';
