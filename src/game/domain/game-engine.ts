import { BadRequestException } from '@nestjs/common';
import {
  Faction,
  GameActionType,
  GamePhase,
  type GamePlayer,
  type GameState,
  type PlayerAction,
  Role,
} from './game.types';

const emptyNight = () => ({ wolfVotes: {}, healUsed: false });
const emptyDay = () => ({
  nominationVotes: {},
  nominationRound: 1,
  executionVotes: {},
});

export class GameEngine {
  apply(game: GameState, actorId: string, action: PlayerAction): GameState {
    const actor = this.player(game, actorId);
    if (
      !actor.alive &&
      game.phase !== GamePhase.LOBBY &&
      action.type !== GameActionType.END_DEFENSE &&
      action.type !== GameActionType.ADVANCE_NIGHT
    ) {
      throw new BadRequestException(
        'Người đã chết không thể thực hiện hành động.',
      );
    }

    switch (action.type) {
      case GameActionType.PAIR_LOVERS:
        this.pairLovers(game, actor, action.targetIds);
        break;
      case GameActionType.PROTECT:
        this.protect(game, actor, action.targetId);
        break;
      case GameActionType.VOTE_WOLF_TARGET:
        this.voteWolfTarget(game, actor, action.targetId);
        break;
      case GameActionType.INSPECT:
        this.inspect(game, actor, action.targetId);
        break;
      case GameActionType.USE_HEAL:
        this.useHeal(game, actor, action.use);
        break;
      case GameActionType.USE_POISON:
        this.usePoison(game, actor, action.targetId, action.use);
        break;
      case GameActionType.NOMINATE:
        this.nominate(game, actor, action.targetId);
        break;
      case GameActionType.END_DEFENSE:
        this.endDefense(game, actor);
        break;
      case GameActionType.VOTE_EXECUTION:
        this.voteExecution(game, actor, action.use);
        break;
      case GameActionType.ADVANCE_NIGHT:
        this.advanceHiddenNightPhase(game, actor);
        break;
    }
    return game;
  }

  begin(game: GameState): void {
    game.night = 1;
    game.nightState = emptyNight();
    game.dayState = emptyDay();
    this.enterCupidOrGuard(game);
  }

  private pairLovers(
    game: GameState,
    actor: GamePlayer,
    targetIds?: string[],
  ): void {
    this.requirePhase(game, GamePhase.NIGHT_CUPID);
    this.requireRole(actor, Role.CUPID);
    if (actor.state.cupidUsed || !targetIds || targetIds.length !== 2)
      throw new BadRequestException(
        'Cupid phải chọn đúng hai người, duy nhất một lần.',
      );
    const [firstId, secondId] = targetIds;
    if (firstId === secondId)
      throw new BadRequestException(
        'Hai tình nhân phải là hai người khác nhau.',
      );
    const first = this.livingPlayer(game, firstId);
    const second = this.livingPlayer(game, secondId);
    first.loverId = second.id;
    second.loverId = first.id;
    actor.state.cupidUsed = true;
    this.recalculateLoverFactions(game);
    first.state.notifications.push(
      `Bạn đã ghép đôi với ${second.name}. Phe mới của hai bạn: ${this.factionLabel(first.faction)}.`,
    );
    second.state.notifications.push(
      `Bạn đã ghép đôi với ${first.name}. Phe mới của hai bạn: ${this.factionLabel(second.faction)}.`,
    );
    this.enterGuardOrWolf(game);
  }

  private protect(game: GameState, actor: GamePlayer, targetId?: string): void {
    this.requirePhase(game, GamePhase.NIGHT_GUARD);
    this.requireRole(actor, Role.GUARD);
    const target = this.livingPlayer(game, targetId);
    if (target.id === actor.state.lastGuardedId)
      throw new BadRequestException(
        'Bảo vệ không thể chọn cùng một người hai đêm liên tiếp.',
      );
    game.nightState.protectedId = target.id;
    actor.state.lastGuardedId = target.id;
    actor.state.guardHistory.push({ night: game.night, targetId: target.id });
    this.enterWolfOrSeer(game);
  }

