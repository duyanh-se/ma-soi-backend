import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GameEngine } from './domain/game-engine';
import {
  Faction,
  GamePhase,
  type GamePlayer,
  type GameState,
  type PlayerAction,
  Role,
} from './domain/game.types';
import { GameRepository } from './repositories/game.repository';

@Injectable()
export class GameService {
  private readonly engine = new GameEngine();

  constructor(private readonly games: GameRepository) {}

  async create(hostName: string): Promise<{ gameId: string; hostPlayerId: string }> {
    const host = this.newPlayer(hostName);
    const state: GameState = {
      id: randomUUID(),
      hostId: host.id,
      roles: [],
      phase: GamePhase.LOBBY,
      night: 0,
      players: [host],
      nightState: { wolfVotes: {}, healUsed: false },
      dayState: { nominationVotes: {}, nominationRound: 1, executionVotes: {} },
      publicEvents: ['Phòng đã được tạo.'],
    };
    await this.games.create(state);
    return { gameId: state.id, hostPlayerId: host.id };
  }

  async join(gameId: string, name: string): Promise<{ playerId: string }> {
    const game = await this.game(gameId);
    if (game.phase !== GamePhase.LOBBY)
      throw new BadRequestException('Ván đã bắt đầu, không thể tham gia.');
    if (
      game.players.some(
        (player) =>
          player.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
      )
    ) {
      throw new BadRequestException('Tên người chơi đã được dùng trong phòng.');
    }
    const player = this.newPlayer(name);
    game.players.push(player);
    await this.games.save(game);
    return { playerId: player.id };
  }

  async start(gameId: string, actorId: string): Promise<unknown> {
    const game = await this.game(gameId);
    if (actorId !== game.hostId)
      throw new BadRequestException('Chỉ chủ phòng có thể bắt đầu ván.');
    if (game.phase !== GamePhase.LOBBY)
      throw new BadRequestException('Ván đã bắt đầu.');
    if (game.roles.length !== game.players.length) {
      throw new BadRequestException(
        'Chủ phòng phải cấu hình đúng một role cho mỗi người chơi trước khi bắt đầu.',
      );
    }
    const shuffledRoles = this.shuffleRoles(game.roles);
    game.players.forEach((player, index) => {
      const role = shuffledRoles[index];
      player.initialRole = role;
      player.currentRole = role;
      player.faction = this.roleFaction(role);
    });
    game.publicEvents.push('Ván chơi đã bắt đầu.');
    this.engine.begin(game);
    await this.games.save(game);
    return this.project(game, actorId);
  }

  async act(
    gameId: string,
    actorId: string,
    action: PlayerAction,
  ): Promise<unknown> {
    const game = await this.game(gameId);
    this.engine.apply(game, actorId, action);
    await this.games.save(game);
    return this.project(game, actorId);
  }

  async view(gameId: string, playerId: string): Promise<unknown> {
    return this.project(await this.game(gameId), playerId);
  }

  async configureRoles(
    gameId: string,
    actorId: string,
    roles: Role[],
  ): Promise<unknown> {
    const game = await this.game(gameId);
    if (actorId !== game.hostId)
      throw new BadRequestException('Chỉ chủ phòng có thể cấu hình role.');
    if (game.phase !== GamePhase.LOBBY)
      throw new BadRequestException('Không thể thay đổi role sau khi ván đã bắt đầu.');
    if (roles.length !== game.players.length) {
      throw new BadRequestException(
        'Số role phải bằng số người chơi đang trong phòng.',
      );
    }
    game.roles = [...roles];
    await this.games.save(game);
    return this.project(game, actorId);
  }

