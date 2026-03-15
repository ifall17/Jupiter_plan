import { Locator, Page } from '@playwright/test';

export class ScenariosPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/scenarios');
  }

  async createScenario(input: {
    baseBudget: string;
    name: string;
    type: string;
  }): Promise<void> {
    await this.page.getByRole('button', { name: 'Nouveau scenario' }).click();
    await this.page.getByLabel('Budget de base').click();
    await this.page.getByRole('option', { name: input.baseBudget }).click();
    await this.page.getByLabel('Nom du scenario').fill(input.name);
    await this.page.getByLabel('Type').selectOption(input.type);
    await this.page.getByRole('button', { name: 'Creer' }).click();
  }

  async setHypotheses(values: { revenueGrowth: string; costReduction: string }): Promise<void> {
    await this.page.getByTestId('hypothesis-revenue_growth').fill(values.revenueGrowth);
    await this.page.getByTestId('hypothesis-cost_reduction').fill(values.costReduction);
  }

  async runCalculation(): Promise<void> {
    await this.page.getByRole('button', { name: 'Calculer' }).click();
  }

  scenarioCheckboxes(): Locator {
    return this.page.getByTestId('scenario-checkbox');
  }

  comparisonColumns(): Locator {
    return this.page.getByTestId('comparison-column');
  }

  scenarioCards(): Locator {
    return this.page.getByTestId('scenario-card');
  }

  hypothesesPanel(): Locator {
    return this.page.getByTestId('scenario-hypotheses');
  }

  snapshotRevenue(): Locator {
    return this.page.getByTestId('snapshot-revenue');
  }

  snapshotEbitda(): Locator {
    return this.page.getByTestId('snapshot-ebitda');
  }

  async clickCompare(): Promise<void> {
    await this.page.getByRole('button', { name: 'Comparer' }).click();
  }
}
