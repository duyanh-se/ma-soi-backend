import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameRepository } from './repositories/game.repository';

@Module({
  controllers: [GameController],
  providers: [GameService, GameRepository],
})
export class GameModule {}
