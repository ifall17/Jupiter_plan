import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { UserRole } from '@web/shared/enums';
import { useLogin, useLogout } from './useAuth';
import { createTestQueryClient } from '../test/test-utils';
import { useAuthStore } from '../stores/auth.store';
import { useOrgStore } from '../stores/org.store';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function LoginHarness(): JSX.Element {
  const login = useLogin();

  return (
    <button
      onClick={() =>
        login.mutate({
          email: 'user@example.com',
          password: 'password-strong',
        })
      }
    >
      login
    </button>
  );
}

function LogoutHarness(): JSX.Element {
  const logout = useLogout();

  return <button onClick={() => logout.mutate()}>logout</button>;
}

describe('useAuth hooks', () => {
  it('logs in and hydrates auth + org stores', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LoginHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.email).toBe('user@example.com');
      expect(useOrgStore.getState().orgId).toBe('org-1');
      expect(navigateMock).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('maps AUTH_001 to user-facing event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { server } = await import('../test/mocks/server');
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.post('*/auth/login', async () => HttpResponse.json({ code: 'AUTH_001' }, { status: 401 })),
    );

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LoginHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app:error' }),
      );
    });
  });

  it('logout clears state and redirects to login', async () => {
    useAuthStore.getState().setTokens('access-x', 'refresh-y');
    useAuthStore.getState().setUser({
      id: 'u1',
      email: 'logout@example.com',
      role: UserRole.FPA,
      org_id: 'org-1',
      first_name: 'Log',
      last_name: 'Out',
    });
    useOrgStore.getState().setOrg({ orgId: 'org-1', orgName: 'Org' });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <LogoutHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useOrgStore.getState().orgId).toBeNull();
      expect(navigateMock).toHaveBeenCalledWith('/login');
    });
  });

  it('never persists token in sessionStorage payload', () => {
    const auth = useAuthStore.getState();
    auth.setTokens('access-token-sensitive', 'refresh-token-sensitive');
    auth.setUser({
      id: 'u2',
      email: 'secure@example.com',
      role: UserRole.FPA,
      org_id: 'org-1',
      first_name: 'Secure',
      last_name: 'User',
    });

    const persisted = sessionStorage.getItem('jupiter_auth_profile') ?? '';
    expect(persisted).toContain('secure@example.com');
    expect(persisted).not.toContain('access-token-sensitive');
    expect(persisted).not.toContain('refresh-token-sensitive');
    expect(localStorage.length).toBe(0);
  });
});
