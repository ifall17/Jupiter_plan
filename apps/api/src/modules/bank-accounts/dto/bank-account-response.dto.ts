import { AccountType } from '@prisma/client';

export class BankAccountResponseDto {
  id!: string;
  name!: string;
  bank_name!: string | null;
  account_name!: string | null;
  account_number!: string | null;
  account_type!: AccountType;
  balance!: string;
  current_balance!: string;
  currency!: string;
  is_active!: boolean;
}
