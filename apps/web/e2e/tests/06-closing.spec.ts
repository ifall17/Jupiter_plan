import { test, expect } from '../fixtures/auth.fixture';
import { DashboardPage } from '../pages/DashboardPage';
import { TransactionsPage } from '../pages/TransactionsPage';

test.describe('Cloture de Periode', () => {
  test('cloture bloquee si transactions non validees', async ({ fpaPage }) => {
    const dashboardPage = new DashboardPage(fpaPage);
    await dashboardPage.goto();

    await dashboardPage.closePeriodButton.click();

    const error = fpaPage.getByText('Transactions non validees');
    if (await error.isVisible()) {
      await expect(fpaPage.getByTestId('pending-tx-count')).toBeVisible();
      await expect(fpaPage.getByRole('button', { name: 'Confirmer la cloture' })).toBeDisabled();
    }
  });

  test('workflow complet de cloture', async ({ fpaPage }) => {
    const transactionsPage = new TransactionsPage(fpaPage);
    const dashboardPage = new DashboardPage(fpaPage);

    await transactionsPage.goto();

    const pending = await transactionsPage.txCheckboxes().count();
    if (pending > 0) {
      await transactionsPage.selectAllCheckbox().check();
      await transactionsPage.validateSelected();
    }

    await dashboardPage.goto();
    await dashboardPage.startClosing();

    await expect(dashboardPage.closingProgress()).toBeVisible({ timeout: 5000 });
    await expect(fpaPage.getByText('Periode cloturee')).toBeVisible({ timeout: 30000 });
    await expect(dashboardPage.currentPeriodStatus()).toHaveText('OUVERTE');
  });

  test('periode CLOSED non cloturable a nouveau', async ({ fpaPage }) => {
    const dashboardPage = new DashboardPage(fpaPage);
    await dashboardPage.goto();
    await expect(dashboardPage.closePeriodButton).not.toBeVisible();
  });

  test('LECTEUR ne voit pas action de cloture', async ({ lecteurPage }) => {
    const dashboardPage = new DashboardPage(lecteurPage);
    await dashboardPage.goto();
    await expect(dashboardPage.closePeriodButton).not.toBeVisible();
  });
});
