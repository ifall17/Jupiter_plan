import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const tableStats = {
      organizations: await prisma.organization.count(),
      users: await prisma.user.count(),
      fiscalYears: await prisma.fiscalYear.count(),
      periods: await prisma.period.count(),
      kpis: await prisma.kpi.count(),
      budgets: await prisma.budget.count(),
      budgetLines: await prisma.budgetLine.count(),
    };
    
    console.log('✓ Base de données initialisée avec succès !');
    console.log('Données créées:');
    console.log(JSON.stringify(tableStats, null, 2));
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
