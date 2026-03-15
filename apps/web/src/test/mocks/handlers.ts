import { http, HttpResponse } from 'msw';
import { alertFixtures, authFixtures, dashboardFixtures, orgFixtures, periodFixtures } from './fixtures';

export const handlers = [
  http.post('*/auth/login', async () => HttpResponse.json(authFixtures.loginSuccess)),
  http.post('*/auth/logout', async () => HttpResponse.json({ success: true, data: null, timestamp: new Date().toISOString() })),
  http.get('*/auth/me', async () => HttpResponse.json(authFixtures.meSuccess)),
  http.get('*/dashboard', async () => HttpResponse.json(dashboardFixtures.current)),
  http.get('*/organizations/current', async () => HttpResponse.json(orgFixtures.current)),
  http.get('*/periods', async () => HttpResponse.json(periodFixtures.open)),
  http.get('*/alerts', async () => HttpResponse.json(alertFixtures.unread)),
];
