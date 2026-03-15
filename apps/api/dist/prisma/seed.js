"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const node_path_1 = require("node:path");
const client_1 = require("@prisma/client");
const argon2 = require("argon2");
(0, dotenv_1.config)({ path: (0, node_path_1.resolve)(__dirname, '..', '.env') });
const prisma = new client_1.PrismaClient();
const IDS = {
    org: '8dc9835f-bef7-486f-a59e-5ed4afde1da3',
    users: {
        admin: '88194dc0-8a53-49b9-b2f8-b6bd4d44ca88',
        fpa: '51e26423-fca9-47ac-834f-fe4ace9c19e2',
        contrib: '7e9fae44-38fc-464f-9409-39c4bf59cd7c',
        lecteur: 'f4a5ddc5-0f4e-4a68-9f93-6e35fa7f9e10',
    },
    fiscalYear: 'd5eb9707-1551-4282-afd2-a1ceef8ff5df',
    budget: '3b3f0561-80b0-4c97-8850-b6fa6d6dc753',
};
const PERIOD_IDS = [
    '500fa5e2-1cb1-42d3-867a-b716cb6f44fd',
    '9f6b9ed3-87a6-47eb-a2f3-c9a61d3488b8',
    '91959af6-64f0-437d-a7f3-3f94e8ede98e',
    '2e6115d6-a88a-4196-bf7c-ac20a0fd31cc',
    '0f487c4c-9027-4e64-ab85-a64958f81353',
    'f70edec6-a894-44db-a257-1ed4ad7f8b4c',
    '5e26af2a-495f-49ea-ac56-df0f31e4f56b',
    '146eb3a0-7019-4bb9-b1ea-b887f8719f36',
    '2b9904be-93a8-40f8-bd59-166072ee2db7',
    'f6e8f66e-b93b-4df0-93c3-30a75ba5db42',
    'bc6f7bf9-f17e-4978-8f24-a55a2dd0f2f3',
    'a5bf9164-f974-463a-b74f-39cc4b97f00f',
];
function utcDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}
async function hashPassword(value) {
    return argon2.hash(value, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
    });
}
async function main() {
    console.log('Seeding Jupiter_Plan: start');
    console.log('Step 1/7: organization');
    const organization = await prisma.organization.upsert({
        where: { id: IDS.org },
        update: {
            name: 'Diallo & Frères SARL',
            country: 'SN',
            currency: 'XOF',
            plan: client_1.PlanTier.GROWTH,
            is_active: true,
        },
        create: {
            id: IDS.org,
            name: 'Diallo & Frères SARL',
            country: 'SN',
            currency: 'XOF',
            plan: client_1.PlanTier.GROWTH,
            is_active: true,
        },
    });
    console.log('Step 2/7: users');
    const [adminPassword, fpaPassword, contribPassword, lecteurPassword] = await Promise.all([
        hashPassword('Admin@Diallo2026!'),
        hashPassword('Fpa@Diallo2026!'),
        hashPassword('Contrib@Diallo2026!'),
        hashPassword('Lecteur@Diallo2026!'),
    ]);
    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@diallo.sn' },
        update: {
            org_id: organization.id,
            first_name: 'Mamadou',
            last_name: 'Diallo',
            role: client_1.UserRole.SUPER_ADMIN,
            is_active: true,
            password_hash: adminPassword,
        },
        create: {
            id: IDS.users.admin,
            org_id: organization.id,
            email: 'admin@diallo.sn',
            password_hash: adminPassword,
            first_name: 'Mamadou',
            last_name: 'Diallo',
            role: client_1.UserRole.SUPER_ADMIN,
            is_active: true,
        },
    });
    const fpaUser = await prisma.user.upsert({
        where: { email: 'fpa@diallo.sn' },
        update: {
            org_id: organization.id,
            first_name: 'Aminata',
            last_name: 'Sow',
            role: client_1.UserRole.FPA,
            is_active: true,
            password_hash: fpaPassword,
        },
        create: {
            id: IDS.users.fpa,
            org_id: organization.id,
            email: 'fpa@diallo.sn',
            password_hash: fpaPassword,
            first_name: 'Aminata',
            last_name: 'Sow',
            role: client_1.UserRole.FPA,
            is_active: true,
        },
    });
    const contribUser = await prisma.user.upsert({
        where: { email: 'contrib@diallo.sn' },
        update: {
            org_id: organization.id,
            first_name: 'Ibrahima',
            last_name: 'Fall',
            role: client_1.UserRole.CONTRIBUTEUR,
            is_active: true,
            password_hash: contribPassword,
        },
        create: {
            id: IDS.users.contrib,
            org_id: organization.id,
            email: 'contrib@diallo.sn',
            password_hash: contribPassword,
            first_name: 'Ibrahima',
            last_name: 'Fall',
            role: client_1.UserRole.CONTRIBUTEUR,
            is_active: true,
        },
    });
    await prisma.user.upsert({
        where: { email: 'lecteur@diallo.sn' },
        update: {
            org_id: organization.id,
            first_name: 'Fatou',
            last_name: 'Ndiaye',
            role: client_1.UserRole.LECTEUR,
            is_active: true,
            password_hash: lecteurPassword,
        },
        create: {
            id: IDS.users.lecteur,
            org_id: organization.id,
            email: 'lecteur@diallo.sn',
            password_hash: lecteurPassword,
            first_name: 'Fatou',
            last_name: 'Ndiaye',
            role: client_1.UserRole.LECTEUR,
            is_active: true,
        },
    });
    await prisma.userDepartmentScope.upsert({
        where: {
            user_id_department: {
                user_id: contribUser.id,
                department: 'VENTES',
            },
        },
        update: {
            can_read: true,
            can_write: true,
        },
        create: {
            user_id: contribUser.id,
            department: 'VENTES',
            can_read: true,
            can_write: true,
        },
    });
    console.log('Step 3/7: fiscal year and periods');
    const fiscalYear = await prisma.fiscalYear.upsert({
        where: {
            org_id_label: {
                org_id: organization.id,
                label: 'FY2026',
            },
        },
        update: {
            start_date: utcDate(2026, 1, 1),
            end_date: utcDate(2026, 12, 31),
            status: client_1.FiscalStatus.ACTIVE,
        },
        create: {
            id: IDS.fiscalYear,
            org_id: organization.id,
            label: 'FY2026',
            start_date: utcDate(2026, 1, 1),
            end_date: utcDate(2026, 12, 31),
            status: client_1.FiscalStatus.ACTIVE,
        },
    });
    const monthLabels = [
        'Janvier',
        'Fevrier',
        'Mars',
        'Avril',
        'Mai',
        'Juin',
        'Juillet',
        'Aout',
        'Septembre',
        'Octobre',
        'Novembre',
        'Decembre',
    ];
    for (let i = 0; i < 12; i += 1) {
        const month = i + 1;
        const startDate = utcDate(2026, month, 1);
        const endDate = month === 12 ? utcDate(2026, 12, 31) : utcDate(2026, month + 1, 0);
        let status = client_1.PeriodStatus.OPEN;
        let closedAt = null;
        let closedBy = null;
        if (month <= 2) {
            status = client_1.PeriodStatus.CLOSED;
            closedAt = utcDate(2026, month, 28);
            closedBy = fpaUser.id;
        }
        await prisma.period.upsert({
            where: {
                fiscal_year_id_period_number: {
                    fiscal_year_id: fiscalYear.id,
                    period_number: month,
                },
            },
            update: {
                org_id: organization.id,
                label: `P${String(month).padStart(2, '0')} ${monthLabels[i]}`,
                start_date: startDate,
                end_date: endDate,
                status,
                closed_at: closedAt,
                closed_by: closedBy,
            },
            create: {
                id: PERIOD_IDS[i],
                fiscal_year_id: fiscalYear.id,
                org_id: organization.id,
                label: `P${String(month).padStart(2, '0')} ${monthLabels[i]}`,
                period_number: month,
                start_date: startDate,
                end_date: endDate,
                status,
                closed_at: closedAt,
                closed_by: closedBy,
            },
        });
    }
    console.log('Step 4/7: KPIs');
    const kpis = [
        {
            code: 'CA',
            label: "Chiffre d'Affaires",
            formula: 'SUM(REVENUE)',
            unit: 'FCFA',
            threshold_warn: new client_1.Prisma.Decimal('15000000.00'),
            threshold_critical: new client_1.Prisma.Decimal('10000000.00'),
        },
        {
            code: 'EBITDA',
            label: 'EBITDA',
            formula: 'CA - OPEX',
            unit: 'FCFA',
            threshold_warn: new client_1.Prisma.Decimal('3000000.00'),
            threshold_critical: new client_1.Prisma.Decimal('1000000.00'),
        },
        {
            code: 'MARGE',
            label: 'Marge Brute',
            formula: '((CA - COGS) / CA) * 100',
            unit: '%',
            threshold_warn: new client_1.Prisma.Decimal('25.00'),
            threshold_critical: new client_1.Prisma.Decimal('15.00'),
        },
        {
            code: 'RUNWAY',
            label: 'Runway Tresorerie',
            formula: 'Cash / BurnRate',
            unit: 'semaines',
            threshold_warn: new client_1.Prisma.Decimal('12.00'),
            threshold_critical: new client_1.Prisma.Decimal('8.00'),
        },
        {
            code: 'DSO',
            label: 'Delai Encaissement',
            formula: '(AR / Sales) * 30',
            unit: 'jours',
            threshold_warn: new client_1.Prisma.Decimal('45.00'),
            threshold_critical: new client_1.Prisma.Decimal('60.00'),
        },
    ];
    for (const kpi of kpis) {
        await prisma.kpi.upsert({
            where: {
                org_id_code: {
                    org_id: organization.id,
                    code: kpi.code,
                },
            },
            update: {
                label: kpi.label,
                formula: kpi.formula,
                unit: kpi.unit,
                threshold_warn: kpi.threshold_warn,
                threshold_critical: kpi.threshold_critical,
                is_active: true,
            },
            create: {
                org_id: organization.id,
                code: kpi.code,
                label: kpi.label,
                formula: kpi.formula,
                unit: kpi.unit,
                threshold_warn: kpi.threshold_warn,
                threshold_critical: kpi.threshold_critical,
                is_active: true,
            },
        });
    }
    console.log('Step 5/7: approved budget');
    const budget = await prisma.budget.upsert({
        where: { id: IDS.budget },
        update: {
            org_id: organization.id,
            fiscal_year_id: fiscalYear.id,
            name: 'Budget FY2026 V1',
            version: 1,
            status: client_1.BudgetStatus.APPROVED,
            submitted_at: utcDate(2026, 1, 10),
            submitted_by: contribUser.id,
            approved_at: utcDate(2026, 1, 15),
            approved_by: fpaUser.id,
            rejection_comment: null,
        },
        create: {
            id: IDS.budget,
            org_id: organization.id,
            fiscal_year_id: fiscalYear.id,
            name: 'Budget FY2026 V1',
            version: 1,
            status: client_1.BudgetStatus.APPROVED,
            submitted_at: utcDate(2026, 1, 10),
            submitted_by: contribUser.id,
            approved_at: utcDate(2026, 1, 15),
            approved_by: fpaUser.id,
        },
    });
    console.log('Step 6/7: budget lines');
    const budgetLines = [
        {
            id: 'd7643ef9-65fc-40f8-b8dc-bdd66a35f7ce',
            period_id: PERIOD_IDS[0],
            account_code: '701100',
            account_label: 'Ventes locales',
            department: 'VENTES',
            line_type: client_1.LineType.REVENUE,
            amount_budget: '450000000.00',
            amount_actual: '428000000.00',
        },
        {
            id: '6ff79394-2f40-4f08-a897-f5f87f4d8e00',
            period_id: PERIOD_IDS[1],
            account_code: '701200',
            account_label: 'Ventes export UEMOA',
            department: 'VENTES',
            line_type: client_1.LineType.REVENUE,
            amount_budget: '180000000.00',
            amount_actual: '172500000.00',
        },
        {
            id: 'd27893f0-69f4-49dc-8df0-cde0058e8f90',
            period_id: PERIOD_IDS[2],
            account_code: '706000',
            account_label: 'Prestations de services',
            department: 'OPERATIONS',
            line_type: client_1.LineType.REVENUE,
            amount_budget: '95000000.00',
            amount_actual: '0.00',
        },
        {
            id: '4f59310f-3676-49f2-8cb6-a2fc1c8ec58d',
            period_id: PERIOD_IDS[0],
            account_code: '601000',
            account_label: 'Achats de marchandises',
            department: 'ACHATS',
            line_type: client_1.LineType.EXPENSE,
            amount_budget: '210000000.00',
            amount_actual: '205000000.00',
        },
        {
            id: 'af35c80a-b6d8-4f6a-a5f5-c3ecf4a2bcc4',
            period_id: PERIOD_IDS[1],
            account_code: '625100',
            account_label: 'Transport et logistique',
            department: 'OPERATIONS',
            line_type: client_1.LineType.EXPENSE,
            amount_budget: '38000000.00',
            amount_actual: '40100000.00',
        },
        {
            id: '8f40f8f1-8f11-4d44-8df4-6c7f8a9b84cf',
            period_id: PERIOD_IDS[2],
            account_code: '641000',
            account_label: 'Salaires et traitements',
            department: 'RH',
            line_type: client_1.LineType.EXPENSE,
            amount_budget: '120000000.00',
            amount_actual: '0.00',
        },
        {
            id: 'f75fa761-b73a-40f8-8b62-65552d06f072',
            period_id: PERIOD_IDS[3],
            account_code: '623400',
            account_label: 'Marketing terrain',
            department: 'MARKETING',
            line_type: client_1.LineType.EXPENSE,
            amount_budget: '22000000.00',
            amount_actual: '0.00',
        },
        {
            id: 'e29be83f-b271-47a4-a861-f3fd06039fd5',
            period_id: PERIOD_IDS[4],
            account_code: '215000',
            account_label: 'Equipements industriels',
            department: 'PRODUCTION',
            line_type: client_1.LineType.CAPEX,
            amount_budget: '55000000.00',
            amount_actual: '0.00',
        },
        {
            id: '39f5f71f-d910-489f-9c88-3b14a35de575',
            period_id: PERIOD_IDS[5],
            account_code: '218300',
            account_label: 'Materiel informatique',
            department: 'IT',
            line_type: client_1.LineType.CAPEX,
            amount_budget: '15000000.00',
            amount_actual: '0.00',
        },
        {
            id: 'dc5e2941-6244-4f19-ac4b-e5cae3dc56a7',
            period_id: PERIOD_IDS[6],
            account_code: '627000',
            account_label: 'Frais bancaires',
            department: 'FINANCE',
            line_type: client_1.LineType.EXPENSE,
            amount_budget: '10000000.00',
            amount_actual: '0.00',
        },
    ];
    for (const line of budgetLines) {
        await prisma.budgetLine.upsert({
            where: { id: line.id },
            update: {
                budget_id: budget.id,
                org_id: organization.id,
                period_id: line.period_id,
                account_code: line.account_code,
                account_label: line.account_label,
                department: line.department,
                line_type: line.line_type,
                amount_budget: new client_1.Prisma.Decimal(line.amount_budget),
                amount_actual: new client_1.Prisma.Decimal(line.amount_actual),
                created_by: contribUser.id,
            },
            create: {
                id: line.id,
                budget_id: budget.id,
                org_id: organization.id,
                period_id: line.period_id,
                account_code: line.account_code,
                account_label: line.account_label,
                department: line.department,
                line_type: line.line_type,
                amount_budget: new client_1.Prisma.Decimal(line.amount_budget),
                amount_actual: new client_1.Prisma.Decimal(line.amount_actual),
                created_by: contribUser.id,
            },
        });
    }
    console.log('Step 7/7: done');
    console.log('Seed completed successfully.');
}
main()
    .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map