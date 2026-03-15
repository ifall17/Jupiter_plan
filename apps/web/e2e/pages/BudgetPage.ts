import { Locator, Page } from '@playwright/test';

export type BudgetLineInput = {
  accountCode: string;
  label: string;
  department: string;
  amount: string;
};

export class BudgetPage {
  readonly page: Page;
  readonly newBudgetButton: Locator;
  readonly budgetNameInput: Locator;
  readonly createButton: Locator;
  readonly addLineButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newBudgetButton = page.getByRole('button', { name: 'Nouveau budget' });
    this.budgetNameInput = page.getByLabel('Nom du budget');
    this.createButton = page.getByRole('button', { name: 'Creer' });
    this.addLineButton = page.getByRole('button', { name: 'Ajouter une ligne' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/budget');
  }

  async createBudget(name: string): Promise<void> {
    await this.newBudgetButton.click();
    await this.budgetNameInput.fill(name);
    await this.createButton.click();
    await this.page.waitForResponse((r) => r.url().includes('/api/v1/budgets') && r.status() === 201);
  }

  async addLine(line: BudgetLineInput): Promise<void> {
    await this.addLineButton.click();
    await this.page.getByLabel('Code comptable').fill(line.accountCode);
    await this.page.getByLabel('Libelle').fill(line.label);
    await this.page.getByLabel('Departement').fill(line.department);
    await this.page.getByLabel('Montant budget').fill(line.amount);
    await this.page.getByRole('button', { name: 'Enregistrer' }).click();
  }

  async submitBudget(): Promise<void> {
    await this.page.getByRole('button', { name: 'Soumettre' }).click();
    await this.page.getByRole('button', { name: 'Confirmer' }).click();
    await this.page.waitForResponse((r) => r.url().includes('/submit') && r.status() === 200);
  }

  async approveBudget(): Promise<void> {
    await this.page.getByRole('button', { name: 'Approuver' }).click();
    await this.page.getByRole('button', { name: 'Confirmer' }).click();
    await this.page.waitForResponse((r) => r.url().includes('/approve') && r.status() === 200);
  }

  async lockBudget(): Promise<void> {
    await this.page.getByRole('button', { name: 'Verrouiller' }).click();
    await this.page.getByRole('button', { name: 'Confirmer' }).click();
    await this.page.waitForResponse((r) => r.url().includes('/lock') && r.status() === 200);
  }

  async rejectWithoutComment(): Promise<void> {
    await this.page.getByRole('button', { name: 'Rejeter' }).click();
    await this.page.getByRole('button', { name: 'Confirmer le rejet' }).click();
  }

  status(): Locator {
    return this.page.getByTestId('budget-status');
  }

  budgetLineRows(): Locator {
    return this.page.getByTestId('budget-line');
  }

  amountLabels(): Locator {
    return this.page.getByTestId('amount-fcfa');
  }
}
