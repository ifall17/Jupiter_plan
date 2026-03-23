import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

type SystemMappingRow = {
  prefix: string;
  prefix_length: number;
  label: string;
  account_class: number;
  statement: string;
  section: string;
  subsection: string | null;
  normal_balance: string;
  presentation_rule: string;
  line_type_hint: string | null;
  cash_flow_section: string | null;
};

function selectBestSystemMapping(code: string, rows: SystemMappingRow[]): SystemMappingRow | null {
  const candidates = rows
    .filter((row) => code.startsWith(row.prefix))
    .sort((left, right) => right.prefix_length - left.prefix_length);
  return candidates[0] ?? null;
}

async function main(): Promise<void> {
  console.log('Detailed SYSCOHADA mapping seeding: start');

  const codesResult = await prisma.$queryRaw<Array<{ account_code: string }>>`
    SELECT DISTINCT account_code
    FROM (
      SELECT account_code FROM transactions
      UNION
      SELECT account_code FROM budget_lines
    ) codes
    WHERE account_code ~ '^[0-9]{6,8}$'
    ORDER BY account_code ASC
  `;

  const codes = codesResult.map((row) => String(row.account_code));
  if (codes.length === 0) {
    console.log('No 6-8 digit account codes found in transactions/budget_lines.');
    return;
  }

  const systemMappings = await prisma.$queryRaw<SystemMappingRow[]>`
    SELECT
      prefix,
      prefix_length,
      label,
      account_class,
      statement,
      section,
      subsection,
      normal_balance,
      presentation_rule,
      line_type_hint,
      cash_flow_section
    FROM syscohada_account_mappings
    WHERE org_id IS NULL
      AND is_active = true
  `;

  let inserted = 0;
  let skippedNoBase = 0;
  let skippedAlreadyExact = 0;

  for (const code of codes) {
    const base = selectBestSystemMapping(code, systemMappings);
    if (!base) {
      skippedNoBase += 1;
      continue;
    }

    if (base.prefix === code && base.prefix_length === code.length) {
      skippedAlreadyExact += 1;
      continue;
    }

    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM syscohada_account_mappings
      WHERE org_id IS NULL
        AND prefix = ${code}
        AND statement = ${base.statement}::"FinancialStatement"
        AND section = ${base.section}::"FinancialSection"
      LIMIT 1
    `;

    if (existing.length > 0) {
      skippedAlreadyExact += 1;
      continue;
    }

    const id = `sys-exact-${code}-${base.statement}-${base.section}`;
    await prisma.$executeRaw`
      INSERT INTO syscohada_account_mappings (
        id,
        org_id,
        prefix,
        prefix_length,
        label,
        account_class,
        statement,
        section,
        subsection,
        normal_balance,
        presentation_rule,
        line_type_hint,
        cash_flow_section,
        is_system,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        ${id},
        NULL,
        ${code},
        ${code.length},
        ${base.label},
        ${base.account_class},
        ${base.statement}::"FinancialStatement",
        ${base.section}::"FinancialSection",
        ${base.subsection},
        ${base.normal_balance}::"NormalBalance",
        ${base.presentation_rule}::"MappingPresentationRule",
        CASE WHEN ${base.line_type_hint} IS NULL THEN NULL ELSE ${base.line_type_hint}::"LineType" END,
        CASE WHEN ${base.cash_flow_section} IS NULL THEN NULL ELSE ${base.cash_flow_section}::"FinancialSection" END,
        true,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (org_id, prefix, statement, section)
      DO NOTHING
    `;

    inserted += 1;
  }

  console.log('Detailed SYSCOHADA mapping seeding: done');
  console.log(`- distinct codes scanned: ${codes.length}`);
  console.log(`- inserted exact mappings: ${inserted}`);
  console.log(`- skipped (already exact): ${skippedAlreadyExact}`);
  console.log(`- skipped (no base mapping): ${skippedNoBase}`);
}

main()
  .catch((error) => {
    console.error('Detailed SYSCOHADA mapping seeding failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
