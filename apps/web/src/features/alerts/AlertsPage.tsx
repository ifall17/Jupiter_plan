import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatDate } from '../../utils/date';

type Alert = {
  id: string;
  kpi_code: string;
  kpi_label: string;
  period_id: string;
  severity: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

type PaginatedAlerts = { data: Alert[]; total: number };

const SEV: Record<string, { bg: string; color: string; icon: string }> = {
  INFO:     { bg: 'var(--indigo-lt)', color: 'var(--indigo)', icon: 'ℹ️' },
  WARN:     { bg: 'var(--gold-lt)',   color: 'var(--gold)',   icon: '🟡' },
  CRITICAL: { bg: 'var(--terra-lt)', color: 'var(--terra)',  icon: '🔴' },
};

const TH: React.CSSProperties = {
  padding: '10px 16px', color: 'var(--text-lo)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left',
};
const TD: React.CSSProperties = { padding: '14px 16px', color: 'var(--text-hi)', fontSize: 13 };

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['alerts-all'],
    queryFn: () =>
      apiClient.get<PaginatedAlerts>('/alerts?limit=100').then(unwrapApiData),
    refetchInterval: 60_000,
  });

  const markAll = useMutation({
    mutationFn: () => apiClient.patch('/alerts/read-all').then((r) => r.data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts-all'] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/alerts/${id}/read`).then((r) => r.data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts-all'] }),
  });

  const alerts = data?.data ?? [];
  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">ALERTES</p>
          <h1 className="page-title">Suivi des Alertes</h1>
          <p className="page-sub">
            <strong style={{ color: unreadCount > 0 ? 'var(--terra)' : 'var(--kola)' }}>{unreadCount} non lue(s)</strong>
            {' · '}{alerts.length} total
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            style={{
              padding: '8px 20px', background: 'var(--terra)', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {markAll.isPending ? '…' : 'Tout marquer comme lu'}
          </button>
        )}
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 52, background: 'var(--surface2)', borderRadius: 10, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger les alertes.
        </div>
      )}

      {!isLoading && !isError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {alerts.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)' }}>
              <p style={{ fontSize: 28 }}>✅</p>
              <p style={{ fontWeight: 600, marginTop: 8, color: 'var(--text-md)' }}>Aucune alerte active</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                    <th style={TH}>Sévérité</th>
                    <th style={TH}>KPI</th>
                    <th style={TH}>Message</th>
                    <th style={TH}>Date</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Statut</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a, idx) => {
                    const sev = SEV[a.severity] ?? SEV.INFO;
                    return (
                      <tr
                        key={a.id}
                        data-testid="alert-row"
                        style={{
                          borderBottom: idx < alerts.length - 1 ? '1px solid var(--border)' : 'none',
                          opacity: a.is_read ? 0.6 : 1,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        <td style={TD}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: sev.bg, color: sev.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                            {sev.icon} {a.severity}
                          </span>
                        </td>
                        <td style={TD}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{a.kpi_code}</span>
                          <br />
                          <span style={{ fontSize: 11, color: 'var(--text-lo)' }}>{a.kpi_label}</span>
                        </td>
                        <td style={{ ...TD, maxWidth: 380 }}>{a.message}</td>
                        <td style={{ ...TD, color: 'var(--text-md)', whiteSpace: 'nowrap' }}>
                          {formatDate(a.created_at, 'short')}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: a.is_read ? 'var(--text-lo)' : 'var(--kola)' }}>
                            {a.is_read ? 'Lu' : '● Non lu'}
                          </span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {!a.is_read && (
                            <button
                              onClick={() => markOne.mutate(a.id)}
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text-md)' }}
                            >
                              Marquer lu
                            </button>
                          )}
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
