import { test, expect } from '../fixtures/auth.fixture';
import { ScenariosPage } from '../pages/ScenariosPage';
import { scenarios } from '../fixtures/data.fixture';

test.describe('Scenarios et Simulation', () => {
  test('FPA cree puis calcule un scenario', async ({ fpaPage }) => {
    const scenariosPage = new ScenariosPage(fpaPage);
    await scenariosPage.goto();

    await scenariosPage.createScenario({
      baseBudget: 'Budget FY2026 V1',
      name: scenarios.optimistic2026.name,
      type: scenarios.optimistic2026.type,
    });

    await scenariosPage.setHypotheses({
      revenueGrowth: scenarios.optimistic2026.revenueGrowth,
      costReduction: scenarios.optimistic2026.costReduction,
    });

    await scenariosPage.runCalculation();

    await expect(fpaPage.getByText('Calcul termine')).toBeVisible({ timeout: 30000 });
    await expect(scenariosPage.snapshotRevenue()).toBeVisible();
    await expect(scenariosPage.snapshotEbitda()).toBeVisible();
  });

  test('comparaison de 4 scenarios maximum', async ({ fpaPage }) => {
    const scenariosPage = new ScenariosPage(fpaPage);
    await scenariosPage.goto();

    const checkboxes = await scenariosPage.scenarioCheckboxes().all();
    for (const cb of checkboxes.slice(0, 4)) {
      await cb.check();
    }

    await scenariosPage.clickCompare();
    await expect(scenariosPage.comparisonColumns()).toHaveCount(4);
  });

  test('5e selection bloquee avec message', async ({ fpaPage }) => {
    const scenariosPage = new ScenariosPage(fpaPage);
    await scenariosPage.goto();

    const checkboxes = await scenariosPage.scenarioCheckboxes().all();
    if (checkboxes.length >= 5) {
      for (const cb of checkboxes.slice(0, 5)) {
        await cb.check();
      }

      await expect(fpaPage.getByText('Maximum 4 scenarios comparables')).toBeVisible();
      await expect(fpaPage.getByRole('button', { name: 'Comparer' })).toBeDisabled();
    }
  });

  test('LECTEUR voit scenarios SAVED sans hypotheses [SBD-05]', async ({ lecteurPage }) => {
    const scenariosPage = new ScenariosPage(lecteurPage);
    await scenariosPage.goto();

    await expect(scenariosPage.scenarioCards().first()).toBeVisible();
    await scenariosPage.scenarioCards().first().click();

    await expect(scenariosPage.snapshotRevenue()).toBeVisible();
    await expect(scenariosPage.hypothesesPanel()).not.toBeVisible();
  });
});
