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
  const [showPeriodMenu, setShowPeriodMenu] = useState<boolean>(false);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customFromDraft, setCustomFromDraft] = useState<string>('');
  const [customToDraft, setCustomToDraft] = useState<string>('');
  const profileRef = useRef<HTMLDivElement | null>(null);
  const periodRef = useRef<HTMLDivElement | null>(null);
  const {
    mode,
    quarterNumber,
    currentPeriod,
    setPeriod,
    setYTD,
    setQuarter,
    setCustomRange,
    getLabel,
    customFrom,
    customTo,
  } = usePeriodStore();
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
  const periods = periodsQuery.data ?? [];
  const fullName = user ? `${user.first_name} ${user.last_name}` : 'Utilisateur';

  useEffect(() => {
    if (!periodsQuery.data || periodsQuery.data.length === 0 || currentPeriod) {
      return;
    }

    const open = periodsQuery.data.find((period) => period.status === 'OPEN') ?? periodsQuery.data[0];
    usePeriodStore.setState({
      currentPeriod: { id: open.id, label: open.label, status: open.status },
      currentPeriodId: open.id,
    });
    setOrg({ currentPeriod: open.id });
  }, [currentPeriod, periodsQuery.data, setOrg]);

  useEffect(() => {
    if (showCustomModal) {
      setCustomFromDraft(customFrom ?? '');
      setCustomToDraft(customTo ?? '');
    }
  }, [customFrom, customTo, showCustomModal]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setOpenProfile(false);
      }
      if (!periodRef.current?.contains(event.target as Node)) {
        setShowPeriodMenu(false);
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
          <div ref={periodRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowPeriodMenu((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid rgba(184,150,62,0.25)',
                background: 'var(--gold-lt)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--gold)',
                cursor: 'pointer',
              }}
            >
              📅 {getLabel()} ▾
            </button>

            {showPeriodMenu ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 300,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  boxShadow: 'var(--shadow-md)',
                  minWidth: 220,
                  padding: 6,
                  maxHeight: 400,
                  overflowY: 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setYTD();
                    setShowPeriodMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '9px 14px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: mode === 'ytd' ? 700 : 500,
                    background: mode === 'ytd' ? 'var(--gold-lt)' : 'transparent',
                    color: mode === 'ytd' ? 'var(--gold)' : 'var(--text-hi)',
                    textAlign: 'left',
                  }}
                >
                  📊 Période courante (YTD)
                  <span style={{ fontSize: 10, color: 'var(--text-lo)', marginLeft: 'auto' }}>
                    Jan → {currentMonthLabel}
                  </span>
                </button>

                <div
                  style={{
                    padding: '6px 14px 2px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'var(--text-lo)',
                  }}
                >
                  TRIMESTRES
                </div>

                {[
                  { q: 1, label: 'T1', months: 'Jan → Mar' },
                  { q: 2, label: 'T2', months: 'Avr → Jun' },
                  { q: 3, label: 'T3', months: 'Jul → Sep' },
                  { q: 4, label: 'T4', months: 'Oct → Déc' },
                ].map(({ q, label, months }) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setQuarter(q);
                      setShowPeriodMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: mode === 'quarter' && quarterNumber === q ? 700 : 500,
                      background: mode === 'quarter' && quarterNumber === q ? 'var(--indigo-lt)' : 'transparent',
                      color: mode === 'quarter' && quarterNumber === q ? 'var(--indigo)' : 'var(--text-hi)',
                      textAlign: 'left',
                    }}
                  >
                    {label}
                    <span style={{ fontSize: 10, color: 'var(--text-lo)', marginLeft: 'auto' }}>{months}</span>
                  </button>
                ))}

                <div
                  style={{
                    padding: '6px 14px 2px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'var(--text-lo)',
                  }}
                >
                  PLAGE PERSONNALISEE
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowPeriodMenu(false);
                    setShowCustomModal(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '9px 14px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    background: mode === 'custom' ? 'var(--terra-lt)' : 'transparent',
                    color: mode === 'custom' ? 'var(--terra)' : 'var(--text-hi)',
                    textAlign: 'left',
                  }}
                >
                  📅 Definir une plage...
                </button>

                <div
                  style={{
                    margin: '4px 0',
                    borderTop: '1px solid var(--border)',
                    padding: '6px 14px 2px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'var(--text-lo)',
                  }}
                >
                  MOIS
                </div>

                {periods.map((period) => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => {
                      setPeriod({ id: period.id, label: period.label, status: period.status });
                      setOrg({ currentPeriod: period.id });
                      setShowPeriodMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: mode === 'single' && currentPeriod?.id === period.id ? 700 : 400,
                      background: mode === 'single' && currentPeriod?.id === period.id ? 'var(--surface2)' : 'transparent',
                      color: 'var(--text-hi)',
                      textAlign: 'left',
                    }}
                  >
                    {period.label || formatDate(period.start_date, 'month-year')}
                    {period.status === 'OPEN' ? (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 9,
                          fontWeight: 700,
                          color: 'var(--kola)',
                          background: 'var(--kola-lt)',
                          padding: '1px 6px',
                          borderRadius: 10,
                        }}
                      >
                        EN COURS
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {showCustomModal ? (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(26,26,46,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 400,
              }}
            >
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 16,
                  padding: 32,
                  width: 400,
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--ink)', marginBottom: 24 }}>
                  Plage personnalisee
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-md)',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      De
                    </label>
                    <select
                      value={customFromDraft}
                      onChange={(event) => setCustomFromDraft(event.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        background: 'var(--surface)',
                      }}
                    >
                      <option value="">Debut</option>
                      {periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-md)',
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      A
                    </label>
                    <select
                      value={customToDraft}
                      onChange={(event) => setCustomToDraft(event.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        background: 'var(--surface)',
                      }}
                    >
                      <option value="">Fin</option>
                      {periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowCustomModal(false)}
                    style={{
                      padding: '9px 20px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--text-md)',
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (customFromDraft && customToDraft) {
                        setCustomRange(customFromDraft, customToDraft);
                        setShowCustomModal(false);
                      }
                    }}
                    disabled={!customFromDraft || !customToDraft}
                    style={{
                      padding: '9px 20px',
                      background: customFromDraft && customToDraft ? 'var(--terra)' : 'var(--text-lo)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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
