import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinGameDto {
  @ApiProperty({ example: 'Bình' })
  @IsString()
  @Length(1, 40)
  name!: string;
}
