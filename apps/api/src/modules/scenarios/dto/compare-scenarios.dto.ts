import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class CompareScenariosDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(4)
  scenario_ids!: string[];
}
