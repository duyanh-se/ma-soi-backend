import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateGameDto {
  @ApiProperty({
    example: 'An',
    description: 'Tên của chủ phòng, đồng thời là một người chơi.',
  })
  @IsString()
  @Length(1, 40)
  hostName!: string;
}
