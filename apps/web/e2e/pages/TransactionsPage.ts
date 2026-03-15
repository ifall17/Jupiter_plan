import { Locator, Page } from '@playwright/test';

export class TransactionsPage {
  readonly page: Page;
  readonly importButton: Locator;
  readonly fileInput: Locator;
  readonly confirmImportButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.importButton = page.getByRole('button', { name: 'Importer' });
    this.fileInput = page.getByLabel('Fichier Excel');
    this.confirmImportButton = page.getByRole('button', { name: "Confirmer l'import" });
  }

  async goto(): Promise<void> {
    await this.page.goto('/transactions');
  }

  async openImportDialog(): Promise<void> {
    await this.importButton.click();
  }

  async uploadExcel(file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.fileInput.setInputFiles(file);
  }

  async confirmImport(): Promise<void> {
    await this.confirmImportButton.click();
  }

  progress(): Locator {
    return this.page.getByTestId('import-progress');
  }

  preview(): Locator {
    return this.page.getByTestId('import-preview');
  }

  previewRows(): Locator {
    return this.page.getByTestId('preview-row');
  }

  rowsInserted(): Locator {
    return this.page.getByTestId('rows-inserted');
  }

  rowsSkipped(): Locator {
    return this.page.getByTestId('rows-skipped');
  }

  progressBar(): Locator {
    return this.page.getByRole('progressbar');
  }

  departmentSelector(): Locator {
    return this.page.getByLabel('Departement');
  }

  selectAllCheckbox(): Locator {
    return this.page.getByTestId('select-all');
  }

  txCheckboxes(): Locator {
    return this.page.getByTestId('tx-checkbox');
  }

  async validateSelected(): Promise<void> {
    await this.page.getByRole('button', { name: 'Valider la selection' }).click();
    await this.page.waitForResponse((r) => r.url().includes('/validate-batch') && r.status() === 200);
  }
}
