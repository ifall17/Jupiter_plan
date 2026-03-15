import { AccountType } from '@prisma/client';

export class BankAccountResponseDto {
  id!: string;
  name!: string;
  account_type!: AccountType;
  balance!: string;
  currency!: string;
  is_active!: boolean;
}
