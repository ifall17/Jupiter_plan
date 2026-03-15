import { UserRole, BudgetStatus, PeriodStatus } from '@web/shared/enums';

export interface ApiError {
  code: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  org_id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  last_login_at: string | null;
}

export interface Period {
  id: string;
  label: string;
  period_number: number;
  status: PeriodStatus;
  start_date: string;
  end_date: string;
}

export type BudgetSummary = {
  id: string;
  name: string;
  status: BudgetStatus;
};

export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
  ACCOUNT_LOCKED: 'Compte bloque. Contactez votre administrateur',
  TOKEN_EXPIRED: 'Session expiree. Reconnectez-vous',
  INSUFFICIENT_PERMISSIONS: 'Action non autorisee pour votre role',
  BUDGET_LOCKED: 'Ce budget est verrouille',
  BUDGET_NOT_SUBMITTABLE: 'Ce budget ne peut pas etre soumis dans son etat actuel',
  PERIOD_ALREADY_CLOSED: 'Cette periode est deja cloturee',
  BALANCE_MISMATCH: 'Bilan desequilibre, cloture impossible',
  IMPORT_ALREADY_PROCESSING: 'Un import est deja en cours',
  CALC_ENGINE_UNAVAILABLE: 'Moteur de calcul indisponible. Reessayez dans quelques instants',
  AUTH_001: 'Email ou mot de passe incorrect',
  AUTH_002: 'Compte bloque. Contactez votre administrateur',
  AUTH_003: 'Session expiree. Reconnectez-vous',
  AUTH_004: 'Action non autorisee pour votre role',
};
