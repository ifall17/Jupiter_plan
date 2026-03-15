import { useQuery } from '@tanstack/react-query';
import apiClient, { unwrapApiData } from '../api/client';
import { formatFCFA } from '../utils/currency';

type DashboardResponse = {
  period: {
    id: string;
    label: string;
    status: string;
  };
  kpis: Array<{
    kpi_id: string;
    kpi_code: string;
    kpi_label: string;
    unit: string;
    value: string;
    severity: string;
  }>;
  alerts_unread: number;
  alerts: Array<{
    id: string;
    severity: 'INFO' | 'WARN' | 'CRITICAL';
    message: string;
    created_at: string;
  }>;
  is_summary: {
    revenue: string;
    expenses: string;
    ebitda: string;
    net: string;
    ebitda_margin: string;
  };
  variance_pct: string;
  runway_weeks: number;
  ca_trend: Array<{
    period_label: string;
    value: string;
  }>;
};

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' }): JSX.Element {
  const borderColor = tone === 'good' ? 'var(--color-kola)' : tone === 'warn' ? 'var(--color-gold)' : 'var(--color-border)';
  return (
    <article
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${borderColor}`,
        borderRadius: '14px',
        padding: '1rem',
      }}
    >
      <div className="jp-muted-text" style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{value}</div>
    </article>
  );
}

export default function DashboardPage(): JSX.Element {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardResponse> => {
      const response = await apiClient.get<DashboardResponse>('/dashboard');
      return unwrapApiData(response);
    },
  });

  if (dashboardQuery.isLoading) {
    return <div>Chargement du dashboard...</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <section>
        <h1 style={{ marginTop: 0 }}>Tableau de bord</h1>
        <p className="jp-muted-text">Le dashboard est indisponible pour le moment.</p>
      </section>
    );
  }

  const data = dashboardQuery.data;

  return (
    <section style={{ display: 'grid', gap: '1rem' }}>
      <header>
        <h1 style={{ margin: 0 }}>Tableau de bord</h1>
        <p className="jp-muted-text" style={{ margin: '0.35rem 0 0' }}>
          DashboardPage · periode {data.period.label} · {data.alerts_unread} alertes non lues
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.9rem',
        }}
      >
        <MetricCard label="Chiffre d'affaires" value={formatFCFA(data.is_summary.revenue)} tone="good" />
        <MetricCard label="Depenses" value={formatFCFA(data.is_summary.expenses)} />
        <MetricCard label="EBITDA" value={formatFCFA(data.is_summary.ebitda)} tone="good" />
        <MetricCard label="Resultat net" value={formatFCFA(data.is_summary.net)} />
        <MetricCard label="Variance budget" value={`${data.variance_pct}%`} tone="warn" />
        <MetricCard label="Runway" value={`${data.runway_weeks} semaines`} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        <article
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
            padding: '1rem',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>KPIs suivis</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {data.kpis.slice(0, 6).map((kpi) => (
              <div key={kpi.kpi_id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                <div style={{ fontWeight: 600 }}>{kpi.kpi_label}</div>
                <div className="jp-muted-text" style={{ fontSize: '0.9rem' }}>
                  {kpi.kpi_code} · {kpi.value} {kpi.unit}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
            padding: '1rem',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Tendance CA</h2>
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {data.ca_trend.map((item) => (
              <div key={item.period_label}>
                <div className="jp-muted-text" style={{ fontSize: '0.85rem' }}>{item.period_label}</div>
                <div style={{ fontWeight: 600 }}>{formatFCFA(item.value)}</div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
