import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@shared/enums';

export class InviteUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(100)
  first_name!: string;

  @IsString()
  @MaxLength(100)
  last_name!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  @IsOptional()
  department?: string;
}
