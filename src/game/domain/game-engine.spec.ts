import { GameEngine } from './game-engine';
import {
  Faction,
  GameActionType,
  GamePhase,
  type GamePlayer,
  type GameState,
  Role,
} from './game.types';

const makePlayer = (id: string, role: Role): GamePlayer => ({
  id,
  name: id,
  alive: true,
  initialRole: role,
  currentRole: role,
  faction:
    role === Role.WOLF
      ? Faction.WOLF
      : role === Role.FOOL
        ? Faction.FOOL
        : Faction.VILLAGE,
  state: {
    cupidUsed: false,
    healPotion: true,
    poisonPotion: true,
    inspections: [],
    guardHistory: [],
    conversionAnnounced: true,
    notifications: [],
  },
});

const makeGame = (
  players: GamePlayer[],
  phase = GamePhase.NIGHT_WOLF,
): GameState => ({
  id: 'game',
  hostId: players[0].id,
  roles: players.map((player) => player.currentRole as Role),
  phase,
  night: 1,
  players,
  nightState: { wolfVotes: {}, healUsed: false },
  dayState: { nominationVotes: {}, nominationRound: 1, executionVotes: {} },
  publicEvents: [],
});

describe('GameEngine', () => {
  it('resolves the wolf target after every living wolf has voted', () => {
    const game = makeGame([
      makePlayer('wolf-1', Role.WOLF),
      makePlayer('wolf-2', Role.WOLF),
      makePlayer('villager-1', Role.VILLAGER),
      makePlayer('villager-2', Role.VILLAGER),
    ]);
    const engine = new GameEngine();
    engine.apply(game, 'wolf-1', {
      type: GameActionType.VOTE_WOLF_TARGET,
      targetId: 'villager-1',
    });
    engine.apply(game, 'wolf-2', {
      type: GameActionType.VOTE_WOLF_TARGET,
      targetId: 'villager-2',
    });
    expect(['villager-1', 'villager-2']).toContain(game.nightState.wolfTargetId);
    expect(game.phase).toBe(GamePhase.NIGHT_SEER);
    expect(() =>
      engine.apply(game, 'wolf-1', {
        type: GameActionType.VOTE_WOLF_TARGET,
        targetId: 'villager-1',
      }),
    ).toThrow('Hành động không đúng');
  });

  it('does not convert a cursed player when the bite is healed', () => {
    const game = makeGame(
      [
        makePlayer('wolf', Role.WOLF),
        makePlayer('cursed', Role.CURSED),
        makePlayer('witch', Role.WITCH),
      ],
      GamePhase.NIGHT_WITCH_HEAL,
    );
    game.nightState.wolfTargetId = 'cursed';
    const engine = new GameEngine();
    engine.apply(game, 'witch', { type: GameActionType.USE_HEAL, use: true });
    engine.apply(game, 'witch', {
      type: GameActionType.USE_POISON,
      use: false,
    });
    expect(game.players[1].currentRole).toBe(Role.CURSED);
    expect(game.players[1].alive).toBe(true);
  });

  it('records each guard target in the private guard history', () => {
    const game = makeGame(
      [
        makePlayer('guard', Role.GUARD),
        makePlayer('wolf', Role.WOLF),
        makePlayer('villager', Role.VILLAGER),
      ],
      GamePhase.NIGHT_GUARD,
    );
    const engine = new GameEngine();
    engine.apply(game, 'guard', {
      type: GameActionType.PROTECT,
      targetId: 'villager',
    });
    expect(game.players[0].state.guardHistory).toEqual([
      { night: 1, targetId: 'villager' },
    ]);
  });

  it('ends the game immediately when the fool is hanged', () => {
    const game = makeGame(
      [
        makePlayer('host', Role.FOOL),
        makePlayer('wolf', Role.WOLF),
        makePlayer('villager', Role.VILLAGER),
      ],
      GamePhase.DAY_EXECUTION,
    );
    game.dayState.scaffoldedId = 'host';
    const engine = new GameEngine();
    for (const player of game.players.filter((player) => player.id !== 'host'))
      engine.apply(game, player.id, {
        type: GameActionType.VOTE_EXECUTION,
        use: true,
      });
    expect(game.phase).toBe(GamePhase.FINISHED);
    expect(game.winners).toEqual([Faction.FOOL]);
  });

  it('does not allow self-nomination or repeat votes and ends a tied nomination day', () => {
    const game = makeGame(
      [
        makePlayer('host', Role.VILLAGER),
        makePlayer('second', Role.VILLAGER),
        makePlayer('third', Role.WOLF),
        makePlayer('fourth', Role.SEER),
      ],
      GamePhase.DAY_NOMINATION,
    );
    const engine = new GameEngine();
    expect(() =>
      engine.apply(game, 'host', {
        type: GameActionType.NOMINATE,
        targetId: 'host',
      }),
    ).toThrow('Không thể tự');
    engine.apply(game, 'host', {
      type: GameActionType.NOMINATE,
      targetId: 'second',
    });
    expect(() =>
      engine.apply(game, 'host', {
        type: GameActionType.NOMINATE,
        targetId: 'third',
      }),
    ).toThrow('đã bỏ phiếu');
    engine.apply(game, 'second', {
      type: GameActionType.NOMINATE,
      targetId: 'host',
    });
    engine.apply(game, 'third', {
      type: GameActionType.NOMINATE,
      targetId: 'fourth',
    });
    engine.apply(game, 'fourth', {
      type: GameActionType.NOMINATE,
      targetId: 'third',
    });
    expect(game.phase).toBe(GamePhase.NIGHT_GUARD);
  });

  it('excludes the scaffolded player and ends a tied execution day', () => {
    const game = makeGame(
      [
        makePlayer('host', Role.VILLAGER),
        makePlayer('second', Role.VILLAGER),
        makePlayer('third', Role.WOLF),
      ],
      GamePhase.DAY_EXECUTION,
    );
    game.dayState.scaffoldedId = 'host';
    const engine = new GameEngine();
    expect(() =>
      engine.apply(game, 'host', {
        type: GameActionType.VOTE_EXECUTION,
        use: true,
      }),
    ).toThrow('đang lên giàn');
    engine.apply(game, 'second', {
      type: GameActionType.VOTE_EXECUTION,
      use: true,
    });
    engine.apply(game, 'third', {
      type: GameActionType.VOTE_EXECUTION,
      use: false,
    });
    expect(game.phase).toBe(GamePhase.NIGHT_GUARD);
  });

  it('keeps public night phases and lets the host advance a phase with no living role', () => {
    const game = makeGame(
      [makePlayer('host', Role.VILLAGER), makePlayer('other', Role.VILLAGER)],
      GamePhase.NIGHT_GUARD,
    );
    const engine = new GameEngine();
    engine.apply(game, 'host', { type: GameActionType.ADVANCE_NIGHT });
    expect(game.phase).toBe(GamePhase.NIGHT_WOLF);
  });

  it('notifies lovers of their resulting faction immediately after Cupid pairs them', () => {
    const game = makeGame(
      [makePlayer('cupid', Role.CUPID), makePlayer('fool', Role.FOOL)],
      GamePhase.NIGHT_CUPID,
    );
    const engine = new GameEngine();
    engine.apply(game, 'cupid', {
      type: GameActionType.PAIR_LOVERS,
      targetIds: ['cupid', 'fool'],
    });
    expect(game.players[0].faction).toBe(Faction.LOVERS);
    expect(game.players[1].faction).toBe(Faction.LOVERS);
    expect(game.players[0].state.notifications[0]).toContain('phe Tình nhân độc lập');
    expect(game.players[1].state.notifications[0]).toContain('phe Tình nhân độc lập');
  });

  it('makes a Fool pair independent but awards a hanging Fool alone', () => {
    const game = makeGame(
      [
        makePlayer('cupid', Role.CUPID),
        makePlayer('fool', Role.FOOL),
        makePlayer('wolf', Role.WOLF),
        makePlayer('villager', Role.VILLAGER),
      ],
      GamePhase.NIGHT_CUPID,
    );
    const engine = new GameEngine();
    engine.apply(game, 'cupid', {
      type: GameActionType.PAIR_LOVERS,
      targetIds: ['fool', 'wolf'],
    });
    expect(game.players[1].faction).toBe(Faction.LOVERS);
    expect(game.players[2].faction).toBe(Faction.LOVERS);

    game.phase = GamePhase.DAY_EXECUTION;
    game.dayState.scaffoldedId = 'fool';
    for (const player of game.players.filter((player) => player.id !== 'fool'))
      engine.apply(game, player.id, {
        type: GameActionType.VOTE_EXECUTION,
        use: true,
      });

    expect(game.phase).toBe(GamePhase.FINISHED);
    expect(game.winners).toEqual([Faction.FOOL]);
    expect(game.winnerPlayerIds).toEqual(['fool']);
    expect(game.players.find((player) => player.id === 'wolf')?.alive).toBe(false);
  });

  it('changes a Cursed and Villager pair to independent lovers after conversion', () => {
    const game = makeGame(
      [
        makePlayer('cupid', Role.CUPID),
        makePlayer('cursed', Role.CURSED),
        makePlayer('villager', Role.VILLAGER),
        makePlayer('wolf', Role.WOLF),
        makePlayer('witch', Role.WITCH),
      ],
      GamePhase.NIGHT_CUPID,
    );
    const engine = new GameEngine();
    engine.apply(game, 'cupid', {
      type: GameActionType.PAIR_LOVERS,
      targetIds: ['cursed', 'villager'],
    });
    expect(game.players[1].faction).toBe(Faction.VILLAGE);
    expect(game.players[2].faction).toBe(Faction.VILLAGE);

    game.phase = GamePhase.NIGHT_WITCH_POISON;
    game.nightState.wolfTargetId = 'cursed';
    engine.apply(game, 'witch', { type: GameActionType.USE_POISON, use: false });
    expect(game.players[1].currentRole).toBe(Role.WOLF);
    expect(game.players[1].faction).toBe(Faction.LOVERS);
    expect(game.players[2].faction).toBe(Faction.LOVERS);
  });

  it('changes a Cursed and Wolf pair to the wolf faction after conversion', () => {
    const game = makeGame(
      [
        makePlayer('cupid', Role.CUPID),
        makePlayer('cursed', Role.CURSED),
        makePlayer('wolf', Role.WOLF),
        makePlayer('villager', Role.VILLAGER),
        makePlayer('witch', Role.WITCH),
      ],
      GamePhase.NIGHT_CUPID,
    );
    const engine = new GameEngine();
    engine.apply(game, 'cupid', {
      type: GameActionType.PAIR_LOVERS,
      targetIds: ['cursed', 'wolf'],
    });
    expect(game.players[1].faction).toBe(Faction.LOVERS);
    expect(game.players[2].faction).toBe(Faction.LOVERS);

    game.phase = GamePhase.NIGHT_WITCH_POISON;
    game.nightState.wolfTargetId = 'cursed';
    engine.apply(game, 'witch', { type: GameActionType.USE_POISON, use: false });
    expect(game.players[1].currentRole).toBe(Role.WOLF);
    expect(game.players[1].faction).toBe(Faction.WOLF);
    expect(game.players[2].faction).toBe(Faction.WOLF);
  });
});
