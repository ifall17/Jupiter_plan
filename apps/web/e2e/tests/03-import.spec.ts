import { test, expect } from '../fixtures/auth.fixture';
import ExcelJS from 'exceljs';
import { TransactionsPage } from '../pages/TransactionsPage';

async function generateTestExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['account_code', 'account_label', 'department', 'amount']);
  sheet.addRow(['701000', 'Ventes janvier', 'VENTES', 5000000]);
  sheet.addRow(['601000', 'Achats janvier', 'ACHATS', 2000000]);
  sheet.addRow(['621000', 'Personnel', 'RH', 1500000]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

test.describe('Import Transactions Excel', () => {
  test('FPA import excel complet avec preview et confirmation', async ({ fpaPage }) => {
    const transactionsPage = new TransactionsPage(fpaPage);
    await transactionsPage.goto();
    await transactionsPage.openImportDialog();

    const excelBuffer = await generateTestExcel();
    await transactionsPage.uploadExcel({
      name: 'import_janvier.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: excelBuffer,
    });

    await expect(transactionsPage.preview()).toBeVisible();
    await expect(transactionsPage.previewRows()).toHaveCount(3);

    await transactionsPage.confirmImport();

    await expect(transactionsPage.progress()).toBeVisible({ timeout: 5000 });
    await expect(fpaPage.getByText('Import termine')).toBeVisible({ timeout: 30000 });
    await expect(transactionsPage.rowsInserted()).toHaveText('3');
    await expect(transactionsPage.rowsSkipped()).toHaveText('0');
  });

  test('fichier PDF rejete avec message clair', async ({ fpaPage }) => {
    const transactionsPage = new TransactionsPage(fpaPage);
    await transactionsPage.goto();
    await transactionsPage.openImportDialog();

    await transactionsPage.uploadExcel({
      name: 'document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake pdf content'),
    });

    await expect(fpaPage.getByText('Format non reconnu')).toBeVisible();
    await expect(transactionsPage.confirmImportButton).not.toBeVisible();
  });

  test('notification Socket.io visible pendant import', async ({ fpaPage }) => {
    const transactionsPage = new TransactionsPage(fpaPage);
    await transactionsPage.goto();
    await transactionsPage.openImportDialog();

    const excelBuffer = await generateTestExcel();
    await transactionsPage.uploadExcel({
      name: 'import.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: excelBuffer,
    });

    await transactionsPage.confirmImport();

    await expect(transactionsPage.progressBar()).toBeVisible({ timeout: 5000 });
    await expect(fpaPage.getByText('Import termine')).toBeVisible({ timeout: 30000 });
  });

  test('CONTRIBUTEUR importe uniquement son departement', async ({ contribPage }) => {
    const transactionsPage = new TransactionsPage(contribPage);
    await transactionsPage.goto();

    await expect(transactionsPage.departmentSelector()).toHaveValue('VENTES');
    await expect(transactionsPage.departmentSelector()).toBeDisabled();
  });
});
