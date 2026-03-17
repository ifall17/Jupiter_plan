import { useEffect, useRef, useState } from 'react';
import { Bell, LogOut, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { UserRole } from '@web/shared/enums';
import apiClient, { unwrapApiData } from '../../api/client';
import { useOrgStore } from '../../stores/org.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLogout } from '../../hooks/useAuth';
import { formatDate } from '../../utils/date';
import { Link } from 'react-router-dom';
import { usePeriodStore } from '../../stores/period.store';

type Period = { id: string; start_date: string; label: string; status: string };
type Alert = { id: string; severity: 'INFO' | 'WARN' | 'CRITICAL'; message: string; created_at: string };

function getRoleClass(role: UserRole): string {
  if (role === UserRole.SUPER_ADMIN) return 'topbar-role-badge topbar-role-super-admin';
  if (role === UserRole.FPA) return 'topbar-role-badge topbar-role-fpa';
  if (role === UserRole.CONTRIBUTEUR) return 'topbar-role-badge topbar-role-contributeur';
  return 'topbar-role-badge topbar-role-lecteur';
}

function getSeverityClass(severity: Alert['severity']): string {
  if (severity === 'INFO') return 'topbar-alert-severity topbar-alert-severity-info';
  if (severity === 'WARN') return 'topbar-alert-severity topbar-alert-severity-warn';
  return 'topbar-alert-severity topbar-alert-severity-critical';
}

export default function Topbar(): JSX.Element {
  const logout = useLogout();
  const user = useAuthStore((state) => state.user);
  const orgName = useOrgStore((state) => state.orgName);
  const setOrg = useOrgStore((state) => state.setOrg);
  const [openAlerts, setOpenAlerts] = useState<boolean>(false);
  const [openProfile, setOpenProfile] = useState<boolean>(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const { currentPeriod, setPeriod, isYTD, setYTD } = usePeriodStore();
  const currentMonthLabel = new Date().toLocaleDateString('fr-FR', { month: 'short' });

  const periodsQuery = useQuery({
    queryKey: ['periods-topbar'],
    queryFn: async (): Promise<Period[]> => {
      const response = await apiClient.get<Period[]>('/periods');
      return unwrapApiData(response);
    },
    staleTime: 5 * 60 * 1000,
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'unread'],
    queryFn: async (): Promise<Alert[]> => {
      const response = await apiClient.get<Alert[]>('/alerts?is_read=false');
      return unwrapApiData(response);
    },
    refetchInterval: 60000,
  });

  const alerts = alertsQuery.data ?? [];
  const fullName = user ? `${user.first_name} ${user.last_name}` : 'Utilisateur';

  useEffect(() => {
    if (!periodsQuery.data || periodsQuery.data.length === 0 || currentPeriod) {
      return;
    }

    const open = periodsQuery.data.find((period) => period.status === 'OPEN') ?? periodsQuery.data[0];
    setPeriod({ id: open.id, label: open.label, status: open.status });
    setOrg({ currentPeriod: open.id });
  }, [currentPeriod, periodsQuery.data, setOrg, setPeriod]);

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
    <header className="topbar-root">
      <div className="topbar-inner">
        <div className="topbar-brand-wrap">
          <div className="font-semibold topbar-brand">🪐 Jupiter_Plan</div>
          <div className="text-xs topbar-org-name">{orgName ?? 'Organisation'}</div>
        </div>

        <div className="topbar-actions">
          <select
            className="text-sm topbar-period-select"
            value={isYTD ? 'YTD' : currentPeriod?.id ?? ''}
            onChange={(event) => {
              if (event.target.value === 'YTD') {
                setYTD(true);
                return;
              }

              const selected = (periodsQuery.data ?? []).find((period) => period.id === event.target.value);
              if (!selected) {
                return;
              }
              setPeriod({ id: selected.id, label: selected.label, status: selected.status });
              setOrg({ currentPeriod: selected.id });
            }}
          >
            <option value="YTD">Periode courante (Jan → {currentMonthLabel})</option>
            <option disabled>--------------</option>
            {(periodsQuery.data ?? []).map((period) => (
              <option key={period.id} value={period.id}>
                {period.label || formatDate(period.start_date, 'month-year')}
              </option>
            ))}
          </select>

          <div className="topbar-popover-wrap">
            <button type="button" className="topbar-icon-button" onClick={() => setOpenAlerts((v) => !v)}>
            <Bell size={18} color="#1a1a2e" />
            {alerts.length > 0 ? (
              <span className="topbar-alert-count">
                {alerts.length}
              </span>
            ) : null}
            </button>

            {openAlerts ? (
              <div className="topbar-alert-dropdown">
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((a) => (
                    <div key={a.id} className="topbar-alert-item text-xs border-b pb-2">
                      <div className={getSeverityClass(a.severity)}>{a.severity}</div>
                      <div className="topbar-alert-message">{a.message}</div>
                      <div className="topbar-alert-date">{formatDate(a.created_at, 'short')}</div>
                    </div>
                  ))}
                </div>
                <a href="/alerts" className="block mt-2 text-xs topbar-alert-link">Voir toutes les alertes</a>
              </div>
            ) : null}
          </div>

          <div ref={profileRef} className="topbar-popover-wrap">
            <button
              type="button"
              onClick={() => setOpenProfile((v) => !v)}
              className="topbar-profile-button"
            >
              <div className="topbar-avatar">
                {user?.first_name?.[0] ?? 'U'}
              </div>
              <div className="topbar-user-text-wrap">
                <div className="topbar-user-name">{fullName}</div>
                {user ? (
                  <span className={getRoleClass(user.role)}>
                    {user.role}
                  </span>
                ) : null}
              </div>
            </button>
            {openProfile ? (
              <div className="topbar-profile-dropdown">
                <div className="topbar-profile-header">
                  <div className="topbar-profile-name">{fullName}</div>
                  {user ? (
                    <span className={getRoleClass(user.role)}>
                      {user.role}
                    </span>
                  ) : null}
                </div>
                <hr className="topbar-profile-divider" />
                <Link
                  to="/settings"
                  onClick={() => setOpenProfile(false)}
                  className="topbar-dropdown-item topbar-dropdown-link"
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
                  className="topbar-dropdown-item topbar-dropdown-item-danger"
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
