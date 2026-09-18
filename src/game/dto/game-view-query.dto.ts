import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GameViewQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  playerId!: string;
}