  private voteWolfTarget(
    game: GameState,
    actor: GamePlayer,
    targetId?: string,
  ): void {
    this.requirePhase(game, GamePhase.NIGHT_WOLF);
    this.requireRole(actor, Role.WOLF);
    const target = this.livingPlayer(game, targetId);
    if (target.currentRole === Role.WOLF)
      throw new BadRequestException(
        'Sói không thể cắn một người thuộc nhóm sói.',
      );
    if (game.nightState.wolfVotes[actor.id])
      throw new BadRequestException('Bạn đã chọn mục tiêu cắn trong đêm này.');
    game.nightState.wolfVotes[actor.id] = target.id;
    const wolves = this.livingRole(game, Role.WOLF);
    if (wolves.every((wolf) => game.nightState.wolfVotes[wolf.id]))
      this.resolveWolfVotes(game);
  }

  private inspect(game: GameState, actor: GamePlayer, targetId?: string): void {
    this.requirePhase(game, GamePhase.NIGHT_SEER);
    this.requireRole(actor, Role.SEER);
    const target = this.livingPlayer(game, targetId);
    if (target.id === actor.id)
      throw new BadRequestException('Tiên tri phải soi một người chơi khác.');
    actor.state.inspections.push({
      night: game.night,
      targetId: target.id,
      result: target.currentRole === Role.WOLF ? 'WOLF' : 'NOT_WOLF',
    });
    this.enterWitchHealOrPoison(game);
  }

  private useHeal(game: GameState, actor: GamePlayer, use?: boolean): void {
    this.requirePhase(game, GamePhase.NIGHT_WITCH_HEAL);
    this.requireRole(actor, Role.WITCH);
    if (use === true) {
      if (!actor.state.healPotion || !game.nightState.wolfTargetId)
        throw new BadRequestException(
          'Không có bình cứu hoặc không có mục tiêu hợp lệ để cứu.',
        );
      actor.state.healPotion = false;
      game.nightState.healUsed = true;
    }
    this.enterWitchPoisonOrResolve(game);
  }

  private usePoison(
    game: GameState,
    actor: GamePlayer,
    targetId?: string,
    use?: boolean,
  ): void {
    this.requirePhase(game, GamePhase.NIGHT_WITCH_POISON);
    this.requireRole(actor, Role.WITCH);
    if (use === true) {
      if (!actor.state.poisonPotion)
        throw new BadRequestException('Phù thủy đã dùng bình giết.');
      const target = this.livingPlayer(game, targetId);
      actor.state.poisonPotion = false;
      game.nightState.poisonTargetId = target.id;
    }
    this.resolveNight(game);
  }

  private nominate(
    game: GameState,
    actor: GamePlayer,
    targetId?: string,
  ): void {
    this.requirePhase(game, GamePhase.DAY_NOMINATION);
    const target = this.livingPlayer(game, targetId);
    if (target.id === actor.id)
      throw new BadRequestException('Không thể tự bỏ phiếu đưa bản thân lên giàn.');
    if (game.dayState.nominationVotes[actor.id])
      throw new BadRequestException('Bạn đã bỏ phiếu đưa người lên giàn.');
    game.dayState.nominationVotes[actor.id] = target.id;
    if (
      Object.keys(game.dayState.nominationVotes).length ===
      this.living(game).length
    )
      this.resolveNomination(game);
  }

  private endDefense(game: GameState, actor: GamePlayer): void {
    this.requirePhase(game, GamePhase.DAY_DEFENSE);
    if (actor.id !== game.hostId)
      throw new BadRequestException(
        'Chỉ chủ phòng có thể kết thúc thời gian biện hộ.',
      );
    game.phase = GamePhase.DAY_EXECUTION;
  }

