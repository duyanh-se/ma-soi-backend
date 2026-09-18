import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GameActionDto } from './dto/game-action.dto';
import { ConfigureGameRolesDto } from './dto/configure-game-roles.dto';
import { CreateGameDto } from './dto/create-game.dto';
import { GameViewQueryDto } from './dto/game-view-query.dto';
import { JoinGameDto } from './dto/join-game.dto';
import { StartGameDto } from './dto/start-game.dto';
import { GameService } from './game.service';

@ApiTags('Games')
@Controller('games')
export class GameController {
  constructor(private readonly games: GameService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo phòng chờ người chơi tham gia' })
  @ApiCreatedResponse({ description: 'Trả về gameId và hostPlayerId.' })
  create(@Body() body: CreateGameDto) {
    return this.games.create(body.hostName);
  }

  @Post(':gameId/join')
  @ApiOperation({ summary: 'Tham gia một phòng đang chờ' })
  @ApiParam({ name: 'gameId', format: 'uuid' })
  @ApiCreatedResponse({
    description: 'Trả về playerId của người vừa tham gia.',
  })
  @ApiBadRequestResponse({
    description: 'Phòng đã bắt đầu, đầy hoặc tên trùng.',
  })
  join(@Param('gameId') gameId: string, @Body() body: JoinGameDto) {
    return this.games.join(gameId, body.name);
  }

  @Post(':gameId/configuration')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chủ phòng cấu hình thành phần role của ván' })
  @ApiParam({ name: 'gameId', format: 'uuid' })
  @ApiOkResponse({ description: 'Trả về private view của chủ phòng.' })
  @ApiBadRequestResponse({
    description:
      'Không phải chủ phòng, ván đã bắt đầu hoặc số role không khớp.',
  })
  configureRoles(
    @Param('gameId') gameId: string,
    @Body() body: ConfigureGameRolesDto,
  ) {
    return this.games.configureRoles(gameId, body.playerId, body.roles);
  }

  @Post(':gameId/start')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Chủ phòng bắt đầu và chia ngẫu nhiên role đã cấu hình',
  })
  @ApiParam({ name: 'gameId', format: 'uuid' })
  @ApiOkResponse({ description: 'Trả về private view của chủ phòng.' })
  start(@Param('gameId') gameId: string, @Body() body: StartGameDto) {
    return this.games.start(gameId, body.playerId);
  }

  @Post(':gameId/actions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Gửi một lựa chọn hợp lệ trong lượt hiện tại' })
  @ApiParam({ name: 'gameId', format: 'uuid' })
  @ApiOkResponse({ description: 'Trả về private view mới của người gửi.' })
  @ApiBadRequestResponse({
    description: 'Action sai phase, sai vai trò hoặc sai mục tiêu.',
  })
  act(@Param('gameId') gameId: string, @Body() body: GameActionDto) {
    const { playerId, ...action } = body;
    return this.games.act(gameId, playerId, action);
  }

  @Get(':gameId/view')
  @ApiOperation({
    summary: 'Lấy public state và private state của một người chơi',
  })
  @ApiParam({ name: 'gameId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Không chứa thông tin bí mật của người chơi khác.',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phòng hoặc người chơi.' })
  view(@Param('gameId') gameId: string, @Query() query: GameViewQueryDto) {
    return this.games.view(gameId, query.playerId);
  }
}
