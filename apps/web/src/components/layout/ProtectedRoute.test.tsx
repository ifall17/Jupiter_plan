import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@web/shared/enums';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../../stores/auth.store';

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to login', () => {
    render(
      <MemoryRouter initialEntries={['/budget']}>
        <Routes>
          <Route
            path="/budget"
            element={
              <ProtectedRoute>
                <div>PrivateBudget</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>LoginView</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('LoginView')).toBeInTheDocument();
  });

  it('shows loading when authenticated but user profile not loaded', () => {
    useAuthStore.setState({ isAuthenticated: true, user: null, accessToken: 'x', refreshToken: 'y' });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>NeverVisible</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    expect(screen.queryByText('NeverVisible')).not.toBeInTheDocument();
  });

  it('blocks unauthorized role and emits app:error', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    useAuthStore.getState().setTokens('a1', 'r1');
    useAuthStore.getState().setUser({
      id: 'u1',
      email: 'reader@example.com',
      role: UserRole.LECTEUR,
      org_id: 'org-1',
      first_name: 'Read',
      last_name: 'Only',
    });

    render(
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
                <div>AdminOnly</div>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<div>DashboardView</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('DashboardView')).toBeInTheDocument();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:error' }));
  });
});
