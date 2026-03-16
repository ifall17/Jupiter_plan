import { IsDateString, IsDecimal, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CashFlowDirection, CashFlowType } from '@prisma/client';

export class CreateCashFlowEntryDto {
  @IsIn([
    'ENCAISSEMENT_CLIENT',
    'DECAISSEMENT_FOURNISSEUR',
    'SALAIRES',
    'IMPOTS_TAXES',
    'INVESTISSEMENT',
    'FINANCEMENT',
    'AUTRE_ENTREE',
    'AUTRE_SORTIE',
  ])
  flow_type!: CashFlowType;

  @IsString()
  @MaxLength(100)
  label!: string;

  @IsDecimal()
  amount!: string;

  @IsDateString()
  planned_date!: string;

  @IsIn(['IN', 'OUT'])
  direction!: CashFlowDirection;

  @IsOptional()
  @IsUUID()
  bank_account_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
