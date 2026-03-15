import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('Dashboard et KPIs', () => {
  test('FPA dashboard affiche tous les KPIs', async ({ fpaPage }) => {
    const dashboardPage = new DashboardPage(fpaPage);
    await dashboardPage.goto();

    await expect(dashboardPage.kpi('CA')).toBeVisible();
    await expect(dashboardPage.kpi('EBITDA')).toBeVisible();
    await expect(dashboardPage.kpi('MARGE')).toBeVisible();
    await expect(dashboardPage.kpi('RUNWAY')).toBeVisible();
  });

  test('montants KPI formates en FCFA', async ({ fpaPage }) => {
    const dashboardPage = new DashboardPage(fpaPage);
    await dashboardPage.goto();

    const values = await dashboardPage.allKpiValues().all();
    for (const value of values) {
      const text = (await value.textContent()) ?? '';
      if (text.includes('FCFA')) {
        expect(text).toMatch(/[\d\s]+ FCFA/);
        expect(text).not.toContain('e+');
      }
    }
  });

  test('selecteur periode met a jour les donnees', async ({ fpaPage }) => {
    const dashboardPage = new DashboardPage(fpaPage);
    await dashboardPage.goto();
    await dashboardPage.selectPeriod('Janvier 2026');
    await expect(dashboardPage.currentPeriodLabel()).toHaveText('Janvier 2026');
  });

  test('alerte CRITICAL visible via cloche', async ({ fpaPage }) => {
    const dashboardPage = new DashboardPage(fpaPage);
    await dashboardPage.goto();

    const count = Number.parseInt((await dashboardPage.alertBadge.textContent()) ?? '0', 10);
    if (count > 0) {
      await dashboardPage.openAlerts();
      await expect(dashboardPage.alertItems().first()).toBeVisible();
    }
  });

  test('LECTEUR voit dashboard en lecture seule', async ({ lecteurPage }) => {
    const dashboardPage = new DashboardPage(lecteurPage);
    await dashboardPage.goto();

    await expect(dashboardPage.kpi('CA')).toBeVisible();
    await expect(dashboardPage.closePeriodButton).not.toBeVisible();
    await expect(lecteurPage.getByRole('button', { name: 'Nouveau budget' })).not.toBeVisible();
  });

  test('CONTRIBUTEUR redirige depuis dashboard', async ({ contribPage }) => {
    const dashboardPage = new DashboardPage(contribPage);
    await dashboardPage.goto();
    await expect(contribPage).toHaveURL(/\/budget$/);
  });

  test('dashboard lisible en mobile 375px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await loginPage.login('fpa@test.sn', 'TestPassword123!');
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(dashboardPage.kpi('CA')).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() =>
      document.body.scrollWidth > document.body.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);

    await context.close();
  });
});
