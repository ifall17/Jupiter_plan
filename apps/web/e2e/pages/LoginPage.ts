import { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Mot de passe');
    this.submitButton = page.getByRole('button', { name: 'Se connecter' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async fillEmail(value: string): Promise<void> {
    await this.emailInput.fill(value);
  }

  async fillPassword(value: string): Promise<void> {
    await this.passwordInput.fill(value);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async login(email: string, password: string): Promise<void> {
    await this.goto();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  async assertNoSensitiveLocalStorage(): Promise<void> {
    const keys = await this.page.evaluate(() => Object.keys(localStorage));
    const forbidden = keys.filter((k) => /token|auth|jwt|user/i.test(k));
    if (forbidden.length > 0) {
      throw new Error('[SBD-04] Sensitive data found in localStorage: ' + forbidden.join(','));
    }
  }
}
