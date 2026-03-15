import { LineType } from '@prisma/client';

export class TransactionResponseDto {
  id!: string;
  period_id!: string;
  transaction_date!: Date;
  account_code!: string;
  label!: string;
  department!: string;
  line_type!: LineType;
  amount!: string;
  is_validated!: boolean;
  created_at!: Date;
}
