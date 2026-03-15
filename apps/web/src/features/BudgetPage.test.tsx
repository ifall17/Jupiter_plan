import { Outlet } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { UserRole } from '@web/shared/enums';
import App from '../App';
import { renderWithProviders } from '../test/test-utils';
import { useAuthStore } from '../stores/auth.store';

vi.mock('../components/layout/AppLayout', () => ({
  default: () => (
    <div data-testid="app-layout">
      layout
      <Outlet />
    </div>
  ),
}));

describe('BudgetPage route', () => {
  it('renders budget page for allowed role', () => {
    useAuthStore.getState().setTokens('access', 'refresh');
    useAuthStore.getState().setUser({
      id: 'u1',
      email: 'fpa@example.com',
      role: UserRole.FPA,
      org_id: 'org-1',
      first_name: 'Fpa',
      last_name: 'User',
    });

    renderWithProviders(<App />, { route: '/budget' });

    expect(screen.getByText('BudgetPage')).toBeInTheDocument();
  });

  it('redirects to dashboard for disallowed role', async () => {
    useAuthStore.getState().setTokens('access', 'refresh');
    useAuthStore.getState().setUser({
      id: 'u2',
      email: 'reader@example.com',
      role: UserRole.LECTEUR,
      org_id: 'org-1',
      first_name: 'Read',
      last_name: 'Only',
    });

    renderWithProviders(<App />, { route: '/budget' });

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
  });
});
