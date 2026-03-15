import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ValidateBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}
