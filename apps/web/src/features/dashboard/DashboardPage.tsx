import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';
import KpiCard from './components/KpiCard';
import AlertBanner from './components/AlertBanner';
import IsChart from './components/IsChart';
import CashRunway from './components/CashRunway';
import VarianceTable from './components/VarianceTable';
import AlertsList from './components/AlertsList';
import DashboardSkeleton from './components/DashboardSkeleton';
import DashboardError from './components/DashboardError';
import { usePeriodStore } from '../../stores/period.store';
import { dashboardDataSchema, parseFinancialPayload } from '../../contracts/financial.schemas';

export default function DashboardPage() {
  const { mode, quarterNumber, customFrom, customTo, currentPeriodId } = usePeriodStore();
  const isYtdMode = mode === 'ytd';

  const getPeriodParams = () => {
    if (mode === 'ytd') return { ytd: true };
    if (mode === 'quarter') return { quarter: quarterNumber ?? undefined };
    if (mode === 'custom') return { from_period: customFrom ?? undefined, to_period: customTo ?? undefined };
    return { period_id: currentPeriodId };
  };

  // Appel API réel — jamais de données hardcodées
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', mode, quarterNumber, customFrom, customTo, currentPeriodId],
    queryFn: () =>
      apiClient
        .get('/dashboard', {
          params: getPeriodParams(),
        })
        .then((r) => parseFinancialPayload(dashboardDataSchema, unwrapApiData(r), 'dashboard')),
    enabled:
      mode === 'ytd' ||
      (mode === 'quarter' && quarterNumber != null) ||
      (mode === 'custom' && !!customFrom && !!customTo) ||
      (!!currentPeriodId && mode === 'single'),
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
  const runwayWeeks = Number(runway_weeks) || 0;
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
            {isYtdMode ? ' · Vue YTD' : ''}
            {' · '}Statut : <strong>{period.status}</strong>
          </p>
        </div>

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
          showYtdBadge={isYtdMode}
        />
        <KpiCard
          label="EBITDA"
          value={formatFCFA(Number(is_summary.ebitda) || 0)}
          subtitle={`Marge ${is_summary.ebitda_margin}%`}
          trend={is_summary.ebitda_trend}
          color="gold"
          testId="kpi-EBITDA"
          showYtdBadge={isYtdMode}
        />
        <KpiCard
          label="Résultat Net"
          value={formatFCFA(Number(is_summary.net) || 0)}
          trend={is_summary.net_trend}
          color="kola"
          testId="kpi-MARGE"
          showYtdBadge={isYtdMode}
        />
        <KpiCard
          label="Runway Trésorerie"
          value={`${runway_weeks} semaines`}
          subtitle={
            runwayWeeks < 8
              ? '⚠️ Attention'
              : '✅ Sain'
          }
          color={
            runwayWeeks < 4
              ? 'terra'
              : runwayWeeks < 8
                ? 'gold'
                : 'kola'
          }
          testId="kpi-RUNWAY"
          showYtdBadge={isYtdMode}
        />
      </div>

      {/* Graphiques */}
      <div className="charts-row">
        <IsChart data={caTrendRows} />
        <CashRunway runway={runwayWeeks} />
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

