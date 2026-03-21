import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@shared/enums';

export class UpdateUserDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  first_name?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  last_name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  department?: string;
}
