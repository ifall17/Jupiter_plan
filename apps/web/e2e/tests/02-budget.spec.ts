import { test, expect } from '../fixtures/auth.fixture';
import { BudgetPage } from '../pages/BudgetPage';
import { budgets } from '../fixtures/data.fixture';

test.describe('Workflow Budget', () => {
  test('FPA workflow complet DRAFT vers LOCKED', async ({ fpaPage }) => {
    const budgetPage = new BudgetPage(fpaPage);
    await budgetPage.goto();

    await budgetPage.createBudget(budgets.fy2026v1.name);
    await expect(budgetPage.status()).toHaveText('BROUILLON');

    await budgetPage.addLine(budgets.fy2026v1.lineRevenue);
    await budgetPage.addLine(budgets.fy2026v1.linePurchases);

    await budgetPage.submitBudget();
    await expect(budgetPage.status()).toHaveText('SOUMIS');

    await budgetPage.approveBudget();
    await expect(budgetPage.status()).toHaveText('APPROUVE');

    await budgetPage.lockBudget();
    await expect(budgetPage.status()).toHaveText('VERROUILLE');

    await expect(budgetPage.addLineButton).not.toBeVisible();
  });

  test('rejet sans commentaire affiche erreur', async ({ fpaPage }) => {
    const budgetPage = new BudgetPage(fpaPage);
    await budgetPage.goto();
    await budgetPage.createBudget('Budget Test Rejet');
    await budgetPage.submitBudget();
    await budgetPage.rejectWithoutComment();
    await expect(fpaPage.getByText('Commentaire obligatoire')).toBeVisible();
  });

  test('LECTEUR ne voit pas nouveau budget', async ({ lecteurPage }) => {
    const budgetPage = new BudgetPage(lecteurPage);
    await budgetPage.goto();
    await expect(budgetPage.newBudgetButton).not.toBeVisible();
  });

  test('CONTRIBUTEUR ne voit que son departement', async ({ contribPage }) => {
    const budgetPage = new BudgetPage(contribPage);
    await budgetPage.goto();

    const rows = await budgetPage.budgetLineRows().all();
    for (const row of rows) {
      await expect(row.getByTestId('line-department')).toHaveText('VENTES');
    }
  });

  test('code comptable invalide affiche erreur SYSCOHADA', async ({ fpaPage }) => {
    const budgetPage = new BudgetPage(fpaPage);
    await budgetPage.goto();
    await budgetPage.createBudget('Budget Test Validation');
    await budgetPage.addLineButton.click();

    await fpaPage.getByLabel('Code comptable').fill('INVALIDE');
    await fpaPage.getByLabel('Code comptable').blur();

    await expect(fpaPage.getByText('Code SYSCOHADA invalide')).toBeVisible();
  });

  test('montants toujours affiches en FCFA formate', async ({ fpaPage }) => {
    const budgetPage = new BudgetPage(fpaPage);
    await budgetPage.goto();

    const amounts = await budgetPage.amountLabels().all();
    for (const amount of amounts) {
      const text = (await amount.textContent()) ?? '';
      expect(text).toMatch(/[\d\s]+ FCFA/);
      expect(text).not.toContain('e+');
    }
  });
});
