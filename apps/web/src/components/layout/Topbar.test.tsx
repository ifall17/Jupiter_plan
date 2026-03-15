import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { UserRole } from '@web/shared/enums';
import Topbar from './Topbar';
import { createTestQueryClient } from '../../test/test-utils';
import { useAuthStore } from '../../stores/auth.store';
import { useOrgStore } from '../../stores/org.store';

const logoutMutateMock = vi.fn();

vi.mock('../../hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useAuth')>();
  return {
    ...actual,
    useLogout: () => ({
      mutate: logoutMutateMock,
      isPending: false,
    }),
  };
});

describe('Topbar', () => {
  it('renders org, user and unread alert count from API', async () => {
    useAuthStore.getState().setTokens('a', 'r');
    useAuthStore.getState().setUser({
      id: 'u1',
      email: 'user@example.com',
      role: UserRole.FPA,
      org_id: 'org-1',
      first_name: 'Test',
      last_name: 'User',
    });

    useOrgStore.getState().setOrg({
      orgName: 'Jupiter Demo Org',
      currentPeriod: 'period-2',
      fiscalYearId: 'fy-2025',
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Topbar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Jupiter Demo Org')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('opens alerts panel and logout button triggers mutation', async () => {
    const user = userEvent.setup();

    useAuthStore.getState().setTokens('a', 'r');
    useAuthStore.getState().setUser({
      id: 'u2',
      email: 'user2@example.com',
      role: UserRole.FPA,
      org_id: 'org-1',
      first_name: 'Second',
      last_name: 'User',
    });

    useOrgStore.getState().setOrg({
      orgName: 'Jupiter Demo Org',
      currentPeriod: 'period-2',
      fiscalYearId: 'fy-2025',
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Topbar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText('Budget threshold reached')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /deconnexion/i }));
    expect(logoutMutateMock).toHaveBeenCalledTimes(1);
  });
});
