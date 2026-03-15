import { Locator, Page } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly roleBadge: Locator;
  readonly alertBell: Locator;
  readonly alertBadge: Locator;
  readonly periodSelector: Locator;
  readonly closePeriodButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.roleBadge = page.getByTestId('role-badge');
    this.alertBell = page.getByTestId('alert-bell');
    this.alertBadge = page.getByTestId('alert-badge');
    this.periodSelector = page.getByTestId('period-selector');
    this.closePeriodButton = page.getByRole('button', { name: 'Cloturer la periode' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  kpi(code: string): Locator {
    return this.page.getByTestId(`kpi-${code}`);
  }

  allKpiValues(): Locator {
    return this.page.getByTestId('kpi-value');
  }

  currentPeriodLabel(): Locator {
    return this.page.getByTestId('current-period-label');
  }

  alertItems(): Locator {
    return this.page.getByTestId('alert-item');
  }

  async selectPeriod(periodLabel: string): Promise<void> {
    await this.periodSelector.click();
    await this.page.getByRole('option', { name: periodLabel }).click();
    await this.page.waitForResponse((r) => r.url().includes('/dashboard') && r.status() === 200);
  }

  async openAlerts(): Promise<void> {
    await this.alertBell.click();
  }

  async startClosing(): Promise<void> {
    await this.closePeriodButton.click();
    await this.page.getByRole('button', { name: 'Confirmer la cloture' }).click();
  }

  closingProgress(): Locator {
    return this.page.getByTestId('closing-progress');
  }

  currentPeriodStatus(): Locator {
    return this.page.getByTestId('current-period-status');
  }
}
