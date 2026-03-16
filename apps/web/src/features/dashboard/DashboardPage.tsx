import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { formatFCFA } from '../../utils/currency';
import KpiCard from './components/KpiCard';
import AlertBanner from './components/AlertBanner';
import IsChart from './components/IsChart';
import CashRunway from './components/CashRunway';
import VarianceTable from './components/VarianceTable';
import AlertsList from './components/AlertsList';
import DashboardSkeleton from './components/DashboardSkeleton';
import DashboardError from './components/DashboardError';
import PeriodSelector from './components/PeriodSelector';

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'WARN' | 'INFO';
  message: string;
}

interface VarianceItem {
  line_label: string;
  budgeted: number;
  actual: number;
  variance_pct: number;
}

interface DashboardData {
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
  alerts: Alert[];
  is_summary: {
    revenue: number | string;
    revenue_trend?: 'up' | 'down' | 'stable';
    ebitda: number | string;
    ebitda_trend?: 'up' | 'down' | 'stable';
    ebitda_margin: number | string;
    net: number | string;
    net_trend?: 'up' | 'down' | 'stable';
  };
  variance_pct: VarianceItem[];
  runway_weeks: number;
  ca_trend: Array<{
    period_label: string;
    value: number | string;
  }>;
}

export default function DashboardPage() {
  // Appel API réel — jamais de données hardcodées
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      apiClient
        .get<{ success: boolean; data: DashboardData }>(
          '/dashboard'
        )
        .then((r) => r.data.data),
    staleTime: 60_000, // cache 1 minute
    retry: 2,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <DashboardError />;
  if (!data) return <DashboardError />;

  const {
    period,
    alerts,
    is_summary,
    variance_pct,
    runway_weeks,
    ca_trend,
  } = data;

  // Séparer les alertes critiques et les autres
  const criticalAlerts = alerts.filter(
    (a) => a.severity === 'CRITICAL'
  );
  const otherAlerts = alerts.filter((a) => a.severity !== 'CRITICAL');
  const varianceRows = variance_pct ?? [];
  const caTrendRows = ca_trend.map((point) => ({
    period_label: point.period_label,
    value: Number(point.value) || 0,
  }));

  return (
    <div className="dashboard-page">
      {/* En-tête */}
      <div className="page-head">
        <div>
          <p className="page-eyebrow">TABLEAU DE BORD</p>
          <h1 className="page-title">Vue d'ensemble</h1>
          <p className="page-sub">
            Période en cours : <strong>{period.label}</strong>
            {' · '}Statut : <strong>{period.status}</strong>
          </p>
        </div>
        <PeriodSelector currentPeriod={period} />
      </div>

      {/* Alertes critiques en haut */}
      {criticalAlerts.map((alert) => (
        <AlertBanner key={alert.id} alert={alert} />
      ))}

      {/* KPI Cards — 4 colonnes */}
      <div className="kpi-row" data-testid="kpi-row">
        <KpiCard
          label="Chiffre d'Affaires"
          value={formatFCFA(Number(is_summary.revenue) || 0)}
          trend={is_summary.revenue_trend}
          color="terra"
          testId="kpi-CA"
        />
        <KpiCard
          label="EBITDA"
          value={formatFCFA(Number(is_summary.ebitda) || 0)}
          subtitle={`Marge ${is_summary.ebitda_margin}%`}
          trend={is_summary.ebitda_trend}
          color="gold"
          testId="kpi-EBITDA"
        />
        <KpiCard
          label="Résultat Net"
          value={formatFCFA(Number(is_summary.net) || 0)}
          trend={is_summary.net_trend}
          color="kola"
          testId="kpi-MARGE"
        />
        <KpiCard
          label="Runway Trésorerie"
          value={`${runway_weeks} semaines`}
          subtitle={
            runway_weeks < 8
              ? '⚠️ Attention'
              : '✅ Sain'
          }
          color={
            runway_weeks < 4
              ? 'terra'
              : runway_weeks < 8
                ? 'gold'
                : 'kola'
          }
          testId="kpi-RUNWAY"
        />
      </div>

      {/* Graphiques */}
      <div className="charts-row">
        <IsChart data={caTrendRows} />
        <CashRunway runway={runway_weeks} />
      </div>

      {/* Variance Budget vs Réel */}
      <VarianceTable variance_pct={varianceRows} />

      {/* Alertes WARN et INFO */}
      {otherAlerts.length > 0 && (
        <AlertsList alerts={otherAlerts} />
      )}
    </div>
  );
}
