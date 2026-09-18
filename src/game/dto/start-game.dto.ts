import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartGameDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  playerId!: string;
}
