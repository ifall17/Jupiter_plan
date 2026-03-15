import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { users } from '../fixtures/data.fixture';

test.describe('Authentification', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('connexion reussie redirect dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login(users.fpa.email, users.fpa.password);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('badge role FPA visible dans la topbar', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);
    await loginPage.login(users.fpa.email, users.fpa.password);
    await expect(dashboardPage.roleBadge).toHaveText('FPA');
  });

  test('message erreur credentials invalides', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login(users.fpa.email, 'MauvaisMotDePasse!');
    await expect(loginPage.errorMessage).toContainText('Email ou mot de passe incorrect');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('bouton desactive pendant chargement', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.fillEmail(users.fpa.email);
    await loginPage.fillPassword(users.fpa.password);

    await page.route('**/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await loginPage.submit();
    await expect(loginPage.submitButton).toBeDisabled();
  });

  test('tokens jamais dans localStorage apres connexion [SBD-04]', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login(users.fpa.email, users.fpa.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await loginPage.assertNoSensitiveLocalStorage();
  });

  test('session perdue apres fermeture onglet', async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const loginPage = new LoginPage(page1);
    await loginPage.login(users.fpa.email, users.fpa.password);
    await expect(page1).toHaveURL(/\/dashboard$/);
    await context1.close();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/dashboard');
    await expect(page2).toHaveURL(/\/login$/);
    await context2.close();
  });

  test('deconnexion redirect login et bloque retour dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login(users.fpa.email, users.fpa.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Deconnexion' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('acces direct dashboard sans auth redirect login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('page introuvable sans fuite technique [SBD-13]', async ({ page }) => {
    await page.goto('/page-qui-nexiste-pas');
    await expect(page.getByText('Page introuvable')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('at Object.');
    expect(html).not.toContain('Cannot GET');
  });
});
