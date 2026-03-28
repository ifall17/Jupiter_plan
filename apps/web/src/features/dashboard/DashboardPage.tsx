import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrapApiData } from '../../api/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatFCFA } from '../../utils/currency';
import KpiCard from './components/KpiCard';
import AlertBanner from './components/AlertBanner';
import VarianceTable from './components/VarianceTable';
import AlertsList from './components/AlertsList';
import DashboardSkeleton from './components/DashboardSkeleton';
import DashboardError from './components/DashboardError';
import { usePeriodStore } from '../../stores/period.store';
import { dashboardDataSchema, parseFinancialPayload } from '../../contracts/financial.schemas';

type MonthlyPayload = {
  monthly: Array<{ month: string; revenue: number; expenses: number; ebitda: number }>;
  expensesByDept: Array<{ name: string; value: number }>;
  budgetVsActualByDept: Array<{ department: string; budget: number; actual: number }>;
};

type TooltipEntry = { name: string; value: number; color?: string };

const formatFCFAShort = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${value}`;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 16px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <p
        style={{
          fontWeight: 700,
          marginBottom: 8,
          color: 'var(--text-hi)',
          fontSize: 12,
        }}
      >
        {label}
      </p>
      {payload.map((item) => (
        <p
          key={item.name}
          style={{
            fontSize: 12,
            color: item.color ?? 'var(--text-hi)',
            marginBottom: 4,
          }}
        >
          {item.name} : {formatFCFAShort(Number(item.value) || 0)} FCFA
        </p>
      ))}
    </div>
  );
}

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

  const { data: monthlyData } = useQuery({
    queryKey: ['dashboard-monthly', currentPeriodId],
    queryFn: () =>
      apiClient
        .get<MonthlyPayload>('/dashboard/monthly')
        .then(unwrapApiData),
    enabled: Boolean(currentPeriodId),
    staleTime: 60_000,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <DashboardError />;
  if (!data) return <DashboardError />;

  const {
    period,
    kpis,
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
  const monthlyChartData = monthlyData?.monthly ?? [];
  const expensesByDept = monthlyData?.expensesByDept ?? [];
  const budgetVsActualByDept = monthlyData?.budgetVsActualByDept ?? [];

  const kpiByCode = new Map(kpis.map((kpi) => [kpi.kpi_code, Number(kpi.value) || 0]));
  const revenueValue = Number(is_summary.revenue) || kpiByCode.get('CA') || 0;
  const ebitdaValue = Number(is_summary.ebitda) || kpiByCode.get('EBITDA') || 0;
  const netValue = Number(is_summary.net) || 0;
  const ebitdaMarginValue =
    Number(is_summary.ebitda_margin) ||
    (revenueValue > 0 ? Number(((ebitdaValue / revenueValue) * 100).toFixed(2)) : 0);

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
          value={formatFCFA(revenueValue)}
          trend={is_summary.revenue_trend}
          color="terra"
          testId="kpi-CA"
          showYtdBadge={isYtdMode}
        />
        <KpiCard
          label="EBITDA"
          value={formatFCFA(ebitdaValue)}
          subtitle={`Marge ${ebitdaMarginValue}%`}
          trend={is_summary.ebitda_trend}
          color="gold"
          testId="kpi-EBITDA"
          showYtdBadge={isYtdMode}
        />
        <KpiCard
          label="Résultat Net"
          value={formatFCFA(netValue)}
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '20px 24px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-lo)',
              marginBottom: 16,
            }}
          >
            EVOLUTION MENSUELLE
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyChartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2d6a4f" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2d6a4f" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c4622d" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#c4622d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#9990a8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatFCFAShort}
                tick={{ fontSize: 10, fill: '#9990a8' }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#5a5570' }}>{value}</span>
                )}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenus"
                stroke="#2d6a4f"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                name="Charges"
                stroke="#c4622d"
                strokeWidth={2}
                fill="url(#colorExpenses)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="ebitda"
                name="EBITDA"
                stroke="#b8963e"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
                strokeDasharray="5 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '20px 24px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-lo)',
              marginBottom: 16,
            }}
          >
            REPARTITION CHARGES
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={expensesByDept}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {expensesByDept.map((_, i) => (
                  <Cell
                    key={i}
                    fill={[
                      '#c4622d', '#b8963e', '#2d6a4f',
                      '#3d5a99', '#5a5570', '#9990a8',
                      '#1a1a2e', '#e8c4ae',
                    ][i % 8]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${formatFCFAShort(Number(value) || 0)} FCFA`} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 10, color: '#5a5570' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '20px 24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 24,
        }}
      >
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-lo)',
            marginBottom: 16,
          }}
        >
          BUDGET VS REEL PAR DEPARTEMENT
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={budgetVsActualByDept} barGap={4} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" vertical={false} />
            <XAxis
              dataKey="department"
              tick={{ fontSize: 10, fill: '#9990a8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatFCFAShort}
              tick={{ fontSize: 10, fill: '#9990a8' }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="rect"
              iconSize={10}
              formatter={(value) => (
                <span style={{ fontSize: 11, color: '#5a5570' }}>{value}</span>
              )}
            />
            <Bar dataKey="budget" name="Budget" fill="#e8e2d9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="Reel" fill="#c4622d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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

