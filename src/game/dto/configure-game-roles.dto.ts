import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsUUID } from 'class-validator';
import { Role } from '../domain/game.types';

export class ConfigureGameRolesDto {
  @ApiProperty({ format: 'uuid', description: 'playerId của chủ phòng.' })
  @IsUUID()
  playerId!: string;

  @ApiProperty({
    enum: Role,
    isArray: true,
    description:
      'Thành phần role của ván. Mỗi phần tử là một bản sao role; tổng số phần tử phải bằng số người chơi và sẽ được xáo ngẫu nhiên khi chia.',
    example: [Role.WOLF, Role.VILLAGER, Role.SEER, Role.GUARD, Role.FOOL],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
