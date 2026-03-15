import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, LogOut, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { UserRole } from '@web/shared/enums';
import apiClient, { unwrapApiData } from '../../api/client';
import { useOrgStore } from '../../stores/org.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLogout } from '../../hooks/useAuth';
import { formatDate } from '../../utils/date';
import { Link } from 'react-router-dom';

type Period = { id: string; start_date: string; label: string };
type Alert = { id: string; severity: 'INFO' | 'WARN' | 'CRITICAL'; message: string; created_at: string };

const roleColor: Record<UserRole, string> = {
  SUPER_ADMIN: '#c4622d',
  FPA: '#3d5a99',
  CONTRIBUTEUR: '#2d6a4f',
  LECTEUR: '#b8963e',
};

const severityColor: Record<Alert['severity'], string> = {
  INFO: '#3d5a99',
  WARN: '#b8963e',
  CRITICAL: '#c0303f',
};

const dropdownItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text-md)',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  width: '100%',
  textAlign: 'left',
};

const iconButtonStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 38,
  height: 38,
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
};

function applyHoverStyle(event: React.MouseEvent<HTMLElement>, variant: 'default' | 'danger'): void {
  event.currentTarget.style.background = variant === 'danger' ? 'var(--terra-lt)' : 'var(--surface2)';
  event.currentTarget.style.color = variant === 'danger' ? 'var(--terra)' : 'var(--text-hi)';
}

function resetHoverStyle(event: React.MouseEvent<HTMLElement>, variant: 'default' | 'danger'): void {
  event.currentTarget.style.background = 'none';
  event.currentTarget.style.color = variant === 'danger' ? 'var(--terra)' : 'var(--text-md)';
}

export default function Topbar(): JSX.Element {
  const logout = useLogout();
  const user = useAuthStore((state) => state.user);
  const orgName = useOrgStore((state) => state.orgName);
  const currentPeriod = useOrgStore((state) => state.currentPeriod);
  const fiscalYearId = useOrgStore((state) => state.fiscalYearId);
  const setOrg = useOrgStore((state) => state.setOrg);
  const [openAlerts, setOpenAlerts] = useState<boolean>(false);
  const [openProfile, setOpenProfile] = useState<boolean>(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const periodsQuery = useQuery({
    queryKey: ['periods', fiscalYearId],
    enabled: Boolean(fiscalYearId),
    queryFn: async (): Promise<Period[]> => {
      const response = await apiClient.get<Period[]>(`/periods?fiscal_year_id=${fiscalYearId}&status=OPEN`);
      return unwrapApiData(response);
    },
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'unread'],
    queryFn: async (): Promise<Alert[]> => {
      const response = await apiClient.get<Alert[]>('/alerts?is_read=false');
      return unwrapApiData(response);
    },
    refetchInterval: 60000,
  });

  const selectedPeriodLabel = useMemo(() => {
    const selected = periodsQuery.data?.find((p) => p.id === currentPeriod);
    if (!selected) {
      return 'Periode courante';
    }
    return formatDate(selected.start_date, 'month-year');
  }, [currentPeriod, periodsQuery.data]);

  const alerts = alertsQuery.data ?? [];
  const fullName = user ? `${user.first_name} ${user.last_name}` : 'Utilisateur';

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setOpenProfile(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        borderBottom: '1px solid #e8e2d9',
        background: '#ffffff',
        minHeight: 64,
        overflow: 'visible',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="font-semibold" style={{ color: '#1a1a2e' }}>🪐 Jupiter_Plan</div>
          <div className="text-xs" style={{ color: '#5a5570' }}>{orgName ?? 'Organisation'}</div>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <select
            className="text-sm"
            style={{
              border: '1px solid #e8e2d9',
              color: '#1a1a2e',
              borderRadius: 10,
              padding: '8px 12px',
              minWidth: 180,
              background: '#fff',
            }}
            value={currentPeriod ?? ''}
            onChange={(event) => setOrg({ currentPeriod: event.target.value || null })}
          >
            <option value="">{selectedPeriodLabel}</option>
            {(periodsQuery.data ?? []).map((period) => (
              <option key={period.id} value={period.id}>
                {formatDate(period.start_date, 'month-year')}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative' }}>
            <button type="button" style={iconButtonStyle} onClick={() => setOpenAlerts((v) => !v)}>
            <Bell size={18} color="#1a1a2e" />
            {alerts.length > 0 ? (
              <span
                className="absolute -top-2 -right-2 text-[10px] rounded-full px-1.5"
                style={{ background: '#c0303f', color: '#fff' }}
              >
                {alerts.length}
              </span>
            ) : null}
            </button>

            {openAlerts ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 320,
                  borderRadius: 12,
                  border: '1px solid #e8e2d9',
                  padding: 12,
                  background: '#fff',
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 150,
                }}
              >
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((a) => (
                    <div key={a.id} className="text-xs border-b pb-2" style={{ borderColor: '#e8e2d9' }}>
                      <div className="font-semibold" style={{ color: severityColor[a.severity] }}>{a.severity}</div>
                      <div style={{ color: '#1a1a2e' }}>{a.message}</div>
                      <div style={{ color: '#5a5570' }}>{formatDate(a.created_at, 'short')}</div>
                    </div>
                  ))}
                </div>
                <a href="/alerts" className="block mt-2 text-xs" style={{ color: '#c4622d' }}>Voir toutes les alertes</a>
              </div>
            ) : null}
          </div>

          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOpenProfile((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 42,
                padding: '6px 10px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface2)',
                  color: 'var(--text-hi)',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {user?.first_name?.[0] ?? 'U'}
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{fullName}</div>
                {user ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      marginTop: 4,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      background: user.role === UserRole.SUPER_ADMIN ? 'var(--terra-lt)' : 'var(--surface2)',
                      color: user.role === UserRole.SUPER_ADMIN ? 'var(--terra)' : roleColor[user.role],
                    }}
                  >
                    {user.role}
                  </span>
                ) : null}
              </div>
            </button>
            {openProfile ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 200,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: 'var(--shadow-md)',
                  minWidth: '180px',
                  padding: '6px',
                  overflow: 'hidden',
                  textAlign: 'left',
                }}
              >
                <div style={{ padding: '8px 14px 10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-hi)' }}>{fullName}</div>
                  {user ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        marginTop: 8,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: user.role === UserRole.SUPER_ADMIN ? 'var(--terra-lt)' : 'var(--surface2)',
                        color: user.role === UserRole.SUPER_ADMIN ? 'var(--terra)' : roleColor[user.role],
                      }}
                    >
                      {user.role}
                    </span>
                  ) : null}
                </div>
                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <Link
                  to="/settings"
                  onClick={() => setOpenProfile(false)}
                  style={{ ...dropdownItemStyle, textDecoration: 'none' }}
                  onMouseEnter={(event) => applyHoverStyle(event, 'default')}
                  onMouseLeave={(event) => resetHoverStyle(event, 'default')}
                >
                  <Settings size={15} />
                  Parametres du compte
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpenProfile(false);
                    logout.mutate();
                  }}
                  style={{ ...dropdownItemStyle, color: 'var(--terra)' }}
                  onMouseEnter={(event) => applyHoverStyle(event, 'danger')}
                  onMouseLeave={(event) => resetHoverStyle(event, 'danger')}
                >
                  <LogOut size={15} />
                  Deconnexion
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
