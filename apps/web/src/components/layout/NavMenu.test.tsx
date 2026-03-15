import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UserRole } from '@web/shared/enums';
import NavMenu from './NavMenu';
import { useAuthStore } from '../../stores/auth.store';

describe('NavMenu', () => {
  it('shows role-allowed links only', () => {
    useAuthStore.getState().setTokens('a', 'r');
    useAuthStore.getState().setUser({
      id: 'fpa-1',
      email: 'fpa@example.com',
      role: UserRole.FPA,
      org_id: 'org-1',
      first_name: 'Role',
      last_name: 'Fpa',
    });

    render(
      <MemoryRouter>
        <NavMenu />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
    expect(screen.queryByText('Parametres')).not.toBeInTheDocument();
  });

  it('opens mobile menu and closes when selecting item', async () => {
    const user = userEvent.setup();

    useAuthStore.getState().setTokens('a', 'r');
    useAuthStore.getState().setUser({
      id: 'admin-1',
      email: 'admin@example.com',
      role: UserRole.SUPER_ADMIN,
      org_id: 'org-1',
      first_name: 'Super',
      last_name: 'Admin',
    });

    render(
      <MemoryRouter>
        <NavMenu />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /menu/i }));
    const usersLink = screen.getAllByText('Utilisateurs')[0];
    expect(usersLink).toBeInTheDocument();

    await user.click(usersLink);
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
  });
});
