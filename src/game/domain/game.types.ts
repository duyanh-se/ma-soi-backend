export enum Role {
  VILLAGER = 'VILLAGER',
  WOLF = 'WOLF',
  SEER = 'SEER',
  GUARD = 'GUARD',
  FOOL = 'FOOL',
  CURSED = 'CURSED',
  WITCH = 'WITCH',
  CUPID = 'CUPID',
}

export enum Faction {
  VILLAGE = 'VILLAGE',
  WOLF = 'WOLF',
  LOVERS = 'LOVERS',
  FOOL = 'FOOL',
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  NIGHT_CUPID = 'NIGHT_CUPID',
  NIGHT_GUARD = 'NIGHT_GUARD',
  NIGHT_WOLF = 'NIGHT_WOLF',
  NIGHT_SEER = 'NIGHT_SEER',
  NIGHT_WITCH_HEAL = 'NIGHT_WITCH_HEAL',
  NIGHT_WITCH_POISON = 'NIGHT_WITCH_POISON',
  DAY_NOMINATION = 'DAY_NOMINATION',
  DAY_DEFENSE = 'DAY_DEFENSE',
  DAY_EXECUTION = 'DAY_EXECUTION',
  FINISHED = 'FINISHED',
}

export enum GameActionType {
  PAIR_LOVERS = 'PAIR_LOVERS',
  PROTECT = 'PROTECT',
  VOTE_WOLF_TARGET = 'VOTE_WOLF_TARGET',
  INSPECT = 'INSPECT',
  USE_HEAL = 'USE_HEAL',
  USE_POISON = 'USE_POISON',
  NOMINATE = 'NOMINATE',
  CAST_BLANK_NOMINATION = 'CAST_BLANK_NOMINATION',
  END_DEFENSE = 'END_DEFENSE',
  VOTE_EXECUTION = 'VOTE_EXECUTION',
  CAST_BLANK_EXECUTION = 'CAST_BLANK_EXECUTION',
}

export interface Inspection {
  night: number;
  targetId: string;
  result: 'WOLF' | 'NOT_WOLF';
}

export interface GuardHistoryEntry {
  night: number;
  targetId: string;
}

export interface PlayerState {
  cupidUsed: boolean;
  lastGuardedId?: string;
  healPotion: boolean;
  poisonPotion: boolean;
  inspections: Inspection[];
  guardHistory: GuardHistoryEntry[];
  convertedAtNight?: number;
  conversionAnnounced: boolean;
  notifications: string[];
}

export interface GamePlayer {
  id: string;
  name: string;
  alive: boolean;
  /** Public presence can lag behind actual death to avoid revealing a lover pair. */
  publicAlive?: boolean;
  pendingPublicDeath?: boolean;
  initialRole?: Role;
  currentRole?: Role;
  faction?: Faction;
  loverId?: string;
  state: PlayerState;
}

export interface NightState {
  protectedId?: string;
  wolfTargetId?: string;
  wolfVotes: Record<string, string>;
  healUsed: boolean;
  poisonTargetId?: string;
}

export interface DayState {
  nominationVotes: Record<string, string | null>;
  nominationRound: number;
  scaffoldedId?: string;
  executionVotes: Record<string, boolean | null>;
}

export interface GameState {
  id: string;
  hostId: string;
  roles: Role[];
  phase: GamePhase;
  night: number;
  players: GamePlayer[];
  nightState: NightState;
  dayState: DayState;
  publicEvents: string[];
  winners?: Faction[];
  winnerPlayerIds?: string[];
}

export interface PlayerAction {
  type: GameActionType;
  targetId?: string;
  targetIds?: string[];
  use?: boolean;
}
