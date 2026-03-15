import { UserRole } from '@web/shared/enums';
import { useAuthStore } from './auth.store';

describe('auth.store', () => {
  it('sets tokens and user, then supports role checks', () => {
    const store = useAuthStore.getState();

    store.setTokens('a-token', 'r-token');
    store.setUser({
      id: 'u1',
      email: 'user@example.com',
      role: UserRole.CONTRIBUTEUR,
      org_id: 'org-1',
      first_name: 'Contrib',
      last_name: 'User',
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().hasRole([UserRole.CONTRIBUTEUR])).toBe(true);
    expect(useAuthStore.getState().hasRole([UserRole.SUPER_ADMIN])).toBe(false);
  });

  it('logout clears auth state and session storage key', () => {
    useAuthStore.getState().setTokens('a-token', 'r-token');
    useAuthStore.getState().setUser({
      id: 'u2',
      email: 'user2@example.com',
      role: UserRole.FPA,
      org_id: 'org-2',
      first_name: 'Fpa',
      last_name: 'User',
    });

    try {
      useAuthStore.getState().logout();
    } catch {
      // jsdom does not implement full navigation, but state must still be cleared.
    }

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(sessionStorage.getItem('jupiter_auth_profile')).toBeNull();
  });

  it('persist payload excludes access and refresh tokens', () => {
    useAuthStore.getState().setTokens('sensitive-access', 'sensitive-refresh');
    useAuthStore.getState().setUser({
      id: 'u3',
      email: 'secure@example.com',
      role: UserRole.LECTEUR,
      org_id: 'org-3',
      first_name: 'Read',
      last_name: 'Only',
    });

    const persisted = sessionStorage.getItem('jupiter_auth_profile') ?? '';
    expect(persisted).toContain('secure@example.com');
    expect(persisted).not.toContain('sensitive-access');
    expect(persisted).not.toContain('sensitive-refresh');
    expect(localStorage.length).toBe(0);
  });
});
