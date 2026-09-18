import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Game as GameRecord } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { GameState } from '../domain/game.types';

@Injectable()
export class GameRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(state: GameState): Promise<GameState> {
    const record = await this.prisma.game.create({
      data: { id: state.id, state: state as unknown as Prisma.InputJsonValue },
    });
    return this.toState(record);
  }

  async findById(id: string): Promise<GameState> {
    const record = await this.prisma.game.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy phòng chơi.');
    return this.toState(record);
  }

  async save(state: GameState): Promise<GameState> {
    const record = await this.prisma.game.update({
      where: { id: state.id },
      data: { state: state as unknown as Prisma.InputJsonValue },
    });
    return this.toState(record);
  }

  private toState(record: GameRecord): GameState {
    const state = record.state as unknown as GameState;
    for (const player of state.players) {
      player.state.guardHistory ??= [];
    }
    return state;
  }
}
