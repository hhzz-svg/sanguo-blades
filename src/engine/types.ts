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

export type EnemyAction = 'approach' | 'windup' | 'attack' | 'recover' | 'stunned' | 'dead';

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
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  damage: number;
  facing: 1 | -1;
  action: EnemyAction;
  timer: number;
  cooldown: number;
  stun: number;
  knockback: number;
  flash: number;
  guard: boolean;
  phase: number;
  boss: boolean;
  telegraph: number;
  burn: number;
  slow: number;
  actionCount: number;
}

export interface FloatingNumber {
  x: number;
  y: number;
  value: number;
  crit: boolean;
  timer: number;
}

export interface GameState {
  heroId: HeroId;
  stageIndex: number;
  stageName: string;
  act: 1 | 2;
  time: number;
  player: PlayerState;
  enemies: EnemyState[];
  blessings: OwnedBlessings;
  blessingRerolls: number;
  waveIndex: number;
  waveCount: number;
  waveComplete: boolean;
  stageComplete: boolean;
  paused: boolean;
  gameOver: boolean;
  victory: boolean;
  kills: number;
  maxCombo: number;
  silver: number;
  cameraX: number;
  shake: number;
  hitstop: number;
  slowMotion: number;
  floatingNumbers: FloatingNumber[];
  events: string[];
}
