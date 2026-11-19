import { ENEMIES, type EnemyKind } from '../data/enemies';
import { getHero, type HeroId } from '../data/heroes';
import { STAGES } from '../data/stages';
import { addBlessing } from './blessings';
import { composeDamage, resolveGuardedDamage } from './damage';
import { SeededRandom } from './random';
import type {
  BossPattern,
  EnemyState,
  GameState,
  GroundTelegraph,
  PlayerState,
  ProjectileState,
  TickInput,
} from './types';

export const FIXED_DT = 1 / 60;
const ARENA_SPACING = 900;
const ARENA_WIDTH = 900;
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
  private nextProjectileId = 1;
  private nextTelegraphId = 1;
  private wasPaused = false;
  private talentDamageBonus: number;
  private talentMusouBonus: number;
  private lastDamageWasCritical = false;

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
      dodgeTimer: 0,
      hitFlash: 0,
      snapTimer: 0,
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
      attackSerial: 0,
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
      projectiles: [],
      groundTelegraphs: [],
      musouSequence: null,
      blessings: {},
      blessingRerolls: Math.floor((options.talents?.adapt ?? 0) / 2),
      waveIndex: 0,
      waveCount: stage.boss ? 1 : stage.waves!.length,
      waveComplete: false,
      waveClearTimer: 0,
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
      arenaStartX: 0,
      arenaEndX: ARENA_WIDTH,
      nextWaveX: ARENA_SPACING,
      stageEndX: stageEnd(stageIndex),
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
    this.updateMusou(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGroundTelegraphs(dt);
    this.updateFloatingNumbers(dt);
    this.updateStage(input);
    state.cameraX = state.waveComplete
      ? clamp(state.player.x - 440, 0, Math.max(0, state.stageEndX - 1280))
      : clamp(state.arenaStartX - 200, 0, Math.max(0, state.stageEndX - 1280));
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
    this.state.waveCount = stage.boss ? 1 : stage.waves!.length;
    this.state.arenaStartX = 0;
    this.state.arenaEndX = ARENA_WIDTH;
    this.state.nextWaveX = ARENA_SPACING;
    this.state.stageEndX = stageEnd(this.state.stageIndex);
    this.state.waveClearTimer = 0;
    this.state.player.x = 280;
    this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + this.state.player.maxHp * 0.12);
    this.state.player.dodgeCharges = this.state.player.maxDodgeCharges;
    this.state.projectiles = [];
    this.state.groundTelegraphs = [];
    this.state.musouSequence = null;
    this.spawnCurrentWave();
  }

  private updatePlayer(input: TickInput, dt: number): void {
    const player = this.state.player;
    const hero = getHero(this.state.heroId);
    player.invulnerability = Math.max(0, player.invulnerability - dt);
    player.dodgeTimer = Math.max(0, player.dodgeTimer - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);
    player.snapTimer = Math.max(0, player.snapTimer - dt);
    player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
    if (player.dodgeCharges < player.maxDodgeCharges && player.dodgeCooldown === 0) player.dodgeCharges += 1;
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
    if (this.state.musouSequence) {
      player.vx = 0;
      player.vz = 0;
      return;
    }
    const dodgedThreat = input.dodge && player.dodgeCharges > 0 && player.dodgeCooldown === 0
      && (this.state.enemies.some((enemy) => enemy.telegraph > 0 && Math.abs(enemy.x - player.x) < 230)
        || this.isThreateningPlayer(0.15)
        || this.state.groundTelegraphs.some((telegraph) => telegraph.owner === 'enemy'
          && telegraph.duration - telegraph.timer <= 0.15
          && Math.hypot(telegraph.x - player.x, (telegraph.y - player.y) * 1.4) <= telegraph.maxRadius));
    player.jumpVelocity -= 620 * dt;
    player.z = Math.max(0, player.z + player.jumpVelocity * dt);
    if (player.z === 0) {
      const landedFromAir = player.airborne;
      player.airborne = false;
      player.jumpVelocity = 0;
      if (landedFromAir) this.state.events.push('落地');
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
      player.x = clamp(player.x, this.state.arenaStartX + 20, this.state.waveComplete ? this.state.stageEndX : this.state.arenaEndX);
      player.invulnerability = 0.22;
      player.dodgeTimer = 0.22;
      player.dodgeCooldown = 0.65;
      player.dodgeCharges -= 1;
      this.afterimages.push({ x: player.x, y: player.y - player.z, timer: 0.32 });
      this.state.events.push('闪避');
      if (dodgedThreat) {
        this.state.slowMotion = 0.6;
        player.snapTimer = 0.75;
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
      player.x = clamp(player.x + player.vx * dt, this.state.arenaStartX + 20, this.state.waveComplete ? this.state.stageEndX : this.state.arenaEndX);
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
    player.attackSerial += 1;
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
    }, damage, {
      heavy: false,
      knockback: attackIndex === 4 ? 250 : 80,
      launch: attackIndex === 3,
      critical: this.lastDamageWasCritical,
    });
    this.state.events.push(`combo-hit:${attackIndex}`);
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
    player.attackSerial += 1;
    player.heavyCooldown = hero.heavyCooldown * (1 - (this.state.blessings.qinggang ?? 0) * 0.15);
    player.lastAttackWasHeavy = true;
    if (player.airborne) {
      player.pendingPlunge = true;
      player.jumpVelocity = -620;
      return;
    }
    if (heroId === 'zhaoyun') {
      const oldX = player.x;
      player.x = clamp(player.x + player.facing * 260, this.state.arenaStartX + 20, this.state.arenaEndX);
      this.hitEnemies((enemy) => Math.abs(enemy.y - player.y) <= 88
        && (enemy.x - oldX) * player.facing >= -20 && (enemy.x - player.x) * player.facing <= 300,
      this.playerDamage({ base: player.attack, skillMultiplier: 2.2 }), { heavy: true, knockback: 180, stun: 0.45, critical: this.lastDamageWasCritical });
    } else if (heroId === 'guanyu') {
      const damage = this.playerDamage({ base: player.attack, skillMultiplier: 3 });
      this.spawnProjectile({
        owner: 'player',
        kind: 'crescent',
        x: player.x + player.facing * 45,
        y: player.y,
        z: 80,
        vx: player.facing * 960,
        vy: 0,
        damage,
        pierce: 20,
        lifetime: 0.64,
        depthTolerance: 105,
        radius: 34,
        critical: this.lastDamageWasCritical,
      });
    } else {
      this.hitEnemies((enemy) => Math.hypot(enemy.x - player.x, (enemy.y - player.y) * 1.5) <= 220,
      this.playerDamage({ base: player.attack, skillMultiplier: 1.5 }), { heavy: true, knockback: 320, stun: 1.5, critical: this.lastDamageWasCritical });
    }
    this.state.events.push('重击特效');
    this.state.events.push(hero.heavy);
  }

  private musouAttack(): void {
    const player = this.state.player;
    player.musou = 0;
    player.invulnerability = 1.95;
    player.attackTimer = 1.95;
    player.attackSerial += 1;
    player.lastAttackWasHeavy = true;
    this.state.musouSequence = {
      heroId: this.state.heroId,
      elapsed: 0,
      nextHit: 0,
      hits: 0,
      startX: player.x,
      direction: player.facing,
    };
    this.state.events.push('无双开始');
    this.state.events.push(getHero(this.state.heroId).ultimate);
  }

  private updateMusou(dt: number): void {
    const sequence = this.state.musouSequence;
    if (!sequence) return;
    const player = this.state.player;
    sequence.elapsed += dt;
    const interval = sequence.heroId === 'guanyu' ? 0.4 : sequence.heroId === 'zhangfei' ? 0.45 : 0.36;
    while (sequence.hits < 6 && sequence.elapsed >= sequence.nextHit) {
      const hitIndex = sequence.hits;
      if (sequence.heroId === 'zhaoyun') {
        const oldX = player.x;
        const distance = this.state.arenaEndX - this.state.arenaStartX;
        const targetX = sequence.direction > 0 ? this.state.arenaStartX + distance * 0.82 : this.state.arenaStartX + distance * 0.18;
        player.x = clamp(targetX, this.state.arenaStartX + 20, this.state.arenaEndX);
        this.hitEnemies((enemy) => Math.abs(enemy.y - player.y) <= 190
          && enemy.x >= Math.min(oldX, player.x) - 20 && enemy.x <= Math.max(oldX, player.x) + 20,
        this.playerDamage({ base: player.attack, skillMultiplier: 1.8 * (1 + (this.state.blessings.wushuang ?? 0) * 0.3) }),
        { heavy: true, knockback: 210, stun: 0.3, critical: this.lastDamageWasCritical });
        sequence.direction = sequence.direction === 1 ? -1 : 1;
        sequence.nextHit = (hitIndex + 1) * interval;
      } else if (sequence.heroId === 'guanyu') {
        const damage = this.playerDamage({
          base: player.attack,
          skillMultiplier: 3.5 * (1 + (this.state.blessings.wushuang ?? 0) * 0.3),
        });
        this.spawnProjectile({
          owner: 'player',
          kind: 'crescent',
          x: player.x + player.facing * 40,
          y: player.y,
          z: 80,
          vx: player.facing * 1500,
          vy: 0,
          damage,
          pierce: 20,
          lifetime: 0.9,
          depthTolerance: 130,
          radius: 48,
          critical: this.lastDamageWasCritical,
        });
        sequence.nextHit += interval;
      } else {
        const damage = this.playerDamage({
          base: player.attack,
          skillMultiplier: 3 * (1 + (this.state.blessings.wushuang ?? 0) * 0.3),
        });
        this.addGroundTelegraph({
          owner: 'player',
          kind: 'shockwave',
          x: player.x,
          y: player.y,
          radius: 0,
          maxRadius: 570,
          timer: 0,
          duration: 0.5,
          damage,
          depthTolerance: 230,
          hit: false,
          hitIds: [],
        });
        sequence.nextHit += interval;
      }
      sequence.hits += 1;
      this.state.events.push(`无双波次:${hitIndex + 1}`);
    }
    if (sequence.elapsed >= 1.8 || sequence.hits >= (sequence.heroId === 'zhaoyun' ? 6 : 3)) {
      this.state.musouSequence = null;
      this.state.player.attackTimer = 0;
      this.state.player.invulnerability = Math.max(0, Math.min(this.state.player.invulnerability, 0.08));
    }
  }

  private spawnProjectile(projectile: Omit<ProjectileState, 'id' | 'hitIds'>): void {
    this.state.projectiles.push({ ...projectile, id: this.nextProjectileId++, hitIds: [] });
  }

  private addGroundTelegraph(telegraph: Omit<GroundTelegraph, 'id'>): void {
    this.state.groundTelegraphs.push({ ...telegraph, id: this.nextTelegraphId++ });
  }

  private isThreateningPlayer(window: number): boolean {
    const player = this.state.player;
    return this.state.projectiles.some((projectile) => {
      if (projectile.owner !== 'enemy') return false;
      const relativeX = player.x - projectile.x;
      const time = projectile.vx === 0 ? 0 : relativeX / projectile.vx;
      if (time < 0 || time > window) return false;
      const predictedY = projectile.y + projectile.vy * time;
      return Math.abs(predictedY - player.y) <= projectile.depthTolerance
        && Math.abs(projectile.z - player.z) <= 110;
    });
  }

  private updateProjectiles(dt: number): void {
    for (let index = this.state.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.state.projectiles[index]!;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.lifetime -= dt;
      let remove = projectile.lifetime <= 0
        || projectile.x < this.state.cameraX - 180
        || projectile.x > this.state.cameraX + 1460;
      if (!remove && projectile.owner === 'enemy') {
        const player = this.state.player;
        const hitsPlayer = Math.abs(projectile.x - player.x) <= projectile.radius + 18
          && Math.abs(projectile.y - player.y) <= projectile.depthTolerance
          && Math.abs(projectile.z - player.z) <= 110;
        if (hitsPlayer) {
          if (player.invulnerability <= 0) {
            const dealt = this.damagePlayer(projectile.damage);
            const source = this.state.enemies.find((enemy) => enemy.id === projectile.sourceId);
            if (source?.affix === '嗜血') source.hp = Math.min(source.maxHp, source.hp + dealt * 0.3);
          }
          remove = true;
        }
      } else if (!remove) {
        for (const enemy of this.state.enemies) {
          if (enemy.hp <= 0 || projectile.hitIds.includes(enemy.id)) continue;
          const hitsEnemy = Math.abs(projectile.x - enemy.x) <= projectile.radius + (enemy.boss ? 30 : 18)
            && Math.abs(projectile.y - enemy.y) <= projectile.depthTolerance
            && (enemy.z <= 0 || projectile.z > 25);
          if (!hitsEnemy) continue;
          projectile.hitIds.push(enemy.id);
          this.hitEnemies((candidate) => candidate.id === enemy.id, projectile.damage, {
            heavy: true,
            knockback: projectile.kind === 'crescent' ? 160 : 50,
            critical: projectile.critical,
          });
          if (projectile.pierce <= 0) {
            remove = true;
            break;
          }
          projectile.pierce -= 1;
        }
      }
      if (remove) this.state.projectiles.splice(index, 1);
    }
  }

  private updateGroundTelegraphs(dt: number): void {
    for (let index = this.state.groundTelegraphs.length - 1; index >= 0; index -= 1) {
      const telegraph = this.state.groundTelegraphs[index]!;
      telegraph.timer += dt;
      telegraph.radius = telegraph.maxRadius * clamp(telegraph.timer / telegraph.duration, 0, 1);
      if (telegraph.owner === 'enemy') {
        const player = this.state.player;
        const distance = Math.hypot(player.x - telegraph.x, (player.y - telegraph.y) * 1.4);
        const active = telegraph.kind === 'lightning'
          ? telegraph.timer >= telegraph.duration
          : distance <= telegraph.radius && distance >= telegraph.radius - 38;
        if (!telegraph.hit && active && distance <= telegraph.maxRadius && Math.abs(player.y - telegraph.y) <= telegraph.depthTolerance) {
          if (player.invulnerability <= 0 && player.z < 48) this.damagePlayer(telegraph.damage);
          telegraph.hit = true;
        }
      } else if (telegraph.kind === 'shockwave') {
        for (const enemy of this.state.enemies) {
          if (enemy.hp <= 0 || telegraph.hitIds.includes(enemy.id)) continue;
          const distance = Math.hypot(enemy.x - telegraph.x, (enemy.y - telegraph.y) * 1.4);
          if (distance > telegraph.radius || Math.abs(enemy.y - telegraph.y) > telegraph.depthTolerance) continue;
          telegraph.hitIds.push(enemy.id);
          this.hitEnemies((candidate) => candidate.id === enemy.id, telegraph.damage, {
            heavy: true,
            knockback: 260,
            stun: 0.4,
          });
        }
      }
      if (telegraph.timer >= telegraph.duration + 0.16) this.state.groundTelegraphs.splice(index, 1);
    }
  }

  private damagePlayer(damage: number): number {
    const player = this.state.player;
    if (player.invulnerability > 0) return 0;
    if (this.state.blessings.jinjia && player.goldenArmorReady) {
      player.goldenArmorReady = false;
      player.goldenArmorTimer = 10;
      this.state.events.push('金甲');
      return 0;
    }
    const actualDamage = damage * (this.state.heroId === 'zhangfei' ? 0.8 : 1)
      * (1 - Math.min(0.6, player.shield));
    player.hp -= actualDamage;
    player.hitFlash = 0.12;
    player.invulnerability = 0.38;
    this.grantMusou(actualDamage * 0.8);
    this.state.shake = Math.max(this.state.shake, 0.5);
    this.state.hitstop = Math.max(this.state.hitstop, 0.04);
    this.state.floatingNumbers.push({ x: player.x, y: player.y - 52, value: -Math.round(actualDamage), crit: false, timer: 0.8 });
    this.state.events.push('受击');
    for (const enemy of this.state.enemies) {
      if (enemy.boss || enemy.hp <= 0) continue;
      const delay = this.random.range(0.16, 0.4);
      if (enemy.action === 'windup') {
        enemy.timer += delay;
        enemy.telegraph += delay;
      } else {
        enemy.cooldown += delay;
      }
    }
    return actualDamage;
  }

  private playerDamage(factors: Parameters<typeof composeDamage>[0]): number {
    const player = this.state.player;
    const hero = getHero(this.state.heroId);
    const isCritical = this.state.heroId === 'guanyu' && this.random.next() < 0.15
      || this.random.next() < (this.state.blessings.huixin ?? 0) * 0.08;
    this.lastDamageWasCritical = isCritical;
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
    options: { heavy: boolean; knockback: number; stun?: number; launch?: boolean; critical?: boolean },
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
      const actualDamage = result.damage * (enemy.affix === '铁甲' ? 0.6 : 1);
      enemy.hp -= actualDamage;
      this.state.player.comboHits += 1;
      this.state.player.comboTimer = 2.5;
      this.state.player.comboDisplayTimer = 2.5;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.player.comboHits);
      enemy.flash = 0.13;
      enemy.knockback = Math.max(enemy.knockback, options.knockback);
      enemy.facing = this.state.player.facing;
      if (options.heavy || enemy.affix !== '铁甲') enemy.stun = Math.max(enemy.stun, options.stun ?? 0.18);
      if (!enemy.boss && enemy.z > 0) enemy.vz = Math.max(enemy.vz, 260);
      if (options.launch && !enemy.boss) {
        enemy.z = Math.max(enemy.z, 42);
        enemy.vz = Math.max(enemy.vz, 330);
        enemy.bounceCount = 0;
        enemy.downTimer = 0;
      }
      this.grantMusou(Math.min(4, actualDamage * 0.035));
      if (this.state.blessings.hanbing) enemy.slow = 3;
      if (!options.heavy && this.state.blessings.huoji) enemy.burn = Math.max(enemy.burn, 3);
      if (options.heavy && this.state.blessings.tianlei) {
        const chainLimit = this.state.blessings.tianlei >= 3 ? 2 : 1;
        this.addGroundTelegraph({
          owner: 'player',
          kind: 'lightning',
          x: enemy.x,
          y: enemy.y,
          radius: 32,
          maxRadius: 32,
          timer: 0,
          duration: 0.2,
          damage: actualDamage * 0.18,
          depthTolerance: 100,
          hit: false,
          hitIds: [],
        });
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
        value: Math.max(1, Math.round(actualDamage)),
        crit: options.critical ?? false,
        timer: 0.9,
        label: options.critical ? '暴击' : undefined,
      });
      this.state.events.push('命中火花');
      this.state.shake = Math.max(this.state.shake, options.heavy ? 0.65 : 0.25);
      this.state.hitstop = Math.max(this.state.hitstop, options.heavy ? 0.06 : 0.025);
      if (enemy.boss && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5 && enemy.phase === 1) {
        enemy.phase = 2;
        this.state.events.push('狂怒');
      }
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
  }

  private updateEnemies(dt: number): void {
    const player = this.state.player;
    for (const enemy of [...this.state.enemies]) {
      if (enemy.hp <= 0) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.telegraph = Math.max(0, enemy.telegraph - dt);
      enemy.burn = Math.max(0, enemy.burn - dt);
      enemy.slow = Math.max(0, enemy.slow - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.downTimer = Math.max(0, enemy.downTimer - dt);
      if (enemy.burn > 0 && Math.floor(this.state.time * 4) !== Math.floor((this.state.time - dt) * 4)) {
        enemy.hp -= 1 + (this.state.blessings.liehuo ?? 0);
      }
      if (enemy.z > 0 || enemy.vz > 0) {
        const wasAirborne = enemy.z > 0;
        enemy.z = Math.max(0, enemy.z + enemy.vz * dt);
        enemy.vz -= 760 * dt;
        if (enemy.z === 0 && wasAirborne) {
          enemy.vz = 0;
          if (enemy.bounceCount === 0) {
            enemy.bounceCount = 1;
            enemy.vz = 135;
          } else {
            enemy.downTimer = 0.48;
            enemy.action = 'down';
          }
        }
      }
      if (enemy.knockback > 0) {
        enemy.x = clamp(enemy.x + enemy.facing * enemy.knockback * dt, this.state.arenaStartX + 20, this.state.arenaEndX);
        enemy.knockback = Math.max(0, enemy.knockback - 500 * dt);
      }
      if (enemy.hp <= 0) {
        this.killEnemy(enemy);
        continue;
      }
      if (enemy.downTimer > 0) {
        enemy.action = 'down';
        continue;
      }
      if (enemy.stun > 0) {
        enemy.action = 'stunned';
        continue;
      }
      if (enemy.action === 'charging') {
        this.updateCharge(enemy, dt);
        continue;
      }
      enemy.facing = player.x >= enemy.x ? 1 : -1;
      enemy.cooldown -= dt;
      const distance = Math.abs(player.x - enemy.x);
      const actTwoSpeed = this.state.act === 2 && !enemy.boss ? 1.15 : 1;
      const affixSpeed = enemy.affix === '狂暴' ? 1.4 : 1;
      const baseSpeed = ENEMIES[enemy.kind].speed * actTwoSpeed * affixSpeed * (enemy.phase === 2 ? 1.35 : 1);
      if (enemy.action === 'windup') {
        enemy.timer -= dt * (enemy.phase === 2 ? 1.3 : 1);
        if (enemy.timer <= 0) {
          this.enemyStrike(enemy);
        }
      } else if (enemy.action === 'recover') {
        enemy.timer -= dt;
        if (enemy.timer <= 0) enemy.action = 'approach';
      } else if (enemy.action === 'attack') {
        enemy.action = 'approach';
      } else {
        const targetDistance = ENEMIES[enemy.kind].range;
        if (enemy.kind === 'archer' && distance < 350) {
          enemy.x = clamp(enemy.x - enemy.facing * baseSpeed * dt, this.state.arenaStartX + 20, this.state.arenaEndX);
        } else if (distance > targetDistance + 10) {
          const speed = baseSpeed * (enemy.slow > 0 ? 0.7 : 1);
          enemy.x = clamp(enemy.x + enemy.facing * speed * dt, this.state.arenaStartX + 20, this.state.arenaEndX);
        } else if (enemy.cooldown <= 0 && this.canStartAttack(enemy)) {
          this.startEnemyAttack(enemy);
        }
      }
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
  }

  private canStartAttack(enemy: EnemyState): boolean {
    if (enemy.boss) return true;
    const firing = this.state.enemies.filter((candidate) => candidate.kind === 'archer'
      && ['windup', 'attack'].includes(candidate.action)).length;
    const melee = this.state.enemies.filter((candidate) => !candidate.boss && candidate.kind !== 'archer'
      && ['windup', 'attack', 'charging'].includes(candidate.action)).length;
    return enemy.kind === 'archer' ? firing < 2 : melee < 2;
  }

  private selectBossPattern(enemy: EnemyState): BossPattern {
    if (enemy.kind === 'lvbu' && enemy.phase === 2) {
      const pattern: BossPattern = enemy.phaseComboStep === 2 ? 'charge' : 'sweep';
      enemy.phaseComboStep = (enemy.phaseComboStep + 1) % 3;
      return pattern;
    }
    const options: BossPattern[] = enemy.kind === 'zhangjiao'
      ? ['lightning', 'orbs', 'summon', 'teleport']
      : ['sweep', 'charge', 'slam'];
    const history = enemy.patternHistory.slice(-2);
    const candidates = options.filter((pattern) => !(history.length === 2 && history[0] === pattern && history[1] === pattern));
    const selected = candidates[this.random.integer(0, candidates.length - 1)]!;
    enemy.patternHistory.push(selected);
    if (enemy.patternHistory.length > 4) enemy.patternHistory.shift();
    return selected;
  }

  private startEnemyAttack(enemy: EnemyState): void {
    enemy.action = 'windup';
    if (enemy.boss) {
      enemy.pattern = this.selectBossPattern(enemy);
      enemy.telegraphKind = enemy.pattern === 'lightning' ? 'lightning'
        : enemy.pattern === 'sweep' ? 'sweep'
          : enemy.pattern === 'charge' ? 'charge'
            : enemy.pattern === 'slam' ? 'slam'
              : enemy.pattern === 'orbs' ? 'orb' : 'teleport';
      enemy.timer = enemy.pattern === 'lightning' ? 1 : enemy.pattern === 'charge' ? 0.8 : 0.68;
      enemy.telegraph = enemy.timer;
      if (enemy.pattern === 'lightning') {
        const circles = this.random.integer(3, 5);
        for (let index = 0; index < circles; index += 1) {
          this.addGroundTelegraph({
            owner: 'enemy',
            kind: 'lightning',
            x: clamp(this.state.player.x + this.random.range(-260, 260), this.state.arenaStartX + 40, this.state.arenaEndX - 40),
            y: clamp(this.state.player.y + this.random.range(-80, 80), GROUND_MIN, GROUND_MAX),
            radius: 28,
            maxRadius: 44,
            timer: 0,
            duration: 1,
            damage: enemy.damage * 1.4,
            depthTolerance: 90,
            hit: false,
            hitIds: [],
          });
        }
      }
    } else {
      enemy.pattern = null;
      enemy.telegraphKind = enemy.kind === 'cavalry' ? 'charge' : enemy.kind === 'archer' ? 'strike' : 'strike';
      enemy.timer = enemy.kind === 'cavalry' ? 0.8 : enemy.kind === 'archer' ? 0.52 : 0.5;
      if (enemy.affix === '狂暴') enemy.timer /= 1.4;
      enemy.cooldown += enemy.affix === '狂暴' ? 0 : this.random.range(0.08, 0.3);
    }
    this.state.events.push('敌军蓄势');
  }

  private enemyStrike(enemy: EnemyState): void {
    const player = this.state.player;
    const dist = Math.abs(player.x - enemy.x);
    enemy.actionCount += 1;
    enemy.telegraph = 0;
    if (enemy.boss) {
      const pattern = enemy.pattern;
      if (pattern === 'orbs') {
        for (let index = -1; index <= 1; index += 1) {
          const dx = player.x - enemy.x;
          const dy = player.y - enemy.y + index * 70;
          const length = Math.hypot(dx, dy) || 1;
          this.spawnProjectile({
          owner: 'enemy',
          kind: 'orb',
          x: enemy.x,
          sourceId: enemy.id,
          y: enemy.y,
            z: 85,
            vx: dx / length * 185,
            vy: dy / length * 185,
            damage: enemy.damage * 0.8,
            pierce: 0,
            lifetime: 3.8,
            depthTolerance: 58,
            radius: 21,
            critical: false,
          });
        }
      } else if (pattern === 'summon') {
        const adds = this.state.enemies.filter((candidate) => !candidate.boss).length;
        for (let index = 0; index < Math.min(3, 5 - adds); index += 1) {
          this.addEnemy('saber', clamp(enemy.x + (index - 1) * 60, this.state.arenaStartX + 25, this.state.arenaEndX), clamp(enemy.y + this.random.range(-65, 65), GROUND_MIN, GROUND_MAX));
        }
        this.state.events.push('召唤黄巾');
      } else if (pattern === 'teleport') {
        enemy.x = clamp(player.x + this.random.range(-270, 270), this.state.arenaStartX + 100, this.state.arenaEndX - 100);
        enemy.y = clamp(player.y + this.random.range(-65, 65), GROUND_MIN, GROUND_MAX);
        this.state.events.push('天公瞬移');
      } else if (pattern === 'charge') {
        this.beginCharge(enemy, 900, 650);
        return;
      } else if (pattern === 'slam') {
        enemy.z = 130;
        this.addGroundTelegraph({
          owner: 'enemy',
          kind: 'shockwave',
          x: enemy.x,
          y: enemy.y,
          radius: 0,
          maxRadius: 480,
          timer: 0,
          duration: 0.68,
          damage: enemy.damage * 1.5,
          depthTolerance: 180,
          hit: false,
          hitIds: [],
        });
        this.state.events.push('跃击');
      } else if (pattern === 'sweep') {
        if (dist <= 285 && Math.abs(player.y - enemy.y) <= 165 && player.z < 60) {
          this.damagePlayer(enemy.damage * 1.4);
        }
        this.state.events.push('方天横扫');
      } else {
        this.state.events.push('落雷');
      }
      enemy.cooldown = (enemy.phase === 2 ? 1.35 : 2) * (enemy.affix === '狂暴' ? 0.72 : 1);
      enemy.action = 'recover';
      enemy.timer = pattern === 'slam' ? 0.9 : 0.68;
      enemy.telegraphKind = null;
      return;
    }
    if (enemy.kind === 'cavalry') {
      this.beginCharge(enemy, 900, 650);
      return;
    }
    if (enemy.kind === 'archer') {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      this.spawnProjectile({
        owner: 'enemy',
        sourceId: enemy.id,
        kind: 'arrow',
        x: enemy.x,
        y: enemy.y,
        z: 78,
        vx: dx / length * 460,
        vy: dy / length * 460,
        damage: enemy.damage,
        pierce: 0,
        lifetime: 2.4,
        depthTolerance: 44,
        radius: 10,
        critical: false,
      });
    } else if (dist <= 112 && Math.abs(player.y - enemy.y) <= 88 && player.z < 60) {
      const dealt = this.damagePlayer(enemy.damage);
      if (enemy.affix === '嗜血' && player.hp < player.maxHp) enemy.hp = Math.min(enemy.maxHp, enemy.hp + dealt * 0.3);
    }
    enemy.cooldown = (enemy.kind === 'archer' ? 1.65 : 1.4)
      * (enemy.affix === '狂暴' ? 0.72 : 1);
    enemy.action = 'recover';
    enemy.timer = 0.65;
    enemy.telegraphKind = null;
  }

  private beginCharge(enemy: EnemyState, distance: number, speed: number): void {
    enemy.action = 'charging';
    enemy.chargeDirection = enemy.facing;
    enemy.chargeRemaining = distance;
    enemy.chargeHitPlayer = false;
    enemy.chargeDodged = false;
    enemy.telegraph = 0;
    enemy.telegraphKind = 'charge';
    enemy.cooldown = enemy.boss ? 2.8 : 2.2;
    enemy.timer = speed;
  }

  private updateCharge(enemy: EnemyState, dt: number): void {
    const speed = enemy.timer;
    const distance = Math.min(enemy.chargeRemaining, speed * dt);
    const oldX = enemy.x;
    enemy.x = clamp(enemy.x + enemy.chargeDirection * distance, this.state.arenaStartX - 900, this.state.arenaEndX + 900);
    const traveled = Math.abs(enemy.x - oldX);
    enemy.chargeRemaining = Math.max(0, enemy.chargeRemaining - traveled);
    const blockedAtArenaEdge = traveled + 0.001 < distance;
    const player = this.state.player;
    const crossedPlayer = player.x >= Math.min(oldX, enemy.x) - 35 && player.x <= Math.max(oldX, enemy.x) + 35
      && Math.abs(player.y - enemy.y) <= 44 && player.z < 80;
    if (crossedPlayer && !enemy.chargeHitPlayer) {
      enemy.chargeHitPlayer = true;
      if (player.dodgeTimer > 0) enemy.chargeDodged = true;
      else {
        if (player.invulnerability <= 0) this.damagePlayer(enemy.damage * (enemy.boss ? 1.5 : 1));
        if (enemy.affix === '嗜血') enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.damage * 0.3);
      }
    }
    if (enemy.chargeRemaining <= 1e-6 || blockedAtArenaEdge) {
      enemy.chargeRemaining = 0;
      enemy.action = 'recover';
      enemy.timer = 0.7;
      enemy.telegraphKind = null;
      if (enemy.chargeDodged) {
        enemy.stun = enemy.boss ? 0.8 : 1.2;
        enemy.action = 'stunned';
        this.state.events.push('骑兵落马');
      }
    }
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
    if (this.state.waveComplete && this.state.waveClearTimer > 0) {
      this.state.waveClearTimer = Math.max(0, this.state.waveClearTimer - FIXED_DT);
    }
    if (this.state.enemies.length === 0 && !this.state.stageComplete) {
      if (!this.state.waveComplete) {
        this.state.waveComplete = true;
        this.state.waveClearTimer = 0.8;
        this.state.nextWaveX = this.state.arenaStartX + ARENA_SPACING;
        this.state.events.push('波阵已破');
      }
      if (this.state.waveClearTimer === 0
        && this.state.waveIndex + 1 < this.state.waveCount && this.state.player.x >= this.state.nextWaveX) {
        this.state.waveIndex += 1;
        this.state.arenaStartX = this.state.waveIndex * ARENA_SPACING;
        this.state.arenaEndX = this.state.arenaStartX + ARENA_WIDTH;
        this.state.waveComplete = false;
        this.state.waveClearTimer = 0;
        this.state.projectiles = this.state.projectiles.filter((projectile) => projectile.owner === 'player');
        this.state.groundTelegraphs = this.state.groundTelegraphs.filter((telegraph) => telegraph.owner === 'player');
        this.spawnCurrentWave();
      } else if (this.state.waveClearTimer === 0
        && this.state.waveIndex + 1 >= this.state.waveCount && this.state.player.x >= this.state.stageEndX) {
        this.state.stageComplete = true;
        this.state.events.push('关卡完成');
      }
    }
    if (input.proceed && this.state.stageComplete) this.advanceStage();
  }

  private spawnCurrentWave(): void {
    const stage = STAGES[this.state.stageIndex]!;
    this.state.enemies = [];
    if (stage.boss) {
      this.addEnemy(stage.boss, this.state.arenaStartX + 850, this.state.player.y);
      return;
    }
    const composition = stage.waves![this.state.waveIndex]!;
    const difficulty = 1 + this.state.stageIndex * 0.12;
    composition.forEach((kind, index) => {
      const fromLeft = index % 3 === 0;
      const x = fromLeft
        ? this.state.arenaStartX + 35 + index * 18 + this.random.range(-12, 12)
        : this.state.arenaStartX + 850 - index * 56 + this.random.range(-20, 20);
      const elite = this.state.stageIndex >= 2
        && (this.state.waveIndex === 0 && index === 0 || this.random.next() < 0.12);
      this.addEnemy(kind, x, GROUND_MIN + this.random.range(24, 205), difficulty, elite);
    });
  }

  private addEnemy(kind: EnemyKind, x: number, y: number, difficulty = 1, elite = false): void {
    const definition = ENEMIES[kind];
    const boss = definition.boss ?? false;
    const hpMultiplier = boss ? 1 + this.state.stageIndex * 0.12 : difficulty;
    const damageMultiplier = 1 + this.state.stageIndex * 0.08;
    const affixes = ['狂暴', '铁甲', '嗜血'] as const;
    const affix = elite ? affixes[this.random.integer(0, affixes.length - 1)]! : null;
    const scaledHp = definition.hp * hpMultiplier * (elite ? 2.5 : 1);
    this.state.enemies.push({
      id: this.nextEnemyId++,
      kind,
      elite,
      affix,
      x,
      y,
      z: 0,
      vz: 0,
      hp: scaledHp,
      maxHp: scaledHp,
      damage: definition.damage * damageMultiplier,
      facing: -1,
      action: 'approach',
      timer: 0,
      cooldown: this.random.range(0.3, 1.2),
      stun: 0,
      downTimer: 0,
      bounceCount: 0,
      knockback: 0,
      flash: 0,
      guard: kind === 'shield',
      phase: 1,
      boss,
      telegraph: 0,
      burn: 0,
      slow: 0,
      actionCount: 0,
      telegraphKind: null,
      pattern: null,
      patternHistory: [],
      phaseComboStep: 0,
      chargeRemaining: 0,
      chargeDirection: -1,
      chargeHitPlayer: false,
      chargeDodged: false,
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
    const values = [
      player.x, player.y, player.z, player.hp, player.musou,
      ...enemies.flatMap((enemy) => [enemy.x, enemy.y, enemy.z, enemy.vz, enemy.hp]),
      ...this.state.projectiles.flatMap((projectile) => [projectile.x, projectile.y, projectile.z, projectile.vx, projectile.vy, projectile.damage, projectile.lifetime]),
      ...this.state.groundTelegraphs.flatMap((telegraph) => [telegraph.x, telegraph.y, telegraph.radius, telegraph.timer]),
    ];
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

function stageEnd(stageIndex: number): number {
  const stage = STAGES[stageIndex]!;
  const waveCount = stage.boss ? 1 : stage.waves!.length;
  return waveCount * ARENA_SPACING + 300;
}
