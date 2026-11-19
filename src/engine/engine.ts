import { ENEMIES, WAVE_COMPOSITIONS, type EnemyKind } from '../data/enemies';
import { getHero, type HeroId } from '../data/heroes';
import { STAGES } from '../data/stages';
import { addBlessing } from './blessings';
import { composeDamage, resolveGuardedDamage } from './damage';
import { SeededRandom } from './random';
import type { EnemyState, GameState, PlayerState, TickInput } from './types';

export const FIXED_DT = 1 / 60;
const STAGE_WIDTH = 3200;
const GROUND_MIN = 430;
const GROUND_MAX = 650;

export interface EngineOptions {
  heroId?: HeroId;
  seed?: number;
  stageIndex?: number;
  talents?: Record<string, number>;
}

export class GameEngine {
  readonly state: GameState;
  readonly random: SeededRandom;
  readonly attackHistory: number[] = [];
  readonly afterimages: Array<{ x: number; y: number; timer: number }> = [];
  private nextEnemyId = 1;
  private wasPaused = false;
  private talentDamageBonus: number;
  private talentMusouBonus: number;

  constructor(options: EngineOptions = {}) {
    const heroId = options.heroId ?? 'zhaoyun';
    const hero = getHero(heroId);
    const stageIndex = Math.max(0, Math.min(STAGES.length - 1, options.stageIndex ?? 0));
    this.random = new SeededRandom(options.seed ?? 1);
    this.talentDamageBonus = (options.talents?.might ?? 0) * 0.05;
    this.talentMusouBonus = (options.talents?.resolve ?? 0) * 0.08;
    const maxHp = hero.hp * (1 + (options.talents?.vitality ?? 0) * 0.06);
    const player: PlayerState = {
      x: 280,
      y: 550,
      z: 0,
      vx: 0,
      vz: 0,
      facing: 1,
      hp: maxHp,
      maxHp,
      attack: hero.attack,
      attackTimer: 0,
      comboWindow: 0,
      comboIndex: 0,
      comboFinished: false,
      comboHits: 0,
      comboTimer: 0,
      comboDisplayTimer: 0,
      invulnerability: 0,
      dodgeCooldown: 0,
      dodgeCharges: hero.dodges,
      maxDodgeCharges: hero.dodges,
      heavyCooldown: 0,
      musou: 0,
      stun: 0,
      damageBoost: 0,
      shield: (options.talents?.guard ?? 0) * 0.1,
      airborne: false,
      jumpVelocity: 0,
      lastAttackWasHeavy: false,
      pendingPlunge: false,
      counterReady: false,
      goldenArmorTimer: 0,
      goldenArmorReady: false,
    };
    const stage = STAGES[stageIndex]!;
    this.state = {
      heroId,
      stageIndex,
      stageName: stage.name,
      act: stage.act,
      time: 0,
      player,
      enemies: [],
      blessings: {},
      blessingRerolls: Math.floor((options.talents?.adapt ?? 0) / 2),
      waveIndex: 0,
      waveCount: stage.boss ? 1 : stageWaves(stageIndex).length,
      waveComplete: false,
      stageComplete: false,
      paused: false,
      gameOver: false,
      victory: false,
      kills: 0,
      maxCombo: 0,
      silver: 0,
      cameraX: 0,
      shake: 0,
      hitstop: 0,
      slowMotion: 0,
      floatingNumbers: [],
      events: [],
    };
    this.spawnCurrentWave();
  }

