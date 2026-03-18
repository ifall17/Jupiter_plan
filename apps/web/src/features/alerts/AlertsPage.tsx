import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatDate } from '../../utils/date';
import { usePeriodStore } from '../../stores/period.store';

type Alert = {
  id: string;
  title?: string;
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

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { mode, quarterNumber, customFrom, customTo, currentPeriodId } = usePeriodStore();

  const getPeriodParams = () => {
    if (mode === 'ytd') return { ytd: true };
    if (mode === 'quarter') return { quarter: quarterNumber ?? undefined };
    if (mode === 'custom') return { from_period: customFrom ?? undefined, to_period: customTo ?? undefined };
    return { period_id: currentPeriodId };
  };

  const { data: alertsData, isLoading, isError } = useQuery({
    queryKey: ['alerts', mode, quarterNumber, customFrom, customTo, currentPeriodId],
    queryFn: () =>
      apiClient
        .get<PaginatedAlerts>('/alerts', {
          params: {
            ...getPeriodParams(),
            limit: 100,
          },
        })
        .then(unwrapApiData),
    enabled:
      mode === 'ytd' ||
      (mode === 'quarter' && quarterNumber != null) ||
      (mode === 'custom' && !!customFrom && !!customTo) ||
      (!!currentPeriodId && mode === 'single'),
    refetchInterval: 60_000,
  });

  const markAsRead = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/alerts/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: () => apiClient.patch('/alerts/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const alerts = Array.isArray(alertsData)
    ? alertsData
    : ((alertsData as PaginatedAlerts | undefined)?.data ?? []);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {alerts.filter((alert) => !alert.is_read).length > 0 && (
            <button
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
              style={{
                padding: '9px 18px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-hi)',
              }}
            >
              ✓ Tout marquer comme lu
            </button>
          )}
        </div>
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
        <div style={{ display: 'grid', gap: 12 }}>
          {alerts.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 48, textAlign: 'center', color: 'var(--text-lo)' }}>
              <p style={{ fontSize: 28 }}>✅</p>
              <p style={{ fontWeight: 600, marginTop: 8, color: 'var(--text-md)' }}>Aucune alerte active</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const sev = SEV[alert.severity] ?? SEV.INFO;

              return (
                <div
                  key={alert.id}
                  style={{
                    background: alert.is_read ? 'var(--surface)' : 'var(--surface2)',
                    border: `1px solid ${
                      alert.severity === 'CRITICAL'
                        ? 'var(--terra)'
                        : alert.severity === 'WARN'
                          ? 'var(--gold)'
                          : 'var(--border)'
                    }`,
                    borderLeft: `4px solid ${
                      alert.severity === 'CRITICAL'
                        ? 'var(--terra)'
                        : alert.severity === 'WARN'
                          ? 'var(--gold)'
                          : 'var(--indigo)'
                    }`,
                    borderRadius: 12,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    opacity: alert.is_read ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{sev.icon}</span>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 700,
                          background:
                            alert.severity === 'CRITICAL'
                              ? 'var(--terra-lt)'
                              : alert.severity === 'WARN'
                                ? 'var(--gold-lt)'
                                : 'var(--indigo-lt)',
                          color:
                            alert.severity === 'CRITICAL'
                              ? 'var(--terra)'
                              : alert.severity === 'WARN'
                                ? 'var(--gold)'
                                : 'var(--indigo)',
                        }}
                      >
                        {alert.severity}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-lo)' }}>
                        {formatDate(alert.created_at, 'short')}
                      </span>
                      {!alert.is_read && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--terra)',
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hi)', marginBottom: 2 }}>
                      {alert.title ?? alert.kpi_code}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-md)' }}>{alert.message}</p>
                  </div>

                  {!alert.is_read && (
                    <button
                      onClick={() => markAsRead.mutate(alert.id)}
                      style={{
                        padding: '6px 14px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-md)',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background = 'var(--surface2)';
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = 'transparent';
                      }}
                    >
                      ✓ Marquer lue
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
