import { UserRole } from '@shared/enums';

export class DepartmentScopeDto {
  department!: string;
  can_read!: boolean;
  can_write!: boolean;
}

export class UserResponseDto {
  id!: string;
  email!: string;
  first_name!: string;
  last_name!: string;
  role!: UserRole;
  org_id!: string;
  is_active!: boolean;
  last_login_at!: Date | null;
  department_scope!: DepartmentScopeDto[] | null;
  created_at!: Date;
}