  private voteExecution(
    game: GameState,
    actor: GamePlayer,
    use?: boolean,
  ): void {
    this.requirePhase(game, GamePhase.DAY_EXECUTION);
    if (actor.id === game.dayState.scaffoldedId)
      throw new BadRequestException('Người đang lên giàn không được biểu quyết treo cổ.');
    if (typeof use !== 'boolean')
      throw new BadRequestException('Cần chọn treo cổ hoặc không treo.');
    if (game.dayState.executionVotes[actor.id] !== undefined)
      throw new BadRequestException('Bạn đã bỏ phiếu treo cổ.');
    game.dayState.executionVotes[actor.id] = use;
    if (
      Object.keys(game.dayState.executionVotes).length !==
      this.executionVoters(game).length
    )
      return;
    const votesForExecution = Object.values(
      game.dayState.executionVotes,
    ).filter(Boolean).length;
    const scaffolded = this.player(game, game.dayState.scaffoldedId);
    if (votesForExecution > this.executionVoters(game).length / 2) {
      this.killWithLoverChain(game, scaffolded.id);
      game.publicEvents.push(`${scaffolded.name} đã bị treo cổ.`);
      if (scaffolded.currentRole === Role.FOOL) {
        this.finish(game, [Faction.FOOL], [scaffolded.id]);
        return;
      }
      if (this.checkWin(game)) return;
    } else {
      game.publicEvents.push(
        votesForExecution === this.executionVoters(game).length - votesForExecution
          ? `Biểu quyết treo cổ ${scaffolded.name} hòa phiếu; ngày kết thúc.`
          : `${scaffolded.name} không bị treo cổ.`,
      );
    }
    this.beginNextNight(game);
  }

  private resolveNomination(game: GameState): void {
    const totals = new Map<string, number>();
    for (const id of Object.values(game.dayState.nominationVotes))
      totals.set(id, (totals.get(id) ?? 0) + 1);
    const maximum = Math.max(...totals.values());
    const leaders = [...totals.entries()]
      .filter(([, count]) => count === maximum)
      .map(([id]) => id);
    if (leaders.length > 1) {
      game.publicEvents.push('Biểu quyết đưa lên giàn hòa phiếu; ngày kết thúc.');
      this.beginNextNight(game);
      return;
    }
    game.dayState.scaffoldedId = leaders[0];
    game.phase = GamePhase.DAY_DEFENSE;
    game.publicEvents.push(
      `${this.player(game, leaders[0]).name} đã được đưa lên giàn.`,
    );
  }

  private resolveWolfVotes(game: GameState): void {
    const totals = new Map<string, number>();
    for (const targetId of Object.values(game.nightState.wolfVotes))
      totals.set(targetId, (totals.get(targetId) ?? 0) + 1);
    const maximum = Math.max(...totals.values());
    const leaders = [...totals.entries()]
      .filter(([, count]) => count === maximum)
      .map(([targetId]) => targetId);
    game.nightState.wolfTargetId =
      leaders[Math.floor(Math.random() * leaders.length)];
    this.enterSeerOrWitch(game);
  }

  private resolveNight(game: GameState): void {
    const aliveBeforeResolution = new Set(
      this.living(game).map((player) => player.id),
    );
    const victims = new Set<string>();
    const wolfTarget =
      game.nightState.wolfTargetId &&
      this.player(game, game.nightState.wolfTargetId);
    const bitePrevented =
      wolfTarget &&
      (game.nightState.protectedId === wolfTarget.id ||
        game.nightState.healUsed);
    if (wolfTarget && !bitePrevented) {
      if (wolfTarget.currentRole === Role.CURSED) {
        wolfTarget.currentRole = Role.WOLF;
        wolfTarget.state.convertedAtNight = game.night;
        wolfTarget.state.conversionAnnounced = false;
        this.recalculateLoverFactions(game);
      } else victims.add(wolfTarget.id);
    }
    if (game.nightState.poisonTargetId)
      victims.add(game.nightState.poisonTargetId);
    for (const victimId of victims) this.killWithLoverChain(game, victimId);
    const deadTonight = game.players.filter(
      (player) => aliveBeforeResolution.has(player.id) && !player.alive,
    );
    game.publicEvents.push(
      deadTonight.length === 0
        ? `Sáng ngày ${game.night}: Không có ai bị loại.`
        : `Sáng ngày ${game.night}: ${deadTonight.map((player) => player.name).join(', ')} đã bị loại.`,
    );
    if (this.checkWin(game)) return;
    game.phase = GamePhase.DAY_NOMINATION;
    game.dayState = emptyDay();
  }

  private beginNextNight(game: GameState): void {
    game.night += 1;
    game.nightState = emptyNight();
    game.dayState = emptyDay();
    this.announceConversions(game);
    this.enterCupidOrGuard(game);
  }

