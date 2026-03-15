import { Outlet } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Topbar from './Topbar';
import NavMenu from './NavMenu';
import { useSocket } from '../../hooks/useSocket';
import { useAuthStore } from '../../stores/auth.store';
import { useOrgStore } from '../../stores/org.store';
import { useMe } from '../../hooks/useAuth';
import apiClient, { unwrapApiData } from '../../api/client';

type OrgInfo = {
  id: string;
  name: string;
  currency: string;
  current_period_id: string | null;
  fiscal_year_id: string | null;
};

export default function AppLayout(): JSX.Element {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const setOrg = useOrgStore((state) => state.setOrg);
  const [toast, setToast] = useState<{ message: string; severity: 'INFO' | 'WARN' | 'CRITICAL' } | null>(null);

  const meQuery = useMe();

  useEffect(() => {
    if (!meQuery.data) {
      return;
    }

    setUser({
      id: meQuery.data.id,
      email: meQuery.data.email,
      role: meQuery.data.role,
      org_id: meQuery.data.org_id,
      first_name: meQuery.data.first_name,
      last_name: meQuery.data.last_name,
    });
    setOrg({ orgId: meQuery.data.org_id });
  }, [meQuery.data, setOrg, setUser]);

  const orgQuery = useQuery({
    queryKey: ['org', user?.org_id],
    enabled: Boolean(user?.org_id),
    queryFn: () =>
      apiClient.get<OrgInfo>('/organizations/current').then(unwrapApiData),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!orgQuery.data) return;
    setOrg({
      orgId: orgQuery.data.id,
      orgName: orgQuery.data.name,
      currency: orgQuery.data.currency,
      currentPeriod: orgQuery.data.current_period_id,
      fiscalYearId: orgQuery.data.fiscal_year_id,
    });
  }, [orgQuery.data, setOrg]);

  const handlers = useMemo(
    () => ({
      onPeriodClosed: () => {
        void queryClient.invalidateQueries();
      },
      onAlertTriggered: (payload: { severity: 'INFO' | 'WARN' | 'CRITICAL'; message: string }) => {
        setToast({ message: payload.message, severity: payload.severity });
      },
    }),
    [queryClient],
  );

  useSocket(handlers);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="min-h-screen" style={{ background: '#faf8f4' }}>
      <Topbar />
      <NavMenu />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
      {toast ? (
        <div
          className="fixed right-6 bottom-6 px-4 py-3 rounded-md shadow"
          style={{
            background: toast.severity === 'CRITICAL' ? '#c0303f' : toast.severity === 'WARN' ? '#b8963e' : '#3d5a99',
            color: '#fff',
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
