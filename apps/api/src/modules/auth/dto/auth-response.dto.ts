import { UserRole } from '@shared/enums';

export class AuthUserDto {
  id!: string;
  email!: string;
  role!: UserRole;
  org_id!: string;
  first_name!: string;
  last_name!: string;
}

export class AuthResponseDto {
  access_token!: string;
  refresh_token!: string;
  user!: AuthUserDto;
}