  private project(game: GameState, playerId: string): unknown {
    const viewer = this.player(game, playerId);
    const privateRole = this.visibleRole(viewer);
    const lover = viewer.loverId
      ? this.player(game, viewer.loverId)
      : undefined;
    const isWolf = privateRole === Role.WOLF;
    return {
      game: {
        id: game.id,
        phase: game.phase,
        night: game.night,
        players: game.players.map((player) => ({
          id: player.id,
          name: player.name,
          alive: player.alive,
        })),
        publicEvents: game.publicEvents,
        winners: game.phase === GamePhase.FINISHED ? game.winners : undefined,
        winnerPlayerIds:
          game.phase === GamePhase.FINISHED
            ? game.winnerPlayerIds
            : undefined,
        finalRoles:
          game.phase === GamePhase.FINISHED
            ? game.players.map((player) => ({
                id: player.id,
                name: player.name,
                role: player.currentRole,
                faction: player.faction,
              }))
            : undefined,
        day: {
          nominationRound: game.dayState.nominationRound,
          scaffoldedId: game.dayState.scaffoldedId,
          nominationVoteCount: Object.keys(game.dayState.nominationVotes)
            .length,
          executionVoteCount: Object.keys(game.dayState.executionVotes).length,
        },
      },
      private: {
        playerId: viewer.id,
        configuredRoles:
          viewer.id === game.hostId && game.phase === GamePhase.LOBBY
            ? game.roles
            : undefined,
        canAdvanceNight:
          viewer.id === game.hostId &&
          [
            GamePhase.NIGHT_GUARD,
            GamePhase.NIGHT_WOLF,
            GamePhase.NIGHT_SEER,
            GamePhase.NIGHT_WITCH_HEAL,
            GamePhase.NIGHT_WITCH_POISON,
          ].includes(game.phase),
        actionPhase: this.actionPhaseForViewer(game, viewer),
        role: privateRole,
        faction: this.visibleFaction(viewer),
        notifications: viewer.state.notifications.filter(
          (notification) => !notification.startsWith('dead:'),
        ),
        lover: lover && {
          id: lover.id,
          name: lover.name,
          alive: lover.alive,
          role: this.visibleRole(lover),
          faction: this.visibleFaction(lover),
        },
        seerHistory:
          privateRole === Role.SEER ? viewer.state.inspections : undefined,
        guardLastTargetId:
          privateRole === Role.GUARD ? viewer.state.lastGuardedId : undefined,
        guardHistory:
          privateRole === Role.GUARD ? viewer.state.guardHistory : undefined,
        potions:
          privateRole === Role.WITCH
            ? {
                heal: viewer.state.healPotion,
                poison: viewer.state.poisonPotion,
              }
            : undefined,
        wolfPack: isWolf
          ? game.players
              .filter(
                (player) =>
                  player.alive &&
                  player.currentRole === Role.WOLF &&
                  this.visibleRole(player) === Role.WOLF,
              )
              .map((player) => ({ id: player.id, name: player.name }))
          : undefined,
        wolfVotes:
          isWolf && game.phase === GamePhase.NIGHT_WOLF
            ? game.nightState.wolfVotes
            : undefined,
        wolfBiteTarget:
          privateRole === Role.WITCH &&
          viewer.state.healPotion &&
          game.phase === GamePhase.NIGHT_WITCH_HEAL
            ? game.nightState.wolfTargetId
            : undefined,
        nominationVoteTargetId:
          game.phase === GamePhase.DAY_NOMINATION
            ? game.dayState.nominationVotes[viewer.id]
            : undefined,
        executionVote:
          game.phase === GamePhase.DAY_EXECUTION &&
          Object.hasOwn(game.dayState.executionVotes, viewer.id)
            ? game.dayState.executionVotes[viewer.id]
            : undefined,
      },
    };
  }

  private newPlayer(name: string): GamePlayer {
    const normalizedName = name?.trim();
    if (!normalizedName || normalizedName.length > 40)
      throw new BadRequestException(
        'Tên người chơi phải có từ 1 đến 40 ký tự.',
      );
    return {
      id: randomUUID(),
      name: normalizedName,
      alive: true,
      state: {
        cupidUsed: false,
        healPotion: true,
        poisonPotion: true,
        inspections: [],
        guardHistory: [],
        conversionAnnounced: true,
        notifications: [],
      },
    };
  }

  private visibleRole(player: GamePlayer): Role | undefined {
    if (
      player.currentRole === Role.WOLF &&
      player.state.convertedAtNight &&
      !player.state.conversionAnnounced
    )
      return Role.CURSED;
    return player.currentRole;
  }

  private visibleFaction(player: GamePlayer): Faction | undefined {
    if (
      player.currentRole === Role.WOLF &&
      player.state.convertedAtNight &&
      !player.state.conversionAnnounced
    )
      return Faction.VILLAGE;
    return player.faction;
  }

  private roleFaction(role: Role): Faction {
    if (role === Role.WOLF) return Faction.WOLF;
    if (role === Role.FOOL) return Faction.FOOL;
    return Faction.VILLAGE;
  }

  private actionPhaseForViewer(
    game: GameState,
    viewer: GamePlayer,
  ): GamePhase | undefined {
    if (
      viewer.alive &&
      game.phase === GamePhase.NIGHT_CUPID &&
      viewer.currentRole === Role.CUPID
    )
      return game.phase;
    if (
      viewer.alive &&
      game.phase === GamePhase.NIGHT_GUARD &&
      viewer.currentRole === Role.GUARD
    )
      return game.phase;
    if (game.phase === GamePhase.NIGHT_WOLF && viewer.alive && viewer.currentRole === Role.WOLF)
      return game.phase;
    if (game.phase === GamePhase.NIGHT_SEER && viewer.alive && viewer.currentRole === Role.SEER)
      return game.phase;
    if (
      viewer.alive &&
      (game.phase === GamePhase.NIGHT_WITCH_HEAL ||
        game.phase === GamePhase.NIGHT_WITCH_POISON) &&
      viewer.currentRole === Role.WITCH
    )
      return game.phase;
    if (game.phase === GamePhase.DAY_NOMINATION && viewer.alive)
      return game.phase;
    if (
      game.phase === GamePhase.DAY_EXECUTION &&
      viewer.alive &&
      viewer.id !== game.dayState.scaffoldedId
    )
      return game.phase;
    if (game.phase === GamePhase.DAY_DEFENSE && viewer.id === game.hostId)
      return game.phase;
    return undefined;
  }

  private shuffleRoles(roles: Role[]): Role[] {
    const shuffled = [...roles];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  private async game(gameId: string): Promise<GameState> {
    return this.games.findById(gameId);
  }

  private player(game: GameState, playerId: string): GamePlayer {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player)
      throw new NotFoundException('Người chơi không thuộc phòng này.');
    return player;
  }
}
