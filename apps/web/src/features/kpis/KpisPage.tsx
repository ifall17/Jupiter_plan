import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';
import { usePeriodStore } from '../../stores/period.store';
import { kpiValueSchema, parseFinancialPayload, type KpiValue } from '../../contracts/financial.schemas';


function getStatus(kpi: KpiValue): string {
  if (kpi.status) return kpi.status;
  if (kpi.severity === 'CRITICAL') return 'CRITICAL';
  if (kpi.severity === 'WARN') return 'WARN';
  if (kpi.severity === 'INFO') return 'OK';
  return kpi.severity ?? 'N/A';
}

function getAccentClass(status: string): string {
  if (status === 'CRITICAL') return 'terra';
  if (status === 'WARN') return 'gold';
  if (status === 'OK') return 'kola';
  return 'indigo';
}

export default function KpisPage() {
  const queryClient = useQueryClient();
  const [isCalculating, setIsCalculating] = useState(false);
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
    console.log('Period ID:', currentPeriodId);
    if (!currentPeriodId) {
      alert('Aucune période sélectionnée - changer la période en haut de page');
      return;
    }
    setIsCalculating(true);
    try {
      await apiClient.post('/kpis/calculate', { period_id: currentPeriodId });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['kpi-values'] });
        setIsCalculating(false);
      }, 2000);
    } catch (err: unknown) {
      console.error('Erreur calcul KPIs:', err);
      setIsCalculating(false);
    }
  };

  const values = kpis ?? [];
  const criticalCount = values.filter((k) => getStatus(k) === 'CRITICAL').length;
  const warnCount = values.filter((k) => getStatus(k) === 'WARN').length;

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
              <p style={{ fontSize: 28, marginBottom: 8 }}>\ud83d\udcca</p>
              <p style={{ fontWeight: 600, color: 'var(--text-md)', marginBottom: 8 }}>Aucun indicateur calcul\u00e9 pour cette p\u00e9riode.</p>
              <p style={{ fontSize: 13, marginBottom: 20 }}>Cliquez sur &laquo;&nbsp;Calculer les KPIs&nbsp;&raquo; pour lancer le calcul.</p>
              <button
                type="button"
                onClick={handleCalculate}
                disabled={isCalculating}
                style={{
                  padding: '9px 20px',
                  background: isCalculating ? 'var(--text-lo)' : 'var(--terra)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: isCalculating ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {isCalculating ? 'Calcul en cours\u2026' : '\u26a1 Calculer les KPIs'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
              {values.map((kpi) => {
                const status = getStatus(kpi);
                const accentClass = getAccentClass(status);
                const label = kpi.label ?? kpi.kpi_label;
                const statusBg =
                  status === 'CRITICAL' ? 'var(--terra-lt)' :
                  status === 'WARN'     ? 'var(--gold-lt)'  :
                  status === 'OK'       ? 'var(--kola-lt)'  :
                                          'var(--surface2)';
                const statusColor =
                  status === 'CRITICAL' ? 'var(--terra)' :
                  status === 'WARN'     ? 'var(--gold)'  :
                  status === 'OK'       ? 'var(--kola)'  :
                                          'var(--text-md)';
                return (
                  <div
                    key={kpi.kpi_id}
                    data-testid={`kpi-card-${kpi.kpi_code}`}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '20px 22px',
                      display: 'flex',
                      gap: 16,
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div className={`kpi-accent ${accentClass}`} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-lo)', marginBottom: 8 }}>
                        {label}
                        {isYtdMode && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 20,
                              fontSize: 9,
                              fontWeight: 700,
                              background: 'var(--indigo-lt)',
                              color: 'var(--indigo)',
                              marginLeft: 6,
                            }}
                          >
                            YTD
                          </span>
                        )}
                      </p>
                      <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>
                        {kpi.unit === '%'
                          ? `${kpi.value}%`
                          : kpi.unit === 'semaines'
                            ? `${kpi.value} semaines`
                            : formatFCFA(kpi.value)}
                      </p>
                      {kpi.threshold_warn != null && (
                        <p style={{ fontSize: 11, color: 'var(--text-lo)', marginTop: 4 }}>
                          Seuil alerte\u00a0: {kpi.threshold_warn}{kpi.unit}
                        </p>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        alignSelf: 'flex-start',
                        background: statusBg,
                        color: statusColor,
                      }}
                    >
                      {status ?? 'N/A'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
