export class CashFlowResponseDto {
  id!: string;
  period_id!: string;
  week_number!: number;
  planned_date!: Date | null;
  flow_type!:
    | 'ENCAISSEMENT_CLIENT'
    | 'DECAISSEMENT_FOURNISSEUR'
    | 'SALAIRES'
    | 'IMPOTS_TAXES'
    | 'INVESTISSEMENT'
    | 'FINANCEMENT'
    | 'AUTRE_ENTREE'
    | 'AUTRE_SORTIE'
    | 'LEGACY';
  direction!: 'IN' | 'OUT';
  amount!: string;
  bank_account_id!: string | null;
  notes!: string | null;
  label!: string;
  inflow!: string;
  outflow!: string;
  balance!: string;
  runway_weeks!: number | null;
  created_at!: Date;
}
