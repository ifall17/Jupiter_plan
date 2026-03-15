export class KpiResponseDto {
  id!: string;
  code!: string;
  label!: string;
  formula!: string;
  unit!: string;
  threshold_warn!: string | null;
  threshold_critical!: string | null;
  is_active!: boolean;
}
