import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mocks/server';
import { useAuthStore } from '../stores/auth.store';
import { useOrgStore } from '../stores/org.store';

beforeAll(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3001/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();

  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });

  useOrgStore.setState({
    orgId: null,
    orgName: null,
    currency: 'XOF',
    currentPeriod: null,
    fiscalYearId: null,
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});
