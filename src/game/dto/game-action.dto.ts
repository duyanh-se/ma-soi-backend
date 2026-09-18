import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { GameActionType } from '../domain/game.types';

export class GameActionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Định danh người thực hiện action trong bản chưa có xác thực.',
  })
  @IsUUID()
  playerId!: string;

  @ApiProperty({
    enum: GameActionType,
    description:
      'CAST_BLANK_NOMINATION và CAST_BLANK_EXECUTION gửi phiếu trắng, không cần targetId hoặc use.',
  })
  @IsEnum(GameActionType)
  type!: GameActionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetIds?: string[];

  @ApiPropertyOptional({
    description: 'Dùng cho USE_HEAL, USE_POISON và VOTE_EXECUTION.',
  })
  @IsOptional()
  @IsBoolean()
  use?: boolean;
}
