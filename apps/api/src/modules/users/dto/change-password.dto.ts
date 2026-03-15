import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  current_password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password!: string;

  @IsString()
  confirm_password!: string;
}
