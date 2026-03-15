export const users = {
  admin: {
    email: 'admin@test.sn',
    password: 'TestPassword123!',
    role: 'SUPER_ADMIN',
  },
  fpa: {
    email: 'fpa@test.sn',
    password: 'TestPassword123!',
    role: 'FPA',
  },
  contributeur: {
    email: 'contrib@test.sn',
    password: 'TestPassword123!',
    role: 'CONTRIBUTEUR',
    department: 'VENTES',
  },
  lecteur: {
    email: 'lecteur@test.sn',
    password: 'TestPassword123!',
    role: 'LECTEUR',
  },
};

export const budgets = {
  fy2026v1: {
    name: 'Budget FY2026 V1',
    lineRevenue: {
      accountCode: '701000',
      label: 'Ventes de marchandises',
      department: 'VENTES',
      amount: '50000000',
    },
    linePurchases: {
      accountCode: '601000',
      label: 'Achats de marchandises',
      department: 'ACHATS',
      amount: '20000000',
    },
  },
};

export const scenarios = {
  optimistic2026: {
    name: 'Scenario Optimiste 2026',
    type: 'OPTIMISTE',
    revenueGrowth: '20',
    costReduction: '5',
  },
};
