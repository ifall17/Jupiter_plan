export class KpiResponseDto {
  id!: string;
  code!: string;
  label!: string;
  formula!: string;
  unit!: string;
  category!: string | null;
  description!: string | null;
  threshold_warn!: string | null;
  threshold_critical!: string | null;
  is_active!: boolean;
}
