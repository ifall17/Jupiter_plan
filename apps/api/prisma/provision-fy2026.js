const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ORG_ID = '433c8877-3eb7-41cb-b06d-a56baed8f173';

const MONTHS = [
  { num: 1,  label: 'Janvier 2026',   start: '2026-01-01', end: '2026-01-31' },
  { num: 2,  label: 'Février 2026',   start: '2026-02-01', end: '2026-02-28' },
  { num: 3,  label: 'Mars 2026',      start: '2026-03-01', end: '2026-03-31' },
  { num: 4,  label: 'Avril 2026',     start: '2026-04-01', end: '2026-04-30' },
  { num: 5,  label: 'Mai 2026',       start: '2026-05-01', end: '2026-05-31' },
  { num: 6,  label: 'Juin 2026',      start: '2026-06-01', end: '2026-06-30' },
  { num: 7,  label: 'Juillet 2026',   start: '2026-07-01', end: '2026-07-31' },
  { num: 8,  label: 'Août 2026',      start: '2026-08-01', end: '2026-08-31' },
  { num: 9,  label: 'Septembre 2026', start: '2026-09-01', end: '2026-09-30' },
  { num: 10, label: 'Octobre 2026',   start: '2026-10-01', end: '2026-10-31' },
  { num: 11, label: 'Novembre 2026',  start: '2026-11-01', end: '2026-11-30' },
  { num: 12, label: 'Décembre 2026',  start: '2026-12-01', end: '2026-12-31' },
];

async function main() {
  // Créer l'exercice fiscal
  const fy = await prisma.fiscalYear.upsert({
    where: { org_id_label: { org_id: ORG_ID, label: 'FY2026' } },
    update: {},
    create: {
      org_id:     ORG_ID,
      label:      'FY2026',
      start_date: new Date('2026-01-01'),
      end_date:   new Date('2026-12-31'),
      status:     'ACTIVE',
    },
  });
  console.log(`✅ FiscalYear créé : ${fy.id} (${fy.label})`);

  // Créer les 12 périodes
  for (const m of MONTHS) {
    const p = await prisma.period.upsert({
      where: { fiscal_year_id_period_number: { fiscal_year_id: fy.id, period_number: m.num } },
      update: {},
      create: {
        fiscal_year_id: fy.id,
        org_id:         ORG_ID,
        label:          m.label,
        period_number:  m.num,
        start_date:     new Date(m.start),
        end_date:       new Date(m.end),
        status:         'OPEN',
      },
    });
    console.log(`  ✅ Période ${m.num.toString().padStart(2, '0')} : ${p.label} [${p.status}]`);
  }

  console.log('\n🎉 Exercice FY2026 + 12 périodes créés avec succès.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
