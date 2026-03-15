import { useQuery } from '@tanstack/react-query';
import { useOrgStore } from '../../stores/org.store';
import apiClient, { unwrapApiData } from '../../api/client';

type KpiValue = {
  kpi_id: string;
  kpi_code: string;
  kpi_label: string;
  unit: string;
  period_id: string;
  scenario_id: string | null;
  value: string;
  severity: string;
  calculated_at: string;
};

const SEV: Record<string, { bg: string; color: string; label: string; accent: string }> = {
  INFO:     { bg: 'var(--indigo-lt)', color: 'var(--indigo)', label: 'Normal',    accent: 'var(--indigo)' },
  WARN:     { bg: 'var(--gold-lt)',   color: 'var(--gold)',   label: 'Attention', accent: 'var(--gold)' },
  CRITICAL: { bg: 'var(--terra-lt)', color: 'var(--terra)',  label: 'Critique',  accent: 'var(--terra)' },
};

export default function KpisPage() {
  const currentPeriod = useOrgStore((s) => s.currentPeriod);

  const { data: kpis, isLoading, isError } = useQuery({
    queryKey: ['kpis-values', currentPeriod],
    enabled: Boolean(currentPeriod),
    queryFn: () =>
      apiClient
        .get<KpiValue[]>(`/kpis/values?period_id=${currentPeriod!}`)
        .then(unwrapApiData),
  });

  const values = kpis ?? [];
  const criticalCount = values.filter((k) => k.severity === 'CRITICAL').length;
  const warnCount = values.filter((k) => k.severity === 'WARN').length;

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">INDICATEURS</p>
          <h1 className="page-title">KPIs & Indicateurs</h1>
          <p className="page-sub">
            {isLoading ? '…' : `${values.length} indicateur(s)`}
            {criticalCount > 0 ? ` · ${criticalCount} critique(s)` : ''}
            {warnCount > 0 ? ` · ${warnCount} en attention` : ''}
          </p>
        </div>
      </div>

      {!currentPeriod && !isLoading && (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text-lo)' }}>
          <p style={{ fontSize: 28 }}>📊</p>
          <p style={{ fontWeight: 600, marginTop: 8, color: 'var(--text-md)' }}>Aucune période active</p>
          <p style={{ fontSize: 13 }}>Les indicateurs s'affichent dès qu'une période est ouverte.</p>
        </div>
      )}

      {isLoading && currentPeriod && (
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

      {!isLoading && !isError && currentPeriod && (
        <>
          {values.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
              Aucun indicateur calculé pour cette période.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {values.map((kpi) => {
                const sev = SEV[kpi.severity] ?? SEV.INFO;
                return (
                  <div
                    key={kpi.kpi_id}
                    data-testid={`kpi-card-${kpi.kpi_code}`}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                      padding: '20px 22px', display: 'flex', gap: 14, boxShadow: 'var(--shadow-sm)',
                      transition: 'box-shadow 0.2s, transform 0.2s',
                    }}
                  >
                    <div style={{ width: 4, borderRadius: 4, flexShrink: 0, alignSelf: 'stretch', background: sev.accent }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-lo)', margin: '0 0 6px 0' }}>
                        {kpi.kpi_code}
                      </p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.02em', margin: '0 0 4px 0', lineHeight: 1 }}>
                        {Number(kpi.value).toLocaleString('fr-SN')}{' '}
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-md)' }}>{kpi.unit}</span>
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-md)', margin: '0 0 10px 0' }}>{kpi.kpi_label}</p>
                      <span style={{ background: sev.bg, color: sev.color, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600 }}>
                        {sev.label}
                      </span>
                    </div>
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
