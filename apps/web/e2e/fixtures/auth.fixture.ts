import { test as base, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { users } from './data.fixture';

type AuthFixtures = {
  fpaPage: Page;
  adminPage: Page;
  contribPage: Page;
  lecteurPage: Page;
};

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.login(email, password);
  await page.waitForURL('**/dashboard');
  await loginPage.assertNoSensitiveLocalStorage();
}

export const test = base.extend<AuthFixtures>({
  fpaPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, users.fpa.email, users.fpa.password);
    await use(page);
    await context.close();
  },
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, users.admin.email, users.admin.password);
    await use(page);
    await context.close();
  },
  contribPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, users.contributeur.email, users.contributeur.password);
    await use(page);
    await context.close();
  },
  lecteurPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, users.lecteur.email, users.lecteur.password);
    await use(page);
    await context.close();
  },
});

export { expect };