  private announceConversions(game: GameState): void {
    const converted = game.players.filter(
      (player) =>
        player.alive &&
        player.state.convertedAtNight &&
        !player.state.conversionAnnounced,
    );
    for (const player of converted) {
      player.state.conversionAnnounced = true;
      player.state.notifications.push(
        `Bạn đã bị nguyền hóa thành Sói. Phe hiện tại: ${this.factionLabel(player.faction)}.`,
      );
      for (const wolf of this.livingRole(game, Role.WOLF))
        if (wolf.id !== player.id)
          wolf.state.notifications.push('Nhóm sói có một thành viên mới.');
      const lover = player.loverId
        ? this.player(game, player.loverId)
        : undefined;
      lover?.state.notifications.push(
        `Người yêu của bạn đã hóa Sói. Phe hiện tại của hai bạn: ${this.factionLabel(lover.faction)}.`,
      );
    }
  }

  private enterCupidOrGuard(game: GameState): void {
    const cupid = this.livingRole(game, Role.CUPID).find(
      (player) => !player.state.cupidUsed,
    );
    if (cupid) {
      game.phase = GamePhase.NIGHT_CUPID;
      return;
    }
    this.enterGuardOrWolf(game);
  }

  private enterGuardOrWolf(game: GameState): void {
    game.phase = GamePhase.NIGHT_GUARD;
  }

  private enterWolfOrSeer(game: GameState): void {
    game.phase = GamePhase.NIGHT_WOLF;
  }

  private enterSeerOrWitch(game: GameState): void {
    game.phase = GamePhase.NIGHT_SEER;
  }

  private enterWitchHealOrPoison(game: GameState): void {
    game.phase = GamePhase.NIGHT_WITCH_HEAL;
  }

  private enterWitchPoisonOrResolve(game: GameState): void {
    game.phase = GamePhase.NIGHT_WITCH_POISON;
  }

  private advanceHiddenNightPhase(game: GameState, actor: GamePlayer): void {
    if (actor.id !== game.hostId)
      throw new BadRequestException('Chỉ chủ phòng có thể tiếp tục lượt đêm không có người hành động.');
    if (!this.isNightPhase(game.phase))
      throw new BadRequestException('Chỉ có thể tiếp tục một lượt đêm.');
    if (this.phaseHasLivingActor(game))
      throw new BadRequestException('Vai trò hiện tại vẫn có người chơi có thể hành động.');
    switch (game.phase) {
      case GamePhase.NIGHT_GUARD:
        this.enterWolfOrSeer(game);
        return;
      case GamePhase.NIGHT_WOLF:
        this.enterSeerOrWitch(game);
        return;
      case GamePhase.NIGHT_SEER:
        this.enterWitchHealOrPoison(game);
        return;
      case GamePhase.NIGHT_WITCH_HEAL:
        this.enterWitchPoisonOrResolve(game);
        return;
      case GamePhase.NIGHT_WITCH_POISON:
        this.resolveNight(game);
        return;
      default:
        throw new BadRequestException('Không thể bỏ qua lượt này.');
    }
  }

  private recalculateLoverFactions(game: GameState): void {
    const cupid = game.players.find(
      (player) => player.currentRole === Role.CUPID,
    );
    const paired = game.players.filter((player) => player.loverId);
    if (paired.length !== 2 || !cupid) return;
    const [first, second] = paired;
    if (
      first.currentRole === Role.FOOL ||
      second.currentRole === Role.FOOL
    ) {
      first.faction = Faction.LOVERS;
      second.faction = Faction.LOVERS;
      if (first.id !== cupid.id && second.id !== cupid.id)
        cupid.faction = Faction.VILLAGE;
      return;
    }
    if (first.id === cupid.id || second.id === cupid.id) {
      const partner = first.id === cupid.id ? second : first;
      cupid.faction = this.roleFaction(partner.currentRole);
      partner.faction = this.roleFaction(partner.currentRole);
      return;
    }
    const firstBaseFaction = this.roleFaction(first.currentRole);
    const secondBaseFaction = this.roleFaction(second.currentRole);
    if (
      firstBaseFaction === secondBaseFaction &&
      (firstBaseFaction === Faction.VILLAGE ||
        firstBaseFaction === Faction.WOLF)
    ) {
      first.faction = firstBaseFaction;
      second.faction = secondBaseFaction;
    } else {
      first.faction = Faction.LOVERS;
      second.faction = Faction.LOVERS;
    }
    cupid.faction = Faction.VILLAGE;
  }

