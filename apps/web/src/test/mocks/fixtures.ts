export const authFixtures = {
  loginSuccess: {
    success: true,
    data: {
      access_token: 'access-token-test',
      refresh_token: 'refresh-token-test',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'FPA',
        org_id: 'org-1',
        first_name: 'Test',
        last_name: 'User',
      },
    },
    timestamp: new Date().toISOString(),
  },
  meSuccess: {
    success: true,
    data: {
      id: 'user-1',
      email: 'user@example.com',
      role: 'FPA',
      org_id: 'org-1',
      first_name: 'Test',
      last_name: 'User',
      last_login_at: null,
    },
    timestamp: new Date().toISOString(),
  },
};

export const orgFixtures = {
  current: {
    success: true,
    data: {
      id: 'org-1',
      name: 'Jupiter Demo Org',
      currency: 'XOF',
      current_period_id: 'period-2',
      fiscal_year_id: 'fy-2025',
    },
    timestamp: new Date().toISOString(),
  },
};

export const periodFixtures = {
  open: {
    success: true,
    data: [
      {
        id: 'period-1',
        start_date: '2025-01-01',
        label: 'Jan 2025',
      },
      {
        id: 'period-2',
        start_date: '2025-02-01',
        label: 'Feb 2025',
      },
    ],
    timestamp: new Date().toISOString(),
  },
};

export const alertFixtures = {
  unread: {
    success: true,
    data: [
      {
        id: 'alert-1',
        severity: 'WARN',
        message: 'Budget threshold reached',
        created_at: '2025-01-12T10:00:00.000Z',
      },
      {
        id: 'alert-2',
        severity: 'CRITICAL',
        message: 'Cash flow risk detected',
        created_at: '2025-01-14T10:00:00.000Z',
      },
    ],
    timestamp: new Date().toISOString(),
  },
};

export const dashboardFixtures = {
  current: {
    success: true,
    data: {
      period: {
        id: 'period-2',
        label: 'Fevrier 2025',
        status: 'OPEN',
      },
      kpis: [
        {
          kpi_id: 'kpi-1',
          kpi_code: 'REV',
          kpi_label: 'Chiffre d\'affaires',
          unit: 'FCFA',
          value: '120000000',
          severity: 'INFO',
        },
      ],
      alerts_unread: 2,
      alerts: [
        {
          id: 'alert-2',
          severity: 'CRITICAL',
          message: 'Cash flow risk detected',
          created_at: '2025-01-14T10:00:00.000Z',
        },
      ],
      is_summary: {
        revenue: '120000000',
        expenses: '78000000',
        ebitda: '42000000',
        net: '25000000',
        ebitda_margin: '35.00',
      },
      variance_pct: '4.30',
      runway_weeks: 18,
      ca_trend: [
        { period_label: 'Dec 2024', value: '98000000' },
        { period_label: 'Jan 2025', value: '110000000' },
        { period_label: 'Fev 2025', value: '120000000' },
      ],
    },
    timestamp: new Date().toISOString(),
  },
};
