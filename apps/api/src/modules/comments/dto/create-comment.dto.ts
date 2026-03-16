import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsIn(['SCENARIO', 'HYPOTHESIS'])
  entity_type!: 'SCENARIO' | 'HYPOTHESIS';

  @IsUUID()
  entity_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;
}
