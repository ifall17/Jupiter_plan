import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';
import { usePeriodStore } from '../../stores/period.store';
import { kpiValueSchema, parseFinancialPayload, type KpiValue } from '../../contracts/financial.schemas';
import { emitAppError, emitAppNotification } from '../../utils/notifications';

const CATEGORIES = [
  { key: 'ALL',           label: 'Tous',        icon: '📊', color: 'var(--ink)' },
  { key: 'PROFITABILITY', label: 'Rentabilité', icon: '💰', color: 'var(--kola)' },
  { key: 'ACTIVITY',     label: 'Activité',    icon: '⚡', color: 'var(--indigo)' },
  { key: 'EFFICIENCY',   label: 'Efficience',  icon: '🎯', color: 'var(--gold)' },
  { key: 'LIQUIDITY',    label: 'Liquidité',   icon: '💧', color: 'var(--terra)' },
] as const;

const KPI_CODES_BY_CATEGORY: Record<string, string[]> = {
  ALL: ['CA', 'EBITDA_MARGIN', 'GROSS_MARGIN', 'RUNWAY', 'CURRENT_RATIO'],
  PROFITABILITY: ['CA', 'GROSS_MARGIN', 'OPERATING_MARGIN', 'ROA'],
  ACTIVITY: ['DSO', 'DPO'],
  EFFICIENCY: ['ROA', 'ROCE'],
  LIQUIDITY: ['QUICK_RATIO', 'CURRENT_RATIO'],
};

function getStatus(kpi: KpiValue): string {
  if (kpi.status) return kpi.status;
  if (kpi.severity === 'CRITICAL') return 'CRITICAL';
  if (kpi.severity === 'WARN') return 'WARN';
  if (kpi.severity === 'INFO') return 'OK';
  return kpi.severity ?? 'N/A';
}

function catColorVar(category?: string | null): string {
  if (category === 'PROFITABILITY') return 'var(--kola)';
  if (category === 'ACTIVITY') return 'var(--indigo)';
  if (category === 'EFFICIENCY') return 'var(--gold)';
  if (category === 'LIQUIDITY') return 'var(--terra)';
  return 'var(--indigo)';
}

function getInterpretation(kpi: KpiValue): string | null {
  const value = parseFloat(kpi.value ?? '0');

  switch (kpi.kpi_code) {
    case 'GROSS_MARGIN':
      return value > 40 ? '✅ Marge saine' : value > 20 ? '⚠️ Marge à surveiller' : '🔴 Marge insuffisante';
    case 'DSO':
      return value < 30 ? '✅ Clients paient rapidement' : value < 60 ? '⚠️ Délai moyen' : '🔴 Délai trop long';
    case 'DPO':
      return value > 45 ? '✅ Bon délai fournisseurs' : '⚠️ Négocier des délais plus longs';
    case 'CURRENT_RATIO':
      return value > 2 ? '✅ Excellente liquidité' : value > 1 ? '⚠️ Liquidité correcte' : '🔴 Risque de liquidité';
    case 'QUICK_RATIO':
      return value > 1 ? '✅ Liquidité immédiate OK' : '🔴 Liquidité immédiate insuffisante';
    case 'ROA':
      return value > 10 ? '✅ Bonne rentabilité actifs' : value > 5 ? '⚠️ Rentabilité moyenne' : '🔴 Actifs peu rentables';
    case 'ROCE':
      return value > 15 ? '✅ Capital bien employé' : value > 8 ? '⚠️ Rendement moyen' : '🔴 Capital sous-utilisé';
    default:
      return null;
  }
}

