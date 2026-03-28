const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const orgs = await prisma.organization.findMany({
      where: { name: { contains: 'Diallo', mode: 'insensitive' } },
      select: { id: true, name: true },
    });

    if (orgs.length === 0) {
      console.log('Aucune organisation Diallo trouvee.');
      return;
    }

    for (const org of orgs) {
      const orgId = org.id;
      console.log(`Purge organisation: ${org.name} (${orgId})`);

      const before = {
        users: await prisma.user.count({ where: { org_id: orgId } }),
        periods: await prisma.period.count({ where: { org_id: orgId } }),
        transactions: await prisma.transaction.count({ where: { org_id: orgId } }),
        budgets: await prisma.budget.count({ where: { org_id: orgId } }),
        budgetLines: await prisma.budgetLine.count({ where: { org_id: orgId } }),
        snapshots: await prisma.financialSnapshot.count({ where: { org_id: orgId } }),
        kpis: await prisma.kpi.count({ where: { org_id: orgId } }),
        kpiValues: await prisma.kpiValue.count({ where: { org_id: orgId } }),
        alerts: await prisma.alert.count({ where: { org_id: orgId } }),
        cashFlowPlans: await prisma.cashFlowPlan.count({ where: { org_id: orgId } }),
        bankAccounts: await prisma.bankAccount.count({ where: { org_id: orgId } }),
        scenarios: await prisma.scenario.count({ where: { org_id: orgId } }),
      };
      console.log('Avant purge:', before);

      await prisma.$transaction(async (tx) => {
        await tx.comment.deleteMany({ where: { org_id: orgId } });
        await tx.alert.deleteMany({ where: { org_id: orgId } });
        await tx.kpiValue.deleteMany({ where: { org_id: orgId } });
        await tx.financialSnapshot.deleteMany({ where: { org_id: orgId } });
        await tx.scenario.deleteMany({ where: { org_id: orgId } });
        await tx.cashFlowPlan.deleteMany({ where: { org_id: orgId } });
        await tx.bankAccount.deleteMany({ where: { org_id: orgId } });
        await tx.transaction.deleteMany({ where: { org_id: orgId } });
        await tx.budgetLine.deleteMany({ where: { org_id: orgId } });
        await tx.budget.deleteMany({ where: { org_id: orgId } });
        await tx.importJob.deleteMany({ where: { org_id: orgId } });
        await tx.auditAccess.deleteMany({ where: { org_id: orgId } });
        await tx.auditLog.deleteMany({ where: { org_id: orgId } });
        await tx.kpi.deleteMany({ where: { org_id: orgId } });
        await tx.syscohadaAccountMapping.deleteMany({ where: { org_id: orgId } });
        await tx.period.deleteMany({ where: { org_id: orgId } });
        await tx.fiscalYear.deleteMany({ where: { org_id: orgId } });
        await tx.userDepartmentScope.deleteMany({ where: { user: { org_id: orgId } } });
        await tx.user.deleteMany({ where: { org_id: orgId } });
        await tx.organization.delete({ where: { id: orgId } });
      });

      const after = {
        users: await prisma.user.count({ where: { org_id: orgId } }),
        periods: await prisma.period.count({ where: { org_id: orgId } }),
        transactions: await prisma.transaction.count({ where: { org_id: orgId } }),
        budgets: await prisma.budget.count({ where: { org_id: orgId } }),
        organization: await prisma.organization.count({ where: { id: orgId } }),
      };
      console.log('Apres purge:', after);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
