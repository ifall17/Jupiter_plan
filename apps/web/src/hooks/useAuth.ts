import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient, { getApiErrorCode, unwrapApiData } from '../api/client';
import { useAuthStore } from '../stores/auth.store';
import { useOrgStore } from '../stores/org.store';
import { ERROR_MESSAGES } from '../types';

type LoginPayload = {
  email: string;
  password: string;
};

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: import('@web/shared/enums').UserRole;
    org_id: string;
    first_name: string;
    last_name: string;
  };
};

type MeResponse = {
  id: string;
  email: string;
  role: import('@web/shared/enums').UserRole;
  org_id: string;
  first_name: string;
  last_name: string;
  last_login_at: string | null;
};

type CurrentOrgResponse = {
  id: string;
  name: string;
  currency: string;
  current_period_id: string | null;
  current_period_label: string | null;
  fiscal_year_id: string | null;
  fiscal_year_label: string | null;
};

function mapAuthError(error: unknown): string {
  const code = getApiErrorCode(error);

  if (code === 'AUTH_001') {
    return 'Email ou mot de passe incorrect';
  }

  if (code === 'AUTH_002') {
    return 'Compte bloque. Contactez votre administrateur';
  }

  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  return 'Erreur serveur inattendue';
}

export function useLogin() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);
  const setOrg = useOrgStore((state) => state.setOrg);

  return useMutation({
    mutationFn: async (payload: LoginPayload): Promise<LoginResponse> => {
      const response = await apiClient.post<LoginResponse>('/auth/login', payload);
      return unwrapApiData(response);
    },
    onSuccess: async (data: LoginResponse) => {
      setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      setOrg({ orgId: data.user.org_id });

      try {
        const orgResponse = await apiClient.get<CurrentOrgResponse>('/organizations/current');
        const org = unwrapApiData(orgResponse);
        setOrg({
          orgId: org.id,
          orgName: org.name,
          currency: org.currency,
          currentPeriod: org.current_period_id,
          currentPeriodLabel: org.current_period_label,
          fiscalYearId: org.fiscal_year_id,
          fiscalYearLabel: org.fiscal_year_label,
        });
      } catch {
        // Keep login usable even if the organization endpoint is not available yet.
      }

      navigate('/dashboard');
    },
    onError: (error: unknown) => {
      const message = mapAuthError(error);
      window.dispatchEvent(new CustomEvent('app:error', { detail: message }));
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const resetOrg = useOrgStore((state) => state.reset);

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await apiClient.post('/auth/logout');
    },
    onSettled: () => {
      resetOrg();
      logout();
      navigate('/login');
    },
  });
}

export function useMe() {
  const orgId = useOrgStore((state) => state.orgId);

  return useQuery({
    queryKey: ['me', orgId],
    queryFn: async (): Promise<MeResponse> => {
      const response = await apiClient.get<MeResponse>('/auth/me');
      return unwrapApiData(response);
    },
    staleTime: 10 * 60 * 1000,
  });
}