export default function KpisPage() {
  const queryClient = useQueryClient();
  const [isCalculating, setIsCalculating] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const { mode, quarterNumber, customFrom, customTo, currentPeriodId } = usePeriodStore();
  const isYtdMode = mode === 'ytd';

  const getPeriodParams = () => {
    if (mode === 'ytd') return { ytd: true };
    if (mode === 'quarter') return { quarter: quarterNumber ?? undefined };
    if (mode === 'custom') return { from_period: customFrom ?? undefined, to_period: customTo ?? undefined };
    return { period_id: currentPeriodId };
  };

  const { data: kpis, isLoading, isError } = useQuery({
    queryKey: ['kpi-values', mode, quarterNumber, customFrom, customTo, currentPeriodId],
    enabled:
      mode === 'ytd' ||
      (mode === 'quarter' && quarterNumber != null) ||
      (mode === 'custom' && !!customFrom && !!customTo) ||
      (!!currentPeriodId && mode === 'single'),
    queryFn: () =>
      apiClient
        .get('/kpis/values', {
          params: getPeriodParams(),
        })
        .then((response) => parseFinancialPayload(z.array(kpiValueSchema), unwrapApiData(response), 'kpis/values')),
  });

  const handleCalculate = async () => {
    if (!currentPeriodId) {
      emitAppError('Aucune période sélectionnée - changer la période en haut de page');
      return;
    }
    setIsCalculating(true);
    try {
      await apiClient.post('/kpis/calculate', { period_id: currentPeriodId });
      emitAppNotification({ message: 'Calcul KPI lancé', severity: 'INFO' });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['kpi-values'] });
        setIsCalculating(false);
      }, 2000);
    } catch (err: unknown) {
      emitAppError('Erreur lors du calcul des KPIs');
      setIsCalculating(false);
    }
  };

  const values = kpis ?? [];
  const criticalCount = values.filter((k) => getStatus(k) === 'CRITICAL').length;
  const warnCount = values.filter((k) => getStatus(k) === 'WARN').length;

  const visibleCodes = KPI_CODES_BY_CATEGORY[activeCategory] ?? [];
  const visibleKpis = visibleCodes
    .map((code) => values.find((k) => k.kpi_code === code))
    .filter((kpi): kpi is KpiValue => Boolean(kpi));

  const findKpiValue = (code: string): number =>
    parseFloat(values.find((k) => k.kpi_code === code)?.value ?? '0') || 0;

  const radarData = [
    { subject: 'Rentabilité', score: Math.min(findKpiValue('EBITDA_MARGIN'), 100) },
    { subject: 'Activité',    score: Math.min(findKpiValue('ASSET_TURNOVER') * 100, 100) },
    { subject: 'Efficience',  score: Math.max(100 - findKpiValue('COST_PER_REVENUE'), 0) },
    { subject: 'Liquidité',   score: Math.min(findKpiValue('CURRENT_RATIO') * 50, 100) },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <p className="page-eyebrow">INDICATEURS</p>
          <h1 className="page-title">KPIs & Indicateurs</h1>
          <p className="page-sub">
            {isLoading ? '\u2026' : `${values.length} indicateur(s)`}
            {isYtdMode ? ' · mode YTD' : ''}
            {criticalCount > 0 ? ` · ${criticalCount} critique(s)` : ''}
            {warnCount > 0 ? ` · ${warnCount} en attention` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCalculate}
          disabled={isCalculating || !currentPeriodId}
          style={{
            padding: '9px 20px',
            background: isCalculating ? 'var(--text-lo)' : 'var(--terra)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: isCalculating || !currentPeriodId ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {isCalculating ? 'Calcul en cours\u2026' : '\u26a1 Calculer les KPIs'}
        </button>

      </div>

      {!currentPeriodId && !isLoading && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text-lo)' }}>
          <p style={{ fontSize: 28 }}>📊</p>
          <p style={{ fontWeight: 600, marginTop: 8, color: 'var(--text-md)' }}>Aucune période active</p>
          <p style={{ fontSize: 13 }}>Les indicateurs s'affichent dès qu'une période est ouverte.</p>
        </div>
      )}

      {isLoading && currentPeriodId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 110, background: 'var(--surface2)', borderRadius: 14, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger les KPIs.
        </div>
      )}

      {!isLoading && !isError && currentPeriodId && (
        <>
          {values.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>📊</p>
              <p style={{ fontWeight: 600, color: 'var(--text-md)', marginBottom: 8 }}>Aucun indicateur calculé pour cette période.</p>
              <p style={{ fontSize: 13, marginBottom: 20 }}>Cliquez sur « Calculer les KPIs » pour lancer le calcul.</p>
              <button
                type="button"
                onClick={handleCalculate}
                disabled={isCalculating}
                style={{ padding: '9px 20px', background: isCalculating ? 'var(--text-lo)' : 'var(--terra)', color: 'white', border: 'none', borderRadius: 8, cursor: isCalculating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {isCalculating ? 'Calcul en cours…' : '⚡ Calculer les KPIs'}
              </button>
            </div>
          ) : (
            <>
              {/* ── Onglets catégories ── */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
                {CATEGORIES.map((cat) => {
                  const count = (KPI_CODES_BY_CATEGORY[cat.key] ?? []).filter((code) =>
                    values.some((k) => k.kpi_code === code),
                  ).length;
                  const isActive = activeCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setActiveCategory(cat.key)}
                      style={{ padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, background: isActive ? 'var(--surface)' : 'transparent', color: isActive ? cat.color : 'var(--text-md)', boxShadow: isActive ? 'var(--shadow-sm)' : 'none', transition: 'all 0.15s' }}
                    >
                      {cat.icon} {cat.label}
                      {isActive && (
                        <span style={{ background: cat.color, color: 'white', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 6px', marginLeft: 2 }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── Grille KPI cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {visibleKpis.map((kpi) => {
                  const status = getStatus(kpi);
                  const label = kpi.label ?? kpi.kpi_label;
                  const categoryTheme = CATEGORIES.find((cat) => cat.key === activeCategory)?.color;
                  const baseColor = activeCategory === 'ALL' ? catColorVar(kpi.category) : (categoryTheme ?? catColorVar(kpi.category));
                  const accentColor =
                    status === 'CRITICAL' ? 'var(--terra)' :
                    status === 'WARN'     ? 'var(--gold)'  :
                    status === 'OK'       ? 'var(--kola)'  :
                    baseColor;
                  const statusBg =
                    status === 'CRITICAL' ? 'var(--terra-lt)' :
                    status === 'WARN'     ? 'var(--gold-lt)'  :
                    status === 'OK'       ? 'var(--kola-lt)'  :
                    'var(--surface2)';
                  const val = parseFloat(kpi.value ?? '0');
                  const warn = parseFloat((kpi.threshold_warn as string | number | null | undefined)?.toString() ?? '0');
                  const progress = warn > 0 ? Math.min((val / warn) * 100, 100) : null;
                  const interpretation = getInterpretation(kpi);

                  const displayValue = () => {
                    if (kpi.unit === '%') return `${val.toFixed(1)}%`;
                    if (kpi.unit === 'jours') return `${val.toFixed(0)} j`;
                    if (kpi.unit === 'x') return `${val.toFixed(2)}x`;
                    if (kpi.unit === 'semaines') return `${val.toFixed(0)} sem`;
                    return formatFCFA(kpi.value);
                  };

                  return (
                    <div
                      key={kpi.kpi_id}
                      data-testid={`kpi-card-${kpi.kpi_code}`}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 16, boxShadow: 'var(--shadow-sm)', transition: 'box-shadow 0.2s, transform 0.2s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = ''; }}
                    >
                      {/* Bande colorée */}
                      <div style={{ width: 4, borderRadius: 4, flexShrink: 0, alignSelf: 'stretch', background: accentColor }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-lo)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {label}
                          {isYtdMode && (
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700, background: 'var(--indigo-lt)', color: 'var(--indigo)', marginLeft: 6 }}>YTD</span>
                          )}
                        </p>

                        <p style={{ fontSize: 22, fontWeight: 700, color: accentColor, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6 }}>
                          {displayValue()}
                        </p>

                        {kpi.description && (
                          <p style={{ fontSize: 10, color: 'var(--text-lo)', marginBottom: progress !== null ? 8 : 0 }}>
                            {kpi.description}
                          </p>
                        )}

                        {interpretation && (
                          <p style={{ fontSize: 10, color: 'var(--text-md)', marginTop: 6, marginBottom: progress !== null ? 8 : 0, fontStyle: 'italic' }}>
                            {interpretation}
                          </p>
                        )}

                        {progress !== null && (
                          <div>
                            <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progress}%`, background: accentColor, borderRadius: 2, transition: 'width 0.5s ease' }} />
                            </div>
                            <p style={{ fontSize: 9, color: 'var(--text-lo)', marginTop: 3 }}>
                              Seuil alerte : {kpi.threshold_warn}{kpi.unit}
                            </p>
                          </div>
                        )}
                      </div>

                      <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 9, fontWeight: 700, alignSelf: 'flex-start', flexShrink: 0, background: statusBg, color: accentColor }}>
                        {status ?? '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ── Radar Chart ── */}
              {activeCategory === 'ALL' && values.length >= 4 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginTop: 24, boxShadow: 'var(--shadow-sm)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-lo)', marginBottom: 16 }}>
                    TABLEAU DE BORD GLOBAL — SCORE PAR DIMENSION
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ResponsiveContainer width={420} height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#e8e2d9" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#5a5570', fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#9990a8' }} />
                        <Radar
                          name="Performance"
                          dataKey="score"
                          stroke="#c4622d"
                          fill="#c4622d"
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                        <Tooltip
                          formatter={(v) => [`${Number(v).toFixed(0)}/100`, 'Score']}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
