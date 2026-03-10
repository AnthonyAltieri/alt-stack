import { Type } from "class-transformer";
import { IsInt, IsString, Min, MinLength } from "class-validator";

export class QueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit!: number;
}

export class CreateItemDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
