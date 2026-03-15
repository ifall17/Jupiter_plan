import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { UserRole } from '@web/shared/enums';
import { useAuthStore } from './stores/auth.store';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import NotFound from './components/layout/NotFound';
import SplashScreen from './components/layout/SplashScreen';
import LoginPage from './features/LoginPage';
import DashboardPage from './features/dashboard/DashboardPage';
import BudgetPage from './features/budget/BudgetPage';
import BudgetDetailPage from './features/budget/BudgetDetailPage';
import TransactionsPage from './features/transactions/TransactionsPage';
import ScenariosPage from './features/scenarios/ScenariosPage';
import ScenarioDetailPage from './features/scenarios/ScenarioDetailPage';
import CashFlowPage from './features/cashflow/CashFlowPage';
import KpisPage from './features/kpis/KpisPage';
import AlertsPage from './features/alerts/AlertsPage';
import ReportsPage from './features/reports/ReportsPage';
import SettingsPage from './features/settings/SettingsPage';
import UsersPage from './features/users/UsersPage';

export default function App(): JSX.Element {
  const { tryRefresh } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    tryRefresh().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return <SplashScreen />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route
          path="dashboard"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="budget"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR]}>
              <BudgetPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="budget/:id"
          element={
            <ProtectedRoute
              allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR]}
            >
              <BudgetDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="transactions"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR]}>
              <TransactionsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="scenarios"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR]}>
              <ScenariosPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="scenarios/:id"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR]}>
              <ScenarioDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="cashflow"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA]}>
              <CashFlowPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="kpis"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR]}>
              <KpisPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="alerts"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR]}>
              <AlertsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR]}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="settings"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
              <UsersPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