  private checkWin(game: GameState): boolean {
    const alive = this.living(game);
    const lovers = alive.filter((player) => player.faction === Faction.LOVERS);
    if (
      lovers.length === 2 &&
      alive.length === 4 &&
      lovers[0].loverId === lovers[1].id
    ) {
      this.finish(
        game,
        [Faction.LOVERS],
        lovers.map((player) => player.id),
      );
      return true;
    }
    const wolfFaction = alive.filter(
      (player) => player.faction === Faction.WOLF,
    );
    if (wolfFaction.length === 0) {
      this.finish(game, [Faction.VILLAGE]);
      return true;
    }
    if (wolfFaction.length >= alive.length - wolfFaction.length) {
      this.finish(game, [Faction.WOLF]);
      return true;
    }
    return false;
  }

  private finish(
    game: GameState,
    factions: Faction[],
    winnerPlayerIds?: string[],
  ): void {
    game.phase = GamePhase.FINISHED;
    game.winners = factions;
    game.winnerPlayerIds =
      winnerPlayerIds ??
      this.living(game)
        .filter((player) => player.faction && factions.includes(player.faction))
        .map((player) => player.id);
  }

  private killWithLoverChain(game: GameState, playerId: string): void {
    const victim = this.player(game, playerId);
    if (!victim.alive) return;
    victim.alive = false;
    if (victim.loverId) this.killWithLoverChain(game, victim.loverId);
  }

  private roleFaction(role?: Role): Faction {
    if (role === Role.WOLF) return Faction.WOLF;
    if (role === Role.FOOL) return Faction.FOOL;
    return Faction.VILLAGE;
  }
  private factionLabel(faction?: Faction): string {
    if (faction === Faction.WOLF) return 'phe Sói';
    if (faction === Faction.FOOL) return 'phe Kẻ ngốc';
    if (faction === Faction.LOVERS) return 'phe Tình nhân độc lập';
    return 'phe Dân';
  }

  private livingRole(game: GameState, role: Role): GamePlayer[] {
    return this.living(game).filter((player) => player.currentRole === role);
  }
  private living(game: GameState): GamePlayer[] {
    return game.players.filter((player) => player.alive);
  }
  private executionVoters(game: GameState): GamePlayer[] {
    return this.living(game).filter(
      (player) => player.id !== game.dayState.scaffoldedId,
    );
  }
  private phaseHasLivingActor(game: GameState): boolean {
    const roleByPhase: Partial<Record<GamePhase, Role>> = {
      [GamePhase.NIGHT_GUARD]: Role.GUARD,
      [GamePhase.NIGHT_WOLF]: Role.WOLF,
      [GamePhase.NIGHT_SEER]: Role.SEER,
      [GamePhase.NIGHT_WITCH_HEAL]: Role.WITCH,
      [GamePhase.NIGHT_WITCH_POISON]: Role.WITCH,
    };
    const role = roleByPhase[game.phase];
    return role ? this.livingRole(game, role).length > 0 : false;
  }
  private isNightPhase(phase: GamePhase): boolean {
    return phase.startsWith('NIGHT_');
  }
  private player(game: GameState, id?: string): GamePlayer {
    const player = game.players.find((candidate) => candidate.id === id);
    if (!player) throw new BadRequestException('Không tìm thấy người chơi.');
    return player;
  }
  private livingPlayer(game: GameState, id?: string): GamePlayer {
    const player = this.player(game, id);
    if (!player.alive) throw new BadRequestException('Mục tiêu phải còn sống.');
    return player;
  }
  private requirePhase(game: GameState, phase: GamePhase): void {
    if (game.phase !== phase)
      throw new BadRequestException('Hành động không đúng giai đoạn của ván.');
  }
  private requireRole(player: GamePlayer, role: Role): void {
    if (player.currentRole !== role)
      throw new BadRequestException('Bạn không có quyền dùng hành động này.');
  }
}
