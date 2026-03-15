import { useQuery } from '@tanstack/react-query';
import { useOrgStore } from '../../stores/org.store';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatFCFA } from '../../utils/currency';

type CashFlowEntry = {
  id: string;
  period_id: string;
  week_number: number;
  label: string;
  inflow: string;
  outflow: string;
  balance: string;
  runway_weeks: number | null;
};

type RunwayStatus = {
  runway_weeks: number;
  balance: string;
  avg_burn: string;
};

const TH: React.CSSProperties = {
  padding: '10px 16px', color: 'var(--text-lo)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right',
};
const TD: React.CSSProperties = { padding: '14px 16px', color: 'var(--text-hi)', fontSize: 13, textAlign: 'right' };

export default function CashFlowPage() {
  const fiscalYearId = useOrgStore((s) => s.fiscalYearId);

  const { data: entries, isLoading, isError } = useQuery({
    queryKey: ['cashflow', fiscalYearId],
    queryFn: () =>
      apiClient
        .get<CashFlowEntry[]>(`/cashflow${fiscalYearId ? `?fiscal_year_id=${fiscalYearId}` : ''}`)
        .then(unwrapApiData),
  });

  const { data: runway } = useQuery({
    queryKey: ['cashflow-runway'],
    queryFn: () => apiClient.get<RunwayStatus>('/cashflow/runway').then(unwrapApiData),
  });

  const rows = entries ?? [];
  const rw = runway?.runway_weeks ?? 0;
  const runwayColor = rw < 4 ? 'var(--terra)' : rw < 8 ? 'var(--gold)' : 'var(--kola)';
  const totalInflow = rows.reduce((s, r) => s + (Number(r.inflow) || 0), 0);
  const totalOutflow = rows.reduce((s, r) => s + (Number(r.outflow) || 0), 0);

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">TRÉSORERIE</p>
          <h1 className="page-title">Plan de Trésorerie</h1>
          <p className="page-sub">{isLoading ? '…' : `${rows.length} entrée(s)`} · Rolling plan</p>
        </div>
      </div>

      {/* KPI summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Runway */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 4, background: runwayColor, borderRadius: 4, flexShrink: 0, alignSelf: 'stretch' }} />
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 6px 0' }}>Runway</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: runwayColor, margin: '0 0 4px 0', lineHeight: 1 }}>{rw} semaines</p>
            <p style={{ fontSize: 12, color: 'var(--text-md)', margin: 0 }}>
              {rw < 4 ? '⚠️ Critique' : rw < 8 ? '⚠️ Attention' : '✅ Sain'}
            </p>
          </div>
        </div>

        {/* Total entrées */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 4, background: 'var(--kola)', borderRadius: 4, flexShrink: 0, alignSelf: 'stretch' }} />
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 6px 0' }}>Total Entrées</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--kola)', margin: 0, lineHeight: 1 }}>{formatFCFA(totalInflow)}</p>
          </div>
        </div>

        {/* Total sorties */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 4, background: 'var(--terra)', borderRadius: 4, flexShrink: 0, alignSelf: 'stretch' }} />
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 6px 0' }}>Total Sorties</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--terra)', margin: 0, lineHeight: 1 }}>{formatFCFA(totalOutflow)}</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 52, background: 'var(--surface2)', borderRadius: 14, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger le plan de trésorerie.
        </div>
      )}

      {!isLoading && !isError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)' }}>
              Aucune entrée de trésorerie pour cet exercice.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                    <th style={{ ...TH, textAlign: 'left' }}>Semaine</th>
                    <th style={{ ...TH, textAlign: 'left' }}>Libellé</th>
                    <th style={TH}>Entrées</th>
                    <th style={TH}>Sorties</th>
                    <th style={TH}>Solde</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Runway</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const bal = Number(r.balance) || 0;
                    return (
                      <tr key={r.id} style={{ borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: 'var(--text-md)' }}>S{r.week_number}</td>
                        <td style={{ ...TD, textAlign: 'left' }}>{r.label}</td>
                        <td style={{ ...TD, color: 'var(--kola)', fontWeight: 600 }}>{formatFCFA(r.inflow)}</td>
                        <td style={{ ...TD, color: 'var(--terra)', fontWeight: 600 }}>{formatFCFA(r.outflow)}</td>
                        <td style={{ ...TD, fontWeight: 700, color: bal >= 0 ? 'var(--kola)' : 'var(--terra)' }}>
                          {formatFCFA(r.balance)}
                        </td>
                        <td style={{ ...TD, textAlign: 'center', color: 'var(--text-md)' }}>
                          {r.runway_weeks !== null ? `${r.runway_weeks} sem.` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
