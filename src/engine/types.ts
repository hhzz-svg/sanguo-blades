import type { EnemyKind } from '../data/enemies';
import type { HeroId } from '../data/heroes';
import type { OwnedBlessings } from './blessings';

export interface TickInput {
  moveX?: number;
  moveY?: number;
  attack?: boolean;
  heavy?: boolean;
  dodge?: boolean;
  jump?: boolean;
  musou?: boolean;
  pause?: boolean;
  proceed?: boolean;
}

export type EnemyAction = 'approach' | 'windup' | 'attack' | 'recover' | 'stunned' | 'charging' | 'down' | 'dead';
export type EliteAffix = '狂暴' | '铁甲' | '嗜血';
export type BossPattern = 'lightning' | 'orbs' | 'summon' | 'teleport' | 'sweep' | 'charge' | 'slam';
export type TelegraphKind = 'strike' | 'lightning' | 'sweep' | 'charge' | 'slam' | 'orb' | 'teleport';

export interface ProjectileState {
  id: number;
  sourceId?: number;
  owner: 'player' | 'enemy';
  kind: 'arrow' | 'crescent' | 'orb';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  lifetime: number;
  depthTolerance: number;
  radius: number;
  hitIds: number[];
  critical: boolean;
}

export interface GroundTelegraph {
  id: number;
  owner: 'player' | 'enemy';
  kind: 'lightning' | 'shockwave';
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  timer: number;
  duration: number;
  damage: number;
  depthTolerance: number;
  hit: boolean;
  hitIds: number[];
}

export interface MusouSequence {
  heroId: HeroId;
  elapsed: number;
  nextHit: number;
  hits: number;
  startX: number;
  direction: 1 | -1;
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  attack: number;
  attackTimer: number;
  comboWindow: number;
  comboIndex: number;
  comboFinished: boolean;
  comboHits: number;
  comboTimer: number;
  comboDisplayTimer: number;
  invulnerability: number;
  dodgeTimer: number;
  hitFlash: number;
  snapTimer: number;
  dodgeCooldown: number;
  dodgeCharges: number;
  maxDodgeCharges: number;
  heavyCooldown: number;
  musou: number;
  stun: number;
  damageBoost: number;
  shield: number;
  airborne: boolean;
  jumpVelocity: number;
  lastAttackWasHeavy: boolean;
  pendingPlunge: boolean;
  counterReady: boolean;
  goldenArmorTimer: number;
  goldenArmorReady: boolean;
  attackSerial: number;
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  elite: boolean;
  affix: EliteAffix | null;
  x: number;
  y: number;
  z: number;
  vz: number;
  hp: number;
  maxHp: number;
  damage: number;
  facing: 1 | -1;
  action: EnemyAction;
  timer: number;
  cooldown: number;
  stun: number;
  downTimer: number;
  bounceCount: number;
  knockback: number;
  flash: number;
  guard: boolean;
  phase: number;
  boss: boolean;
  telegraph: number;
  burn: number;
  slow: number;
  actionCount: number;
  telegraphKind: TelegraphKind | null;
  pattern: BossPattern | null;
  patternHistory: BossPattern[];
  phaseComboStep: number;
  chargeRemaining: number;
  chargeDirection: 1 | -1;
  chargeHitPlayer: boolean;
  chargeDodged: boolean;
}

export interface FloatingNumber {
  x: number;
  y: number;
  value: number;
  crit: boolean;
  timer: number;
  label?: string;
}

export interface GameState {
  heroId: HeroId;
  stageIndex: number;
  stageName: string;
  act: 1 | 2;
  time: number;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  groundTelegraphs: GroundTelegraph[];
  musouSequence: MusouSequence | null;
  blessings: OwnedBlessings;
  blessingRerolls: number;
  waveIndex: number;
  waveCount: number;
  waveComplete: boolean;
  waveClearTimer: number;
  stageComplete: boolean;
  paused: boolean;
  gameOver: boolean;
  victory: boolean;
  kills: number;
  maxCombo: number;
  silver: number;
  cameraX: number;
  shake: number;
  arenaStartX: number;
  arenaEndX: number;
  nextWaveX: number;
  stageEndX: number;
  hitstop: number;
  slowMotion: number;
  floatingNumbers: FloatingNumber[];
  events: string[];
}
