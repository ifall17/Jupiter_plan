import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { UserRole } from '@web/shared/enums';
import { useAuthStore } from '../../stores/auth.store';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children: ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps): JSX.Element {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const hasRole = useAuthStore((state) => state.hasRole);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAuthenticated && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center jp-bg">
        <div className="text-sm jp-muted-text">
          Chargement...
        </div>
      </div>
    );
  }

  if (allowedRoles && allowedRoles.length > 0) {
    try {
      const allowed = hasRole(allowedRoles);
      if (!allowed) {
        window.dispatchEvent(new CustomEvent('app:error', { detail: "Vous n'avez pas acces a cette page" }));
        return <Navigate to="/dashboard" replace />;
      }
    } catch {
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
}