  tick(input: TickInput = {}): GameState {
    const state = this.state;
    if (input.pause && !this.wasPaused && !state.gameOver) state.paused = !state.paused;
    this.wasPaused = input.pause ?? false;
    if (state.paused || state.gameOver) return state;

    const dt = FIXED_DT * (state.slowMotion > 0 ? 0.3 : 1);
    state.time += dt;
    state.shake = Math.max(0, state.shake - FIXED_DT * 3.5);
    state.hitstop = Math.max(0, state.hitstop - FIXED_DT);
    state.slowMotion = Math.max(0, state.slowMotion - FIXED_DT);
    this.updateTransientState(FIXED_DT);
    if (state.hitstop > 0) return state;

    this.updatePlayer(input, dt);
    this.updateEnemies(dt);
    this.updateFloatingNumbers(dt);
    this.updateStage(input);
    state.cameraX = Math.max(0, Math.min(STAGE_WIDTH - 1280, state.player.x - 440));
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.gameOver = true;
      state.events.push('战败');
    }
    this.assertFiniteState();
    return state;
  }

  pickBlessing(id: string): number {
    const level = addBlessing(this.state.blessings, id);
    if (id === 'tiewi') {
      this.state.player.maxHp += 15;
      this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 15);
    }
    if (id === 'canying') {
      this.state.player.maxDodgeCharges += 1;
      this.state.player.dodgeCharges = Math.min(this.state.player.maxDodgeCharges, this.state.player.dodgeCharges + 1);
    }
    if (id === 'jinjia') this.state.player.goldenArmorReady = true;
    return level;
  }

  grantMusou(amount: number): void {
    const bonus = 1 + (this.state.blessings.xushi ?? 0) * 0.25 + this.talentMusouBonus;
    this.state.player.musou = Math.max(0, Math.min(100, this.state.player.musou + amount * bonus));
  }

  advanceStage(): void {
    if (!this.state.stageComplete) return;
    if (this.state.stageIndex >= STAGES.length - 1) {
      this.state.victory = true;
      this.state.gameOver = true;
      this.state.events.push('大获全胜');
      return;
    }
    this.state.stageIndex += 1;
    const stage = STAGES[this.state.stageIndex]!;
    this.state.stageName = stage.name;
    this.state.act = stage.act;
    this.state.stageComplete = false;
    this.state.waveComplete = false;
    this.state.waveIndex = 0;
    this.state.waveCount = stage.boss ? 1 : stageWaves(this.state.stageIndex).length;
    this.state.player.x = Math.max(280, Math.min(this.state.player.x, 1000));
    this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + this.state.player.maxHp * 0.12);
    this.state.player.dodgeCharges = this.state.player.maxDodgeCharges;
    this.spawnCurrentWave();
  }

  private updatePlayer(input: TickInput, dt: number): void {
    const player = this.state.player;
    const hero = getHero(this.state.heroId);
    player.invulnerability = Math.max(0, player.invulnerability - dt);
    player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
    player.heavyCooldown = Math.max(0, player.heavyCooldown - dt);
    player.attackTimer = Math.max(0, player.attackTimer - dt);
    player.comboWindow = Math.max(0, player.comboWindow - dt);
    if (player.comboWindow === 0) {
      player.comboIndex = 0;
      player.comboFinished = false;
    }
    player.comboDisplayTimer = Math.max(0, player.comboDisplayTimer - dt);
    player.damageBoost = Math.max(0, player.damageBoost - dt);
    player.stun = Math.max(0, player.stun - dt);
    if (this.state.blessings.jinjia) {
      player.goldenArmorTimer -= dt;
      if (player.goldenArmorTimer <= 0) {
        player.goldenArmorReady = true;
        player.goldenArmorTimer = 10;
      }
    }
    const dodgedThreat = input.dodge && player.dodgeCharges > 0 && player.dodgeCooldown === 0
      && this.state.enemies.some((enemy) => enemy.telegraph > 0 && Math.abs(enemy.x - player.x) < 230);
    player.jumpVelocity -= 620 * dt;
    player.z = Math.max(0, player.z + player.jumpVelocity * dt);
    if (player.z === 0) {
      const landedFromAir = player.airborne;
      player.airborne = false;
      player.jumpVelocity = 0;
      if (landedFromAir && player.pendingPlunge) {
        player.pendingPlunge = false;
        this.hitEnemies((enemy) => Math.hypot(enemy.x - player.x, (enemy.y - player.y) * 1.4) <= 200,
          this.playerDamage({ base: player.attack, skillMultiplier: 2.4 }), { heavy: true, knockback: 260, stun: 0.8 });
        this.state.events.push('落地重击');
      }
    }

    if (input.moveX && Math.abs(input.moveX) > 0.1) player.facing = input.moveX > 0 ? 1 : -1;
    if (input.dodge && player.dodgeCharges > 0 && player.dodgeCooldown === 0) {
      const direction = input.moveX && Math.abs(input.moveX) > 0.1 ? Math.sign(input.moveX) : player.facing;
      player.x += direction * 205;
      player.x = clamp(player.x, 0, STAGE_WIDTH);
      player.invulnerability = 0.22;
      player.dodgeCooldown = 0.65;
      player.dodgeCharges -= 1;
      this.afterimages.push({ x: player.x, y: player.y - player.z, timer: 0.32 });
      this.state.events.push('闪避');
      if (dodgedThreat) {
        this.state.slowMotion = 0.6;
        this.grantMusou(12);
        this.state.events.push('刹那');
      }
      if (this.state.blessings.fanjia) player.counterReady = true;
      if (this.state.heroId === 'zhaoyun') {
        player.heavyCooldown = 0;
        player.damageBoost = 2;
      }
    }

    if (player.stun <= 0) {
      const speedMultiplier = 1 + (this.state.blessings.jifeng ?? 0) * 0.1;
      const speed = hero.speed * speedMultiplier;
      player.vx = (input.moveX ?? 0) * speed;
      player.vz = (input.moveY ?? 0) * speed * 0.58;
      player.x = clamp(player.x + player.vx * dt, 0, STAGE_WIDTH);
      player.y = clamp(player.y + player.vz * dt, GROUND_MIN, GROUND_MAX);
      if (input.jump && !player.airborne) {
        player.airborne = true;
        player.jumpVelocity = 345;
      }
      if (input.attack && player.attackTimer <= 0) this.lightAttack();
      if (input.heavy && player.heavyCooldown <= 0) this.heavyAttack();
      if (input.musou && player.musou >= 100) this.musouAttack();
    }
  }

  private lightAttack(): void {
    const { player, heroId } = this.state;
    if (player.comboWindow <= 0 || player.comboFinished) {
      player.comboIndex = 0;
      player.comboFinished = false;
    }
    const attackIndex = player.comboIndex;
    this.attackHistory.push(attackIndex);
    player.comboIndex = Math.min(4, attackIndex + 1);
    player.comboFinished = attackIndex === 4;
    player.comboWindow = 0.45;
    player.attackTimer = 0.23 * (1 - (this.state.blessings.jifeng ?? 0) * 0.08);
    player.lastAttackWasHeavy = false;
    player.comboDisplayTimer = 2.5;
    const airborne = player.airborne;
    const attackRange = heroId === 'guanyu' ? 150 : getHero(heroId).range;
    const damage = this.playerDamage({
      base: player.attack,
      skillMultiplier: airborne ? 1.25 : [1, 1.05, 1.15, 1.45, 1.9][attackIndex]!,
    });
    this.hitEnemies((enemy) => {
      const hit = Math.abs(enemy.y - player.y) <= 78
        && (enemy.x - player.x) * player.facing >= -18
        && Math.abs(enemy.x - player.x) <= attackRange + (enemy.boss ? 30 : 0)
        && (!enemy.z || player.airborne);
      return hit;
    }, damage, { heavy: false, knockback: attackIndex === 4 ? 250 : 80, launch: attackIndex === 3 });
    if (attackIndex === 4 && this.state.blessings.lianhuan) {
      this.hitEnemies((enemy) => Math.abs(enemy.x - player.x) <= attackRange + 38
        && Math.abs(enemy.y - player.y) <= 90, damage * 0.45, { heavy: false, knockback: 120 });
    }
    if (airborne) this.state.events.push('空中斩');
  }

  private heavyAttack(): void {
    const { player, heroId } = this.state;
    const hero = getHero(heroId);
    player.attackTimer = 0.54;
    player.heavyCooldown = hero.heavyCooldown * (1 - (this.state.blessings.qinggang ?? 0) * 0.15);
    player.lastAttackWasHeavy = true;
    if (player.airborne) {
      player.pendingPlunge = true;
      player.jumpVelocity = -620;
      return;
    }
    if (heroId === 'zhaoyun') {
      player.x = clamp(player.x + player.facing * 260, 0, STAGE_WIDTH);
      this.hitEnemies((enemy) => Math.abs(enemy.y - player.y) <= 88
        && (enemy.x - player.x) * player.facing >= -260 && (enemy.x - player.x) * player.facing <= 300,
      this.playerDamage({ base: player.attack, skillMultiplier: 2.2 }), { heavy: true, knockback: 180, stun: 0.45 });
    } else if (heroId === 'guanyu') {
      this.hitEnemies((enemy) => Math.abs(enemy.y - player.y) <= 105
        && (enemy.x - player.x) * player.facing >= -20 && (enemy.x - player.x) * player.facing <= 600,
      this.playerDamage({ base: player.attack, skillMultiplier: 3 }), { heavy: true, knockback: 240 });
    } else {
      this.hitEnemies((enemy) => Math.hypot(enemy.x - player.x, (enemy.y - player.y) * 1.5) <= 220,
      this.playerDamage({ base: player.attack, skillMultiplier: 1.5 }), { heavy: true, knockback: 320, stun: 1.5 });
    }
    this.state.events.push(hero.heavy);
  }

  private musouAttack(): void {
    const player = this.state.player;
    player.musou = 0;
    player.invulnerability = 2.8;
    player.attackTimer = 1.2;
    const multiplier = this.state.heroId === 'zhaoyun' ? 10.8 : this.state.heroId === 'guanyu' ? 10.5 : 9;
    const range = this.state.heroId === 'guanyu' ? 1120 : this.state.heroId === 'zhaoyun' ? 800 : 520;
    this.hitEnemies((enemy) => Math.abs(enemy.x - player.x) <= range
      && Math.abs(enemy.y - player.y) <= (this.state.heroId === 'zhangfei' ? 200 : 150),
    this.playerDamage({ base: player.attack, skillMultiplier: multiplier * (1 + (this.state.blessings.wushuang ?? 0) * 0.3) }),
    { heavy: true, knockback: 300, stun: 1.2 });
    this.state.events.push(getHero(this.state.heroId).ultimate);
  }

  private playerDamage(factors: Parameters<typeof composeDamage>[0]): number {
    const player = this.state.player;
    const hero = getHero(this.state.heroId);
    const isCritical = this.state.heroId === 'guanyu' && this.random.next() < 0.15
      || this.random.next() < (this.state.blessings.huixin ?? 0) * 0.08;
    const rankBonus = comboRankBonus(player.comboHits);
    const lowHealthBonus = player.hp / player.maxHp < 0.4 ? this.state.blessings.beishui ? 0.3 : 0 : 0;
    const blessingBonus = (this.state.blessings.pojun ?? 0) * 0.12
      + (this.state.blessings.tianming ?? 0) * 0.08
      + this.talentDamageBonus
      + (player.damageBoost > 0 ? 0.2 : 0);
    const counterMultiplier = player.counterReady ? 2 : 1;
    player.counterReady = false;
    return composeDamage({
      ...factors,
      base: factors.base * counterMultiplier,
      critical: factors.critical ?? isCritical,
      criticalMultiplier: hero.id === 'guanyu' ? 2.2 : 1.5,
      blessingBonus: (factors.blessingBonus ?? 0) + blessingBonus,
      comboRankBonus: (factors.comboRankBonus ?? 0) + rankBonus,
      lowHealthBonus: (factors.lowHealthBonus ?? 0) + lowHealthBonus,
    });
  }

  private hitEnemies(
    predicate: (enemy: EnemyState) => boolean,
    damage: number,
    options: { heavy: boolean; knockback: number; stun?: number; launch?: boolean },
  ): void {
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0 || !predicate(enemy)) continue;
      const frontal = (this.state.player.x - enemy.x) * enemy.facing > 0;
      const result = resolveGuardedDamage(damage, { shield: enemy.guard, frontal, heavy: options.heavy });
      if (result.guardBroken) {
        enemy.guard = false;
        enemy.stun = Math.max(enemy.stun, 1.2);
        this.state.events.push('破防');
      } else if (result.guarded) {
        this.state.events.push('格挡');
      }
      enemy.hp -= result.damage;
      this.state.player.comboHits += 1;
      this.state.player.comboTimer = 2.5;
      this.state.player.comboDisplayTimer = 2.5;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.player.comboHits);
      enemy.flash = 0.13;
      enemy.knockback = Math.max(enemy.knockback, options.knockback);
      enemy.facing = this.state.player.facing;
      enemy.stun = Math.max(enemy.stun, options.stun ?? 0.18);
      if (options.launch && !enemy.boss) enemy.z = Math.max(enemy.z, 48);
      this.grantMusou(Math.min(4, result.damage * 0.035));
      if (this.state.blessings.hanbing) enemy.slow = 3;
      if (!options.heavy && this.state.blessings.huoji) enemy.burn = Math.max(enemy.burn, 3);
      if (options.heavy && this.state.blessings.tianlei) {
        const chainLimit = this.state.blessings.tianlei >= 3 ? 2 : 1;
        const nearby = this.state.enemies
          .filter((candidate) => candidate !== enemy && candidate.hp > 0 && Math.abs(candidate.x - enemy.x) <= 240)
          .slice(0, chainLimit);
        for (const chained of nearby) {
          chained.hp -= result.damage * 0.18;
          chained.flash = 0.13;
          this.state.floatingNumbers.push({ x: chained.x, y: chained.y - 60, value: Math.round(result.damage * 0.18), crit: false, timer: 0.8 });
          if (chained.hp <= 0) this.killEnemy(chained);
        }
      }
      this.state.floatingNumbers.push({
        x: enemy.x,
        y: enemy.y - (enemy.boss ? 120 : 60),
        value: Math.max(1, Math.round(result.damage)),
        crit: result.damage >= this.state.player.attack * 1.6,
        timer: 0.9,
      });
      this.state.shake = Math.max(this.state.shake, options.heavy ? 0.65 : 0.25);
      this.state.hitstop = Math.max(this.state.hitstop, options.heavy ? 0.08 : 0.045);
      if (enemy.boss && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5 && enemy.phase === 1) {
        enemy.phase = 2;
        this.state.events.push('狂怒');
      }
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
  }

  private updateEnemies(dt: number): void {
    const player = this.state.player;
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.telegraph = Math.max(0, enemy.telegraph - dt);
      enemy.burn = Math.max(0, enemy.burn - dt);
      enemy.slow = Math.max(0, enemy.slow - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      if (enemy.burn > 0 && Math.floor(this.state.time * 4) !== Math.floor((this.state.time - dt) * 4)) {
        enemy.hp -= 1 + (this.state.blessings.liehuo ?? 0);
      }
      if (enemy.z > 0) enemy.z = Math.max(0, enemy.z - 170 * dt);
      if (enemy.knockback > 0) {
        enemy.x = clamp(enemy.x + enemy.facing * enemy.knockback * dt, 0, STAGE_WIDTH);
        enemy.knockback = Math.max(0, enemy.knockback - 500 * dt);
      }
      if (enemy.stun > 0) {
        enemy.action = 'stunned';
        continue;
      }
      enemy.facing = player.x >= enemy.x ? 1 : -1;
      enemy.cooldown -= dt;
      const distance = Math.abs(player.x - enemy.x);
      const baseSpeed = ENEMIES[enemy.kind].speed * (enemy.phase === 2 ? 1.35 : 1);
      if (enemy.action === 'windup') {
        enemy.timer -= dt * (enemy.phase === 2 ? 1.3 : 1);
        if (enemy.timer <= 0) {
          this.enemyStrike(enemy, enemy.boss);
          enemy.action = 'recover';
          enemy.timer = enemy.boss ? 0.75 : 0.8;
          enemy.telegraph = 0;
        }
      } else if (enemy.action === 'recover') {
        enemy.timer -= dt;
        if (enemy.timer <= 0) enemy.action = 'approach';
      } else if (enemy.action === 'attack') {
        enemy.action = 'approach';
      } else {
        const targetDistance = enemy.kind === 'archer' ? 420 : enemy.boss ? ENEMIES[enemy.kind].range : ENEMIES[enemy.kind].range;
        if (enemy.kind === 'archer' && distance < 320) {
          enemy.x = clamp(enemy.x - enemy.facing * baseSpeed * dt, 0, STAGE_WIDTH);
        } else if (distance > targetDistance + 10) {
          const speed = baseSpeed * (enemy.slow > 0 ? 0.7 : 1);
          enemy.x = clamp(enemy.x + enemy.facing * speed * dt, 0, STAGE_WIDTH);
        } else if (enemy.cooldown <= 0) {
          enemy.action = 'windup';
          enemy.timer = enemy.boss ? 0.8 : enemy.kind === 'cavalry' ? 0.8 : 0.5;
          enemy.telegraph = enemy.timer;
          this.state.events.push('敌军蓄势');
        }
      }
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
  }

  private enemyStrike(enemy: EnemyState, boss: boolean): void {
    const player = this.state.player;
    const dist = Math.abs(player.x - enemy.x);
    const bossAttackRange = enemy.kind === 'zhangjiao' ? 315 : 205;
    const hitRange = boss ? bossAttackRange : enemy.kind === 'archer' ? 650 : enemy.kind === 'cavalry' ? 220 : 105;
    if (dist <= hitRange && Math.abs(player.y - enemy.y) <= (boss ? 160 : 86) && player.invulnerability <= 0) {
      if (this.state.blessings.jinjia && player.goldenArmorReady) {
        player.goldenArmorReady = false;
        player.goldenArmorTimer = 10;
        this.state.events.push('金甲');
        enemy.cooldown = boss ? 2.2 : enemy.kind === 'cavalry' ? 1.8 : 1.4;
        enemy.action = 'attack';
        return;
      }
      const reduced = this.state.heroId === 'zhangfei' ? 0.8 : 1;
      const damage = enemy.damage * reduced * (1 - Math.min(0.6, player.shield));
      player.hp -= damage;
      this.grantMusou(damage * 0.8);
      player.invulnerability = 0.38;
      this.state.shake = Math.max(this.state.shake, 0.5);
      this.state.hitstop = Math.max(this.state.hitstop, 0.055);
      this.state.floatingNumbers.push({ x: player.x, y: player.y - 52, value: -Math.round(damage), crit: false, timer: 0.8 });
      this.state.events.push('受击');
    }
    enemy.actionCount += 1;
    if (enemy.kind === 'zhangjiao') {
      if (enemy.actionCount % 2 === 0 && this.state.enemies.filter((candidate) => !candidate.boss).length < 5) {
        for (let index = 0; index < 3; index += 1) {
          this.addEnemy('saber', clamp(enemy.x + (index - 1) * 55, 0, STAGE_WIDTH), enemy.y + this.random.range(-55, 55));
        }
        this.state.events.push('召唤黄巾');
      }
      if (enemy.actionCount % 3 === 0) {
        enemy.x = clamp(player.x + this.random.range(-260, 260), 180, STAGE_WIDTH - 180);
        this.state.events.push('天公瞬移');
      }
    } else if (enemy.kind === 'lvbu') {
      this.state.events.push(enemy.phase === 2 ? '飞将连击' : '方天横扫');
    }
    enemy.cooldown = boss ? 2.2 : enemy.kind === 'cavalry' ? 1.8 : 1.4;
    enemy.action = 'attack';
  }

  private killEnemy(enemy: EnemyState): void {
    if (enemy.action === 'dead') return;
    enemy.hp = 0;
    enemy.action = 'dead';
    this.state.kills += 1;
    this.state.silver += enemy.boss ? 50 : this.random.integer(1, 4);
    if (this.state.blessings.huichun) {
      this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + this.state.player.maxHp * 0.02);
    }
    this.state.events.push('击破');
    if ((this.state.blessings.huoji ?? 0) >= 3 && enemy.burn > 0) {
      for (const nearby of this.state.enemies) {
        if (nearby !== enemy && Math.abs(nearby.x - enemy.x) <= 180) nearby.burn = Math.max(nearby.burn, 3);
      }
    }
    this.state.enemies = this.state.enemies.filter((candidate) => candidate !== enemy);
  }

  private updateStage(input: TickInput): void {
    if (this.state.enemies.length === 0 && !this.state.stageComplete) {
      if (this.state.waveIndex + 1 < this.state.waveCount) {
        this.state.waveIndex += 1;
        this.spawnCurrentWave();
      } else {
        this.state.waveComplete = true;
        if (this.state.player.x >= STAGE_WIDTH - 160 || input.proceed) {
          this.state.stageComplete = true;
          this.state.events.push('关卡完成');
        }
      }
    }
    if (input.proceed && this.state.stageComplete) this.advanceStage();
  }

  private spawnCurrentWave(): void {
    const stage = STAGES[this.state.stageIndex]!;
    this.state.enemies = [];
    if (stage.boss) {
      this.addEnemy(stage.boss, 830, this.state.player.y);
      return;
    }
    const compositions = WAVE_COMPOSITIONS[this.state.stageIndex >= 2 ? 1 : 0]!;
    const composition = compositions[this.state.waveIndex % compositions.length]!;
    const difficulty = 1 + this.state.stageIndex * 0.12;
    composition.forEach((kind, index) => {
      const actualKind: EnemyKind = kind === 'elite' ? 'elite' : kind;
      this.addEnemy(actualKind, 610 + index * 65 + this.random.range(-18, 18), GROUND_MIN + this.random.range(24, 205), difficulty);
    });
  }

  private addEnemy(kind: EnemyKind, x: number, y: number, difficulty = 1): void {
    const definition = ENEMIES[kind];
    const boss = definition.boss ?? false;
    const hpMultiplier = boss ? 1 + this.state.stageIndex * 0.12 : difficulty;
    const damageMultiplier = 1 + this.state.stageIndex * 0.08;
    const scaledHp = definition.hp * hpMultiplier * (kind === 'elite' ? 2.5 : 1);
    this.state.enemies.push({
      id: this.nextEnemyId++,
      kind,
      x,
      y,
      z: 0,
      hp: scaledHp,
      maxHp: scaledHp,
      damage: definition.damage * damageMultiplier,
      facing: -1,
      action: 'approach',
      timer: 0,
      cooldown: this.random.range(0.3, 1.2),
      stun: 0,
      knockback: 0,
      flash: 0,
      guard: kind === 'shield',
      phase: 1,
      boss,
      telegraph: 0,
      burn: 0,
      slow: 0,
      actionCount: 0,
    });
  }

  private updateTransientState(dt: number): void {
    for (const image of this.afterimages) image.timer -= dt;
    this.removeExpiredAfterimages();
    if (this.state.player.comboTimer > 0) {
      this.state.player.comboTimer = Math.max(0, this.state.player.comboTimer - dt);
      if (this.state.player.comboTimer === 0) this.state.player.comboHits = 0;
    }
  }

  private updateFloatingNumbers(dt: number): void {
    this.state.floatingNumbers = this.state.floatingNumbers.filter((number) => {
      number.timer -= dt;
      number.y -= 22 * dt;
      return number.timer > 0;
    });
  }

  private removeExpiredAfterimages(): void {
    for (let index = this.afterimages.length - 1; index >= 0; index -= 1) {
      if (this.afterimages[index]!.timer <= 0) this.afterimages.splice(index, 1);
    }
  }

  private assertFiniteState(): void {
    const { player, enemies } = this.state;
    const values = [player.x, player.y, player.z, player.hp, player.musou, ...enemies.flatMap((enemy) => [enemy.x, enemy.y, enemy.hp])];
    if (!values.every(Number.isFinite)) throw new Error('Game state contains a non-finite number');
  }
}

export function comboRankBonus(hits: number): number {
  if (hits >= 100) return 0.25;
  if (hits >= 60) return 0.15;
  if (hits >= 30) return 0.1;
  if (hits >= 10) return 0.05;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stageWaves(stageIndex: number): EnemyKind[][] {
  return WAVE_COMPOSITIONS[stageIndex >= 2 ? 1 : 0]!;
}
