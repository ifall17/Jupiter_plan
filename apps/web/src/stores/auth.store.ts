import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import axios from 'axios';
import { UserRole } from '@web/shared/enums';

type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  org_id: string;
  first_name: string;
  last_name: string;
};

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
  tryRefresh: () => Promise<boolean>;
}

const baseState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isHydrated: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...baseState,
      setTokens: (access: string, refresh: string) => {
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
      },
      setUser: (user: AuthUser | null) => {
        set({ user, isAuthenticated: Boolean(user ?? get().accessToken) });
      },
      logout: () => {
        set({ ...baseState });
        sessionStorage.removeItem('jupiter_auth_profile');
        window.location.assign('/login');
      },
      hasRole: (roles: UserRole[]) => {
        const role = get().user?.role;
        if (!role) {
          return false;
        }
        return roles.includes(role);
      },
      tryRefresh: async () => {
        try {
          const response = await axios.post<{
            success: boolean;
            data: { access_token: string; refresh_token: string; user?: AuthUser };
          }>(
            '/api/v1/auth/refresh',
            {},
            { withCredentials: true },
          );
          const { access_token, refresh_token, user } = response.data.data;
          set({
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isHydrated: true,
            ...(user ? { user } : {}),
          });
          return true;
        } catch {
          set({ ...baseState, isHydrated: true });
          return false;
        }
      },
    }),
    {
      name: 'jupiter_auth_profile',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ user: state.user }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<AuthState>) };
        merged.accessToken = null;
        merged.refreshToken = null;
        merged.isAuthenticated = false;
        return merged;
      },
    },
  ),
);
