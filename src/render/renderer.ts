import { ENEMIES } from '../data/enemies';
import { getHero } from '../data/heroes';
import { AssetLoader, enemySpritePath, heroSpritePath } from './assets';
import type { GameEngine } from '../engine/engine';
import type { EnemyState, FloatingNumber, GameState } from '../engine/types';
import { AudioSynth } from './audio';
import { animationBank } from './animations';

const WIDTH = 1280;
const HEIGHT = 720;

function clampValue(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface SpriteEffect {
  key: string;
  x: number;
  y: number;
  facing: 1 | -1;
  age: number;
  duration: number;
  height: number;
  rotation: number;
  alpha: number;
  loop: boolean;
  endX?: number;
}

interface RendererAfterimage {
  key: string;
  x: number;
  y: number;
  facing: 1 | -1;
  frame: number;
  age: number;
  duration: number;
}

interface EnemySnapshot {
  kind: EnemyState['kind'];
  boss: boolean;
  x: number;
  y: number;
  z: number;
  facing: 1 | -1;
  action: EnemyState['action'];
  height: number;
}

interface EnemyCorpse extends EnemySnapshot {
  age: number;
  animationDuration: number;
  tint?: string;
}

interface PlayerAttackTrack {
  hitIndex: number;
  heavy: boolean;
  initialTimer: number;
}

interface PositionSnapshot {
  x: number;
  y: number;
  z: number;
}

interface CachedLayer {
  canvas: HTMLCanvasElement;
  dpr: number;
  loaded: boolean;
}

export class BattleRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly assets = new AssetLoader();
  private readonly particles: Particle[] = [];
  private readonly spriteEffects: SpriteEffect[] = [];
  private readonly rendererAfterimages: RendererAfterimage[] = [];
  private readonly corpses: EnemyCorpse[] = [];
  private readonly enemySnapshots = new Map<number, EnemySnapshot>();
  private readonly movingEnemyIds = new Set<number>();
  private readonly burnVfxTimers = new Map<number, number>();
  private readonly seenDamageNumbers = new WeakSet<FloatingNumber>();
  private readonly seenLightningTelegraphs = new Set<number>();
  private readonly backgrounds = new Map<1 | 2, CachedLayer>();
  private readonly orbTexture: HTMLCanvasElement;
  private vignetteLayer: CachedLayer | null = null;
  private readonly previousEnemies = new Map<number, PositionSnapshot>();
  private readonly previousProjectiles = new Map<number, PositionSnapshot>();
  private previousPlayer: PositionSnapshot | null = null;
  private previousCameraX: number | null = null;
  private lastEventIndex = 0;
  private lastAttackSerial = 0;
  private dustTimer = 0;
  private animationTime = 0;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private frameIntervalEma = 1000 / 60;
  private slowFrameSeconds = 0;
  private fpsVisible = new URLSearchParams(window.location.search).has('fps');
  private renderAlpha = 1;
  private readonly audio: AudioSynth;
  private activeAttack: PlayerAttackTrack | null = null;
  private lastPlayerX: number | null = null;
  private playerWasAirborne = false;
  private jumpElapsed = 0;
  private landingCrouch = 0;
  private playerDownElapsed = 0;
  private wasMusouActive = false;
  private musouFlash = 0;
  private cameraPunch = 0;

  constructor(canvas: HTMLCanvasElement, audio: AudioSynth) {
    this.canvas = canvas;
    this.audio = audio;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.context = context;
    canvas.width = Math.round(WIDTH * this.dpr);
    canvas.height = Math.round(HEIGHT * this.dpr);
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    this.orbTexture = this.createOrbTexture();
  }

  capturePrevious(state: GameState): void {
    this.previousPlayer = { x: state.player.x, y: state.player.y, z: state.player.z };
    this.previousCameraX = state.cameraX;
    this.previousEnemies.clear();
    for (const enemy of state.enemies) {
      this.previousEnemies.set(enemy.id, { x: enemy.x, y: enemy.y, z: enemy.z });
    }
    this.previousProjectiles.clear();
    for (const projectile of state.projectiles) {
      this.previousProjectiles.set(projectile.id, { x: projectile.x, y: projectile.y, z: projectile.z });
    }
  }

  toggleFps(): void {
    this.fpsVisible = !this.fpsVisible;
  }

  render(engine: GameEngine, elapsed = 1 / 60, alpha = 1): void {
    const state = engine.state;
    this.renderAlpha = clampValue(alpha, 0, 1);
    this.updateFrameTiming(elapsed);
    this.activeAct = state.act;
    const context = this.context;
    this.animationTime += elapsed;
    this.handleEvents(engine);
    this.observeState(engine, elapsed);
    const cameraX = this.interpolatePosition(
      { x: state.cameraX, y: 0, z: 0 },
      this.previousCameraX === null ? null : { x: this.previousCameraX, y: 0, z: 0 },
    ).x;
    this.dustTimer -= elapsed;
    if (Math.abs(state.player.vx) > 12 && this.dustTimer <= 0) {
      const playerPosition = this.interpolatePosition(state.player, this.previousPlayer);
      this.spawnParticles(2, '#b7a28b', playerPosition.x - cameraX, playerPosition.y - 7);
      this.dustTimer = 0.14;
    }
    this.updateSpriteEffects(elapsed);
    this.updateAfterimages(elapsed);
    this.updateCorpses(elapsed);
    this.updateParticles(elapsed);
    this.musouFlash = Math.max(0, this.musouFlash - elapsed);
    this.cameraPunch = Math.max(0, this.cameraPunch - elapsed);

    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 : 0;
    context.save();
    context.translate(shakeX, shakeY);
    const zoom = 1 + 0.06 * Math.min(1, this.cameraPunch / 0.35);
    context.translate(WIDTH / 2, HEIGHT / 2);
    context.scale(zoom, zoom);
    context.translate(-WIDTH / 2, -HEIGHT / 2);
    this.drawBackground(state.act, cameraX);
    this.drawGround(cameraX);
    this.drawTelegraphs(engine, cameraX);
    this.drawProjectiles(engine, cameraX);
    for (const image of engine.afterimages) {
      const frame = (1 - image.timer / 0.32) * 4;
      const drawn = animationBank.drawAnim(context, `${state.heroId}/dodge`, frame, image.x - cameraX, image.y, 190, state.player.facing, {
        alpha: image.timer / 0.32 * 0.42,
        tint: 'blue',
      });
      if (!drawn) this.assets.drawSprite(context, heroSpritePath(state.heroId, 'idle'), image.x - cameraX, image.y, 190, state.player.facing, { alpha: image.timer / 0.32 * 0.42 });
    }
    this.drawRendererAfterimages(cameraX);
    const renderables: Array<{ y: number; enemy: EnemyState | null; corpse: EnemyCorpse | null }> = [
      ...state.enemies.map((enemy) => ({
        y: this.interpolatePosition(enemy, this.previousEnemies.get(enemy.id)).y,
        enemy,
        corpse: null,
      })),
      ...this.corpses.map((corpse) => ({ y: corpse.y, enemy: null, corpse })),
      { y: this.interpolatePosition(state.player, this.previousPlayer).y, enemy: null, corpse: null },
    ];
    renderables.sort((a, b) => a.y - b.y);
    for (const item of renderables) {
      if (item.enemy) this.drawEnemy(item.enemy, cameraX);
      else if (item.corpse) this.drawCorpse(item.corpse, cameraX);
      else this.drawPlayer(engine, cameraX);
    }
    this.drawSpriteEffects(cameraX);
    this.drawParticles();
    this.drawDamageNumbers(engine, cameraX);
    this.drawVignette();
    if (state.musouSequence) {
      context.fillStyle = 'rgba(8, 6, 10, .34)';
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (this.musouFlash > 0) {
      context.globalAlpha = Math.min(0.6, this.musouFlash / 0.12 * 0.6);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.globalAlpha = 1;
    }
    this.drawFpsOverlay();
    context.restore();
  }

  private updateFrameTiming(elapsed: number): void {
    const interval = Math.max(0, elapsed * 1000);
    const weight = 1 - Math.exp(-Math.max(elapsed, 0) / 0.5);
    this.frameIntervalEma += (interval - this.frameIntervalEma) * weight;
    if (this.dpr > 1 && this.frameIntervalEma > 22) {
      this.slowFrameSeconds += elapsed;
      if (this.slowFrameSeconds >= 2) {
        this.dpr = this.dpr > 1.5 ? 1.5 : 1;
        this.canvas.width = Math.round(WIDTH * this.dpr);
        this.canvas.height = Math.round(HEIGHT * this.dpr);
        this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.backgrounds.clear();
        this.vignetteLayer = null;
        this.slowFrameSeconds = 0;
      }
    } else {
      this.slowFrameSeconds = 0;
    }
  }

  private drawFpsOverlay(): void {
    if (!this.fpsVisible) return;
    const context = this.context;
    const fps = this.frameIntervalEma > 0 ? Math.round(1000 / this.frameIntervalEma) : 0;
    const label = `${fps} fps · ${this.frameIntervalEma.toFixed(1)} ms · dpr ${this.dpr.toFixed(1)}`;
    context.save();
    context.fillStyle = 'rgba(14, 11, 12, .82)';
    context.fillRect(WIDTH - 207, 58, 197, 24);
    context.font = '12px sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillStyle = '#e8d9b9';
    context.fillText(label, WIDTH - 17, 70);
    context.restore();
  }

  private interpolatePosition(current: PositionSnapshot, previous: PositionSnapshot | null | undefined): PositionSnapshot {
    if (!previous || Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z) > 160) {
      return current;
    }
    return {
      x: previous.x + (current.x - previous.x) * this.renderAlpha,
      y: previous.y + (current.y - previous.y) * this.renderAlpha,
      z: previous.z + (current.z - previous.z) * this.renderAlpha,
    };
  }

  private observeState(engine: GameEngine, elapsed: number): void {
    const state = engine.state;
    const player = state.player;
    const playerPosition = this.interpolatePosition(player, this.previousPlayer);
    const previousPlayerX = this.lastPlayerX ?? playerPosition.x;
    const inAir = player.airborne || player.z > 0;
    if (inAir && !this.playerWasAirborne) this.jumpElapsed = 0;
    else if (inAir) this.jumpElapsed += elapsed;
    if (!inAir && this.playerWasAirborne) {
      this.landingCrouch = 0.09;
      this.spawnSpriteEffect('vfx/dust', playerPosition.x, playerPosition.y - 8, 112, player.facing, 0.42);
    }
    this.landingCrouch = Math.max(0, this.landingCrouch - elapsed);
    this.playerWasAirborne = inAir;
    if (player.hp <= 0) this.playerDownElapsed += elapsed;

    if (player.attackSerial !== this.lastAttackSerial) {
      this.lastAttackSerial = player.attackSerial;
      if (!state.musouSequence) {
        const hitIndex = player.comboFinished ? 4 : Math.max(0, player.comboIndex - 1);
        this.activeAttack = {
          hitIndex,
          heavy: player.lastAttackWasHeavy,
          initialTimer: Math.max(0.01, player.attackTimer),
        };
        this.spawnAttackEffects(state, hitIndex, player.lastAttackWasHeavy, previousPlayerX, playerPosition);
      } else {
        this.activeAttack = null;
      }
    }

    if (state.musouSequence && !this.wasMusouActive) this.startMusouEffects(state);
    if (state.musouSequence?.heroId === 'zhaoyun' && Math.abs(playerPosition.x - previousPlayerX) > 20) {
      this.spawnAfterimage('zhaoyun/musou', previousPlayerX, playerPosition.y - playerPosition.z, player.facing, 4);
      this.spawnSpriteEffect('vfx/dust', playerPosition.x, playerPosition.y - 8, 132, player.facing, 0.42, 0, 0.78);
    }
    this.wasMusouActive = !!state.musouSequence;

    for (const number of state.floatingNumbers) {
      if (this.seenDamageNumbers.has(number)) continue;
      this.seenDamageNumbers.add(number);
      this.spawnSpriteEffect(
        'vfx/impact',
        number.x,
        number.y,
        (number.crit ? 156 : 102) * (0.85 + Math.random() * 0.3),
        Math.random() < 0.5 ? 1 : -1,
        number.crit ? 0.36 : 0.28,
        (Math.random() - 0.5) * 0.8,
        number.crit ? 1 : 0.82,
      );
    }

    const currentIds = new Set<number>();
    this.movingEnemyIds.clear();
    for (const enemy of state.enemies) {
      currentIds.add(enemy.id);
      const previous = this.enemySnapshots.get(enemy.id);
      if (previous) {
        if (Math.abs(enemy.x - previous.x) > 1) this.movingEnemyIds.add(enemy.id);
        if (previous.action !== 'charging' && enemy.action === 'charging') {
          this.spawnSpriteEffect('vfx/dust', enemy.x, enemy.y - 10, enemy.boss ? 210 : 142, enemy.facing, 0.5);
        }
      }
      if (enemy.burn > 0) {
        const timer = (this.burnVfxTimers.get(enemy.id) ?? 0) - elapsed;
        if (timer <= 0) {
          const height = enemy.boss ? 260 : enemy.kind === 'cavalry' ? 200 : 170;
          this.spawnSpriteEffect('vfx/fire', enemy.x, enemy.y - height * 0.55, 74, 1, 0.42, 0, 0.74);
          this.burnVfxTimers.set(enemy.id, 0.28);
        } else {
          this.burnVfxTimers.set(enemy.id, timer);
        }
      } else {
        this.burnVfxTimers.delete(enemy.id);
      }
    }
    for (const [id, previous] of this.enemySnapshots) {
      if (currentIds.has(id)) continue;
      const corpse: EnemyCorpse = {
        ...previous,
        age: 0,
        animationDuration: previous.boss ? 0.48 : 0.42,
        tint: state.act === 2 && !previous.boss ? 'act2' : undefined,
      };
      this.corpses.push(corpse);
      this.spawnSpriteEffect('vfx/dust', previous.x, previous.y - 8, previous.boss ? 230 : 140, previous.facing, 0.54);
      this.burnVfxTimers.delete(id);
    }
    this.enemySnapshots.clear();
    for (const enemy of state.enemies) {
      const height = enemy.boss ? 260 : enemy.kind === 'cavalry' ? 200 : 170;
      this.enemySnapshots.set(enemy.id, {
        kind: enemy.kind,
        boss: enemy.boss,
        x: enemy.x,
        y: enemy.y,
        z: enemy.z,
        facing: enemy.facing,
        action: enemy.action,
        height,
      });
    }

    for (const telegraph of state.groundTelegraphs) {
      if (telegraph.owner !== 'enemy' || telegraph.kind !== 'lightning'
        || telegraph.timer < telegraph.duration || this.seenLightningTelegraphs.has(telegraph.id)) continue;
      this.seenLightningTelegraphs.add(telegraph.id);
      this.spawnSpriteEffect('vfx/lightning', telegraph.x, telegraph.y - 120, 300, 1, 0.48, 0, 0.95);
    }
    if (this.seenLightningTelegraphs.size > 240) this.seenLightningTelegraphs.clear();
    this.lastPlayerX = playerPosition.x;
  }

  private spawnAttackEffects(
    state: GameState,
    hitIndex: number,
    heavy: boolean,
    previousX: number,
    position: PositionSnapshot,
  ): void {
    const player = state.player;
    const facing = player.facing;
    if (!heavy) {
      const key = state.heroId === 'guanyu'
        ? 'vfx/slash_gold'
        : state.heroId === 'zhangfei'
          ? 'vfx/slash'
          : hitIndex < 3 ? 'vfx/thrust' : 'vfx/slash';
      const finisher = hitIndex === 4;
      this.spawnSpriteEffect(
        key,
        position.x + facing * (state.heroId === 'guanyu' ? 78 : 62),
        position.y - position.z - 100,
        finisher ? 248 : state.heroId === 'guanyu' ? 142 : 174,
        facing,
        Math.max(0.24, player.attackTimer + 0.08),
        0,
        0.92,
      );
      if (finisher) this.spawnSpriteEffect('vfx/dust', position.x, position.y - 8, 165, facing, 0.48);
      return;
    }
    if (state.heroId === 'zhaoyun') {
      const endX = position.x;
      const startX = Math.abs(endX - previousX) > 25 ? previousX : endX - facing * 180;
      for (let index = 0; index < 4; index += 1) {
        const progress = index / 3;
        const x = startX + (endX - startX) * progress;
        this.spawnSpriteEffect('vfx/thrust', x, position.y - position.z - 105, 178, facing, 0.34, 0, 0.88);
        this.spawnAfterimage('zhaoyun/heavy', x, position.y - position.z, facing, index + 2);
      }
    } else if (state.heroId === 'zhangfei') {
      this.spawnSpriteEffect('vfx/shockwave', position.x, position.y - 35, 330, facing, 0.68, 0, 0.92);
    }
    if (state.heroId === 'zhaoyun') this.spawnSpriteEffect('vfx/dust', position.x, position.y - 8, 125, facing, 0.42, 0, 0.8);
  }

  private startMusouEffects(state: GameState): void {
    const player = state.player;
    this.musouFlash = 0.12;
    this.cameraPunch = 0.35;
    if (state.heroId === 'zhaoyun') {
      const startX = player.facing > 0 ? state.arenaStartX : state.arenaEndX;
      const endX = player.facing > 0 ? state.arenaEndX : state.arenaStartX;
      this.spawnSpriteEffect('vfx/dragon_azure', startX, player.y - 155, 510, player.facing, 1.95, 0, 0.95, false, endX);
    } else if (state.heroId === 'guanyu') {
      this.spawnSpriteEffect('vfx/dragon_green', player.x, player.y - 165, 540, player.facing, 1.25, 0, 0.95);
    } else {
      this.spawnSpriteEffect('vfx/shockwave', player.x, player.y - 35, 590, player.facing, 1.35, 0, 0.95);
      this.spawnSpriteEffect('vfx/fire', player.x, player.y - 145, 325, player.facing, 1.2, 0, 0.88);
    }
  }

  private spawnSpriteEffect(
    key: string,
    x: number,
    y: number,
    height: number,
    facing: 1 | -1 = 1,
    duration = 0.36,
    rotation = 0,
    alpha = 1,
    loop = false,
    endX?: number,
  ): void {
    if (this.spriteEffects.length >= 60) this.spriteEffects.shift();
    this.spriteEffects.push({ key, x, y, height, facing, age: 0, duration, rotation, alpha, loop, endX });
  }

  private spawnAfterimage(key: string, x: number, y: number, facing: 1 | -1, frame: number): void {
    if (this.rendererAfterimages.length >= 16) this.rendererAfterimages.shift();
    this.rendererAfterimages.push({ key, x, y, facing, frame, age: 0, duration: 0.24 });
  }

  private updateSpriteEffects(elapsed: number): void {
    for (const effect of this.spriteEffects) effect.age += elapsed;
    for (let index = this.spriteEffects.length - 1; index >= 0; index -= 1) {
      if (this.spriteEffects[index]!.age >= this.spriteEffects[index]!.duration) this.spriteEffects.splice(index, 1);
    }
  }

  private updateAfterimages(elapsed: number): void {
    for (const image of this.rendererAfterimages) image.age += elapsed;
    for (let index = this.rendererAfterimages.length - 1; index >= 0; index -= 1) {
      if (this.rendererAfterimages[index]!.age >= this.rendererAfterimages[index]!.duration) this.rendererAfterimages.splice(index, 1);
    }
  }

  private updateCorpses(elapsed: number): void {
    for (const corpse of this.corpses) corpse.age += elapsed;
    for (let index = this.corpses.length - 1; index >= 0; index -= 1) {
      if (this.corpses[index]!.age >= this.corpses[index]!.animationDuration + 0.8) this.corpses.splice(index, 1);
    }
  }

  private drawSpriteEffects(cameraX: number): void {
    const context = this.context;
    for (const effect of this.spriteEffects) {
      const progress = clampValue(effect.age / effect.duration, 0, 1);
      const entry = animationBank.getEntry(effect.key);
      if (!entry) continue;
      const frame = effect.loop ? this.animationTime * 16 : progress * entry.frames;
      const fade = progress > 0.82 ? (1 - progress) / 0.18 : 1;
      context.save();
      const x = effect.endX === undefined ? effect.x : effect.x + (effect.endX - effect.x) * progress;
      context.translate(x - cameraX, effect.y);
      context.rotate(effect.rotation);
      animationBank.drawAnim(context, effect.key, frame, 0, 0, effect.height, effect.facing, {
        alpha: effect.alpha * fade,
      });
      context.restore();
    }
  }

  private drawRendererAfterimages(cameraX: number): void {
    for (const image of this.rendererAfterimages) {
      const alpha = (1 - image.age / image.duration) * 0.36;
      animationBank.drawAnim(this.context, image.key, image.frame + image.age * 16, image.x - cameraX, image.y, 190, image.facing, {
        alpha,
        tint: 'blue',
      });
    }
  }

  private drawBackground(act: 1 | 2, cameraX: number): void {
    const context = this.context;
    const path = `scenes/act${act}_bg.jpg`;
    const image = this.assets.load(path);
    const loaded = image.complete && image.naturalWidth > 0;
    let layer = this.backgrounds.get(act);
    if (!layer || layer.dpr !== this.dpr || layer.loaded !== loaded) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(WIDTH * this.dpr);
      canvas.height = Math.round(HEIGHT * this.dpr);
      const layerContext = canvas.getContext('2d');
      if (!layerContext) return;
      layerContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (loaded) {
        layerContext.drawImage(image, 0, 0, WIDTH, HEIGHT);
        layerContext.fillStyle = 'rgba(11, 10, 12, .1)';
        layerContext.fillRect(0, 0, WIDTH, HEIGHT);
      } else {
        const sky = layerContext.createLinearGradient(0, 0, 0, HEIGHT);
        sky.addColorStop(0, '#191518');
        sky.addColorStop(0.65, act === 1 ? '#40312b' : '#27191a');
        sky.addColorStop(1, '#171213');
        layerContext.fillStyle = sky;
        layerContext.fillRect(0, 0, WIDTH, HEIGHT);
        this.drawFallbackMountains(layerContext, act);
      }
      layer = { canvas, dpr: this.dpr, loaded };
      this.backgrounds.set(act, layer);
    }
    const tileWidth = 1280;
    const offset = -((cameraX * 0.2) % tileWidth);
    for (let x = offset - tileWidth; x < WIDTH + tileWidth; x += tileWidth * 2) {
      context.drawImage(layer.canvas, x, 0, tileWidth, HEIGHT);
      context.save();
      context.translate(x + tileWidth * 2, 0);
      context.scale(-1, 1);
      context.drawImage(layer.canvas, 0, 0, tileWidth, HEIGHT);
      context.restore();
    }
  }

  private drawFallbackMountains(context: CanvasRenderingContext2D, act: 1 | 2): void {
    context.fillStyle = act === 1 ? '#302421' : '#24191b';
    context.beginPath();
    context.moveTo(0, 460);
    for (let x = 0; x <= WIDTH; x += 110) context.lineTo(x, 330 + Math.sin(x * 0.014) * 60 + Math.cos(x * 0.024) * 32);
    context.lineTo(WIDTH, HEIGHT);
    context.lineTo(0, HEIGHT);
    context.fill();
    context.fillStyle = 'rgba(10, 9, 10, .42)';
    context.fillRect(0, 415, WIDTH, 305);
  }

  private drawGround(cameraX: number): void {
    const context = this.context;
    const drift = -(cameraX * 0.8) % 180;
    context.save();
    context.strokeStyle = 'rgba(220, 183, 122, .12)';
    context.lineWidth = 1;
    for (let x = drift - 180; x < WIDTH + 180; x += 180) {
      context.beginPath();
      context.moveTo(x, 652);
      context.lineTo(x + 28, 624);
      context.stroke();
    }
    context.restore();
  }

  private drawPlayer(engine: GameEngine, cameraX: number): void {
    const { state } = engine;
    const player = state.player;
    const position = this.interpolatePosition(player, this.previousPlayer);
    const hero = getHero(state.heroId);
    const x = position.x - cameraX;
    const footY = position.y - position.z;
    const dead = player.hp <= 0 || (state.gameOver && !state.victory);
    let key = `${state.heroId}/idle`;
    let frame = Math.floor(this.animationTime * 6);
    if (dead) {
      key = `${state.heroId}/down`;
      frame = Math.min(1, Math.floor(this.playerDownElapsed * 8));
    } else if (state.musouSequence) {
      key = `${state.heroId}/musou`;
      const duration = state.heroId === 'zhaoyun' ? 1.8 : state.heroId === 'guanyu' ? 0.8 : 0.9;
      frame = state.musouSequence.elapsed / duration * 8;
    } else if (player.dodgeTimer > 0) {
      key = `${state.heroId}/dodge`;
      frame = (1 - player.dodgeTimer / 0.22) * 4;
    } else if (player.stun > 0) {
      key = `${state.heroId}/hurt`;
      frame = Math.floor(this.animationTime * 8);
    } else if (player.airborne || player.z > 0) {
      key = `${state.heroId}/jump`;
      frame = this.jumpElapsed < 0.06 || this.landingCrouch > 0
        ? 0
        : player.jumpVelocity > 85 ? 1 : player.jumpVelocity < -85 ? 3 : 2;
    } else if (player.attackTimer > 0 && this.activeAttack) {
      const count = animationBank.getEntry(`${state.heroId}/${this.activeAttack.heavy ? 'heavy' : `light${this.activeAttack.hitIndex + 1}`}`)?.frames ?? 4;
      const progress = 1 - player.attackTimer / Math.max(0.01, this.activeAttack.initialTimer);
      key = `${state.heroId}/${this.activeAttack.heavy ? 'heavy' : `light${this.activeAttack.hitIndex + 1}`}`;
      frame = clampValue(progress, 0, 1) * count;
    } else if (Math.abs(player.vx) > 12 || Math.abs(player.vz) > 12) {
      key = `${state.heroId}/run`;
      const speed = Math.max(Math.abs(player.vx) / hero.speed, Math.abs(player.vz) / (hero.speed * 0.58));
      frame = this.animationTime * 8 / 0.55 * Math.max(0.2, Math.min(1, speed));
    }
    this.drawShadow(x, position.y, 38);
    const weapon = hero.id === 'guanyu' ? 'guandao' : hero.id === 'zhangfei' ? 'axe' : 'spear';
    const fallbackPose = key.endsWith('/heavy') || key.endsWith('/musou')
      ? 'skill'
      : key.includes('/light') ? 'attack' : 'idle';
    this.drawAnimatedActor(
      key,
      frame,
      heroSpritePath(state.heroId, fallbackPose),
      x,
      footY,
      190,
      player.facing,
      hero.color,
      weapon,
      player.hitFlash,
    );
  }

  private drawEnemy(enemy: EnemyState, cameraX: number): void {
    const position = this.interpolatePosition(enemy, this.previousEnemies.get(enemy.id));
    const x = position.x - cameraX;
    const footY = position.y - position.z;
    if (x < -350 || x > WIDTH + 350) return;
    this.drawShadow(x, position.y, enemy.boss ? 56 : 34);
    const height = enemy.boss ? 260 : enemy.kind === 'cavalry' ? 200 : 170;
    if (enemy.boss && enemy.phase === 2) {
      this.context.save();
      const auraAlpha = 0.38 + Math.sin(this.animationTime * 11) * 0.12;
      this.context.strokeStyle = '#bf242b';
      this.context.globalAlpha = auraAlpha * 0.22;
      this.context.lineWidth = 24;
      this.context.beginPath();
      this.context.ellipse(x, position.y - 92, 98, 112, this.animationTime * 0.7, 0, Math.PI * 2);
      this.context.stroke();
      this.context.globalAlpha = auraAlpha;
      this.context.lineWidth = 8;
      this.context.beginPath();
      this.context.ellipse(x, position.y - 92, 98, 112, this.animationTime * 0.7, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
    if (enemy.elite) {
      const affixColor = enemy.affix === '铁甲' ? '#79c7e8' : enemy.affix === '嗜血' ? '#8bd47e' : '#f26a55';
      this.context.save();
      this.context.strokeStyle = affixColor;
      const outlineAlpha = 0.72 + Math.sin(this.animationTime * 7) * 0.15;
      this.context.globalAlpha = outlineAlpha * 0.22;
      this.context.lineWidth = 9;
      this.context.strokeRect(x - 32, footY - height + 7, 64, height - 13);
      this.context.globalAlpha = outlineAlpha;
      this.context.lineWidth = 3;
      this.context.strokeRect(x - 32, footY - height + 7, 64, height - 13);
      this.context.restore();
    }
    const { key, frame } = this.enemyAnimation(enemy);
    const pose = ['windup', 'attack', 'recover', 'charging'].includes(enemy.action) ? 'attack' : 'idle';
    this.drawAnimatedActor(
      key,
      frame,
      enemySpritePath(enemy.kind, pose, enemy.boss),
      x,
      footY,
      height,
      enemy.facing,
      ENEMIES[enemy.kind].color,
      enemy.kind === 'shield' ? 'shield' : enemy.kind === 'cavalry' ? 'spear' : 'saber',
      enemy.flash,
      this.stateActTint(enemy),
      enemy.action === 'down' ? 0.72 : 1,
    );
    if (enemy.elite || (enemy.hp < enemy.maxHp && !enemy.boss)) {
      this.context.save();
      const barY = footY - height - (enemy.elite ? 24 : 12);
      this.context.fillStyle = 'rgba(18, 12, 11, .78)';
      this.context.fillRect(x - 34, barY, 68, 5);
      this.context.fillStyle = enemy.elite ? '#d9b45e' : '#be5140';
      this.context.fillRect(x - 33, barY + 1, 66 * Math.max(0, enemy.hp / enemy.maxHp), 3);
      if (enemy.elite) {
        this.context.fillStyle = enemy.affix === '铁甲' ? '#a8def1' : enemy.affix === '嗜血' ? '#b5e29b' : '#ff9877';
        this.context.font = '700 12px "Noto Serif SC", serif';
        this.context.textAlign = 'center';
        this.context.fillStyle = 'rgba(16, 10, 9, .9)';
        this.context.fillText(enemy.affix ?? '精锐', x + 1, barY - 3);
        this.context.fillStyle = enemy.affix === '铁甲' ? '#a8def1' : enemy.affix === '嗜血' ? '#b5e29b' : '#ff9877';
        this.context.fillText(enemy.affix ?? '精锐', x, barY - 4);
      }
      this.context.restore();
    }
  }

  private enemyAnimation(enemy: EnemyState): { key: string; frame: number } {
    const phase = (enemy.id % 13) * 0.29;
    const count = (animation: string): number => animationBank.getEntry(`${enemy.kind}/${animation}`)?.frames ?? 4;
    if (enemy.stun > 0 || enemy.action === 'stunned') {
      return { key: `${enemy.kind}/hurt`, frame: Math.floor((this.animationTime * 8 + phase) % count('hurt')) };
    }
    if (enemy.action === 'down' && enemy.z > 0) {
      return { key: `${enemy.kind}/air`, frame: enemy.z > 45 ? 0 : 1 };
    }
    if (enemy.action === 'down') {
      return { key: `${enemy.kind}/death`, frame: enemy.downTimer > 0.22 ? 1 : 2 };
    }
    if (enemy.boss && enemy.kind === 'lvbu' && enemy.action === 'charging') {
      return { key: 'lvbu/charge', frame: Math.floor((this.animationTime * 12 + phase) % count('charge')) };
    }
    if (enemy.boss && enemy.kind === 'zhangjiao'
      && ['orbs', 'summon', 'teleport'].includes(enemy.pattern ?? '')
      && ['windup', 'attack', 'recover'].includes(enemy.action)) {
      const frame = enemy.action === 'windup'
        ? Math.floor(clampValue(1 - enemy.timer / 0.68, 0, 0.99) * 2)
        : 2 + Math.floor(clampValue(1 - enemy.timer / 0.68, 0, 0.99) * 2);
      return { key: 'zhangjiao/cast', frame };
    }
    if (['windup', 'attack', 'recover', 'charging'].includes(enemy.action)) {
      const frames = count('attack');
      const windupDuration = enemy.boss
        ? enemy.pattern === 'lightning' ? 1 : enemy.pattern === 'charge' ? 0.8 : 0.68
        : enemy.kind === 'cavalry' ? 0.8 : enemy.kind === 'archer' ? 0.52 : 0.5;
      const recoveryDuration = enemy.pattern === 'slam' ? 0.9 : enemy.boss ? 0.68 : 0.65;
      const frame = enemy.action === 'windup'
        ? Math.floor(clampValue(1 - enemy.timer / windupDuration, 0, 0.99) * 2)
        : 2 + Math.floor(clampValue(1 - enemy.timer / recoveryDuration, 0, 0.99) * Math.max(1, frames - 2));
      return { key: `${enemy.kind}/attack`, frame };
    }
    const moving = this.movingEnemyIds.has(enemy.id);
    const animation = enemy.boss && !moving ? 'idle' : 'walk';
    return { key: `${enemy.kind}/${animation}`, frame: Math.floor((this.animationTime * 8 + phase) % count(animation)) };
  }

  private drawAnimatedActor(
    key: string,
    frame: number,
    fallbackPath: string,
    x: number,
    footY: number,
    height: number,
    facing: 1 | -1,
    color: string,
    weapon: 'spear' | 'shield' | 'saber' | 'guandao' | 'axe',
    hitFlash = 0,
    tint?: string,
    opacity = 1,
  ): void {
    if (animationBank.drawAnim(this.context, key, frame, x, footY, height, facing, { alpha: opacity, flash: hitFlash, tint })) return;
    this.drawActor(fallbackPath, x, footY, height, facing, color, weapon, hitFlash, tint, opacity);
  }

  private drawCorpse(corpse: EnemyCorpse, cameraX: number): void {
    const x = corpse.x - cameraX;
    if (x < -350 || x > WIDTH + 350) return;
    this.drawShadow(x, corpse.y, corpse.boss ? 56 : 34);
    const key = `${corpse.kind}/death`;
    const count = animationBank.getEntry(key)?.frames ?? 2;
    const progress = Math.min(1, corpse.age / corpse.animationDuration);
    const frame = Math.min(count - 1, Math.floor(progress * count));
    const alpha = corpse.age <= corpse.animationDuration ? 1 : Math.max(0, 1 - (corpse.age - corpse.animationDuration) / 0.8);
    const drawn = animationBank.drawAnim(this.context, key, frame, x, corpse.y - corpse.z, corpse.height, corpse.facing, {
      alpha,
      tint: corpse.tint,
    });
    if (!drawn) {
      const weapon = corpse.kind === 'shield' ? 'shield' : corpse.kind === 'cavalry' ? 'spear' : 'saber';
      this.drawActor(
        enemySpritePath(corpse.kind, 'idle', corpse.boss),
        x,
        corpse.y - corpse.z,
        corpse.height,
        corpse.facing,
        ENEMIES[corpse.kind].color,
        weapon,
        0,
        corpse.tint,
        alpha,
      );
    }
  }

  private stateActTint(enemy: EnemyState): string | undefined {
    return this.currentAct === 2 && !enemy.boss ? 'act2' : undefined;
  }

  private get currentAct(): 1 | 2 {
    return this.activeAct;
  }

  private activeAct: 1 | 2 = 1;

  private drawActor(
    path: string,
    x: number,
    footY: number,
    height: number,
    facing: 1 | -1,
    color: string,
    weapon: 'spear' | 'shield' | 'saber' | 'guandao' | 'axe',
    hitFlash = 0,
    tint?: string,
    opacity = 1,
  ): void {
    const context = this.context;
    const flashAlpha = Math.min(0.6, Math.max(0, hitFlash / 0.12 * 0.6));
    context.save();
    context.globalAlpha = opacity;
    context.translate(x, footY);
    const drawn = this.assets.drawSprite(context, path, 0, 0, height, facing, { tint, alpha: opacity });
    if (!drawn) this.drawFallbackFighter(0, 0, facing, color, height, weapon);
    if (flashAlpha > 0) {
      context.globalAlpha = opacity * flashAlpha;
      const flashDrawn = this.assets.drawSprite(context, path, 0, 0, height, facing, { white: true, alpha: opacity * flashAlpha });
      if (!flashDrawn) this.drawFallbackFighter(0, 0, facing, '#fff', height, weapon);
    }
    context.restore();
  }

  private drawFallbackFighter(
    x: number,
    footY: number,
    facing: 1 | -1,
    color: string,
    height: number,
    weapon: 'spear' | 'shield' | 'saber' | 'guandao' | 'axe',
  ): void {
    const context = this.context;
    const scale = height / 190;
    context.save();
    context.translate(x, footY);
    context.scale(facing, 1);
    context.fillStyle = color;
    context.strokeStyle = '#181113';
    context.lineWidth = 4 * scale;
    context.beginPath();
    context.ellipse(0, -height * 0.85, height * 0.11, height * 0.12, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-height * 0.15, -height * 0.69);
    context.lineTo(height * 0.16, -height * 0.69);
    context.lineTo(height * 0.22, -height * 0.23);
    context.lineTo(-height * 0.2, -height * 0.23);
    context.closePath();
    context.fill();
    context.stroke();
    context.strokeStyle = '#211618';
    context.lineWidth = 8 * scale;
    context.beginPath();
    context.moveTo(-height * 0.12, -height * 0.25);
    context.lineTo(-height * 0.2, -4);
    context.moveTo(height * 0.12, -height * 0.25);
    context.lineTo(height * 0.2, -4);
    context.stroke();
    context.strokeStyle = '#c7ac7a';
    context.lineWidth = 5 * scale;
    context.beginPath();
    if (weapon === 'shield') {
      context.fillStyle = '#8b6635';
      context.beginPath();
      context.ellipse(height * 0.23, -height * 0.52, height * 0.085, height * 0.14, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(height * 0.08, -height * 0.5);
      context.lineTo(height * (weapon === 'spear' ? 0.82 : weapon === 'guandao' ? 0.7 : 0.58), -height * 0.42);
      context.stroke();
      context.fillStyle = weapon === 'axe' ? '#c45a43' : '#ded3b7';
      context.beginPath();
      context.moveTo(height * 0.8, -height * 0.42);
      context.lineTo(height * 0.68, -height * 0.5);
      context.lineTo(height * 0.69, -height * 0.34);
      context.fill();
    }
    context.restore();
  }

  private drawShadow(x: number, y: number, width: number): void {
    const context = this.context;
    context.save();
    context.fillStyle = 'rgba(8, 7, 8, .48)';
    context.beginPath();
    context.ellipse(x, y - 1, width, width * 0.24, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawTelegraphs(engine: GameEngine, cameraX: number): void {
    const context = this.context;
    for (const enemy of engine.state.enemies) {
      if (enemy.telegraph <= 0 && enemy.action !== 'charging') continue;
      const x = enemy.x - cameraX;
      const alpha = 0.28 + Math.sin(this.animationTime * 18) * 0.1;
      context.save();
      context.globalAlpha = alpha;
      context.strokeStyle = '#ef4037';
      context.fillStyle = 'rgba(210, 40, 34, .12)';
      const lineWidth = enemy.boss ? 4 : 3;
      const strokeGlow = (): void => {
        context.globalAlpha = alpha * 0.22;
        context.lineWidth = lineWidth * 3;
        context.stroke();
        context.globalAlpha = alpha;
        context.lineWidth = lineWidth;
        context.stroke();
      };
      context.lineWidth = lineWidth;
      if (enemy.telegraphKind === 'charge') {
        const endX = x + enemy.facing * Math.min(900, enemy.chargeRemaining || 900);
        context.beginPath();
        context.moveTo(x, enemy.y + 2);
        context.lineTo(endX, enemy.y + 2);
        strokeGlow();
        context.setLineDash([10, 8]);
        context.beginPath();
        context.moveTo(x, enemy.y - 12);
        context.lineTo(endX, enemy.y - 12);
        strokeGlow();
      } else if (enemy.telegraphKind === 'sweep') {
        context.beginPath();
        context.ellipse(x + enemy.facing * 100, enemy.y - 90, 180, 88, 0, -1.15, 1.15);
        context.fill();
        strokeGlow();
        context.setLineDash([8, 6]);
        context.beginPath();
        context.arc(x, enemy.y - 90, 190, enemy.facing > 0 ? -1.15 : Math.PI - 1.15, enemy.facing > 0 ? 1.15 : Math.PI + 1.15);
        strokeGlow();
      } else if (enemy.telegraphKind === 'slam') {
        context.beginPath();
        context.ellipse(x, enemy.y, 72 + (1 - enemy.timer / 0.55) * 100, 25 + (1 - enemy.timer / 0.55) * 30, 0, 0, Math.PI * 2);
        context.fill();
        strokeGlow();
      } else if (enemy.telegraphKind === 'orb' || enemy.telegraphKind === 'teleport') {
        context.beginPath();
        context.arc(x, enemy.y - 88, enemy.telegraphKind === 'orb' ? 34 : 54, 0, Math.PI * 2);
        strokeGlow();
        context.beginPath();
        context.arc(x, enemy.y - 88, enemy.telegraphKind === 'orb' ? 20 : 34, this.animationTime * 2, this.animationTime * 2 + Math.PI * 1.4);
        strokeGlow();
      } else {
        context.beginPath();
        context.ellipse(x + enemy.facing * 55, enemy.y - 16, enemy.boss ? 190 : 95, 34, 0, 0, Math.PI * 2);
        context.fill();
        strokeGlow();
      }
      context.restore();
    }
    for (const telegraph of engine.state.groundTelegraphs) {
      const x = telegraph.x - cameraX;
      const progress = Math.min(1, telegraph.timer / telegraph.duration);
      const radius = telegraph.kind === 'lightning'
        ? telegraph.radius
        : telegraph.maxRadius * progress;
      context.save();
      const telegraphAlpha = telegraph.timer >= telegraph.duration ? 0.88 : 0.25 + progress * 0.44;
      context.globalAlpha = telegraphAlpha;
      context.strokeStyle = telegraph.owner === 'player' ? '#f5d36b' : '#f23830';
      context.fillStyle = telegraph.owner === 'player' ? 'rgba(246, 208, 94, .13)' : 'rgba(225, 45, 36, .14)';
      const lineWidth = telegraph.kind === 'lightning' ? 3 : 4;
      context.lineWidth = lineWidth;
      context.beginPath();
      if (telegraph.kind === 'lightning') {
        context.ellipse(x, telegraph.y, radius, radius * 0.32, 0, 0, Math.PI * 2);
      } else {
        context.ellipse(x, telegraph.y, radius, radius * 0.32, 0, 0, Math.PI * 2);
      }
      context.fill();
      context.globalAlpha = telegraphAlpha * 0.22;
      context.lineWidth = lineWidth * 3;
      context.stroke();
      context.globalAlpha = telegraphAlpha;
      context.lineWidth = lineWidth;
      context.stroke();
      context.restore();
    }
  }

  private drawProjectiles(engine: GameEngine, cameraX: number): void {
    const context = this.context;
    for (const projectile of engine.state.projectiles) {
      const position = this.interpolatePosition(projectile, this.previousProjectiles.get(projectile.id));
      const x = position.x - cameraX;
      const y = position.y - position.z;
      const angle = Math.atan2(projectile.vy, projectile.vx);
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.globalAlpha = Math.min(1, projectile.lifetime * 2);
      if (projectile.kind === 'arrow') {
        const alpha = context.globalAlpha;
        context.strokeStyle = '#e9d7ad';
        context.globalAlpha = alpha * 0.25;
        context.lineWidth = 9;
        context.beginPath();
        context.moveTo(-22, 0);
        context.lineTo(12, 0);
        context.stroke();
        context.globalAlpha = alpha;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(-22, 0);
        context.lineTo(12, 0);
        context.stroke();
        context.fillStyle = '#f8e7c1';
        context.beginPath();
        context.moveTo(19, 0);
        context.lineTo(9, -4);
        context.lineTo(9, 4);
        context.fill();
      } else if (projectile.kind === 'crescent') {
        if (animationBank.drawAnim(context, 'vfx/slash_gold', this.animationTime * 16, 0, 0, 142, projectile.vx >= 0 ? 1 : -1, {
          alpha: Math.min(1, projectile.lifetime * 2),
        })) {
          context.restore();
          continue;
        }
        const alpha = context.globalAlpha;
        context.strokeStyle = projectile.owner === 'player' ? '#c5f1ec' : '#f7cb68';
        context.globalAlpha = alpha * 0.22;
        context.lineWidth = 30;
        context.beginPath();
        context.arc(0, 0, 28, -1.1, 1.1);
        context.stroke();
        context.globalAlpha = alpha;
        context.lineWidth = 10;
        context.beginPath();
        context.arc(0, 0, 28, -1.1, 1.1);
        context.stroke();
        context.strokeStyle = '#fff7da';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, 0, 21, -0.9, 0.9);
        context.stroke();
      } else {
        const diameter = (projectile.radius + 8) * 2;
        context.drawImage(this.orbTexture, -diameter / 2, -diameter / 2, diameter, diameter);
      }
      context.restore();
    }
  }

  private drawDamageNumbers(engine: GameEngine, cameraX: number): void {
    const context = this.context;
    context.save();
    context.textAlign = 'center';
    for (const number of engine.state.floatingNumbers) {
      context.globalAlpha = Math.min(1, number.timer * 1.5);
      context.font = `${number.crit ? '900 32px' : '700 21px'} "Noto Serif SC", serif`;
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(20, 12, 10, .8)';
      context.fillStyle = number.value < 0 ? '#ef7564' : number.crit ? '#ffd66a' : '#fff0d2';
      context.strokeText(String(Math.abs(number.value)), number.x - cameraX, number.y);
      context.fillText(String(Math.abs(number.value)), number.x - cameraX, number.y);
      if (number.crit) {
        context.font = '900 13px "Noto Serif SC", serif';
        context.strokeText(number.label ?? '暴击', number.x - cameraX, number.y - 25);
        context.fillStyle = '#ffe39a';
        context.fillText(number.label ?? '暴击', number.x - cameraX, number.y - 25);
      }
    }
    context.restore();
  }

  private handleEvents(engine: GameEngine): void {
    const { state } = engine;
    const events = state.events;
    if (events.length < this.lastEventIndex) this.lastEventIndex = 0;
    for (const event of events.slice(this.lastEventIndex)) {
      const latestNumber = state.floatingNumbers[state.floatingNumbers.length - 1];
      const eventX = latestNumber ? latestNumber.x - state.cameraX : state.player.x - state.cameraX;
      const eventY = latestNumber?.y ?? state.player.y - state.player.z - 80;
      if (event === '击破') {
        this.audio.play('hit');
        this.spawnParticles(9, '#e9b85f', eventX, eventY);
      } else if (event === '闪避' || event === '刹那') {
        this.audio.play('dodge');
        this.spawnParticles(6, '#d4e7e4', eventX, eventY);
        if (event === '闪避') this.spawnSpriteEffect('vfx/dust', state.player.x, state.player.y - 8, 125, state.player.facing, 0.42);
      } else if (event === '破防' || event === '狂怒') {
        this.audio.play('heavy');
        this.spawnParticles(12, '#e96645', eventX, eventY);
      } else if (event === '受击') {
        this.audio.play('hit');
        this.spawnParticles(8, '#ef876d', state.player.x - state.cameraX, state.player.y - state.player.z - 72);
      } else if (event === '命中火花') {
        this.spawnParticles(7, '#fff0c7', eventX, eventY);
      } else if (event === '落地') {
        this.spawnParticles(9, '#b7a28b', state.player.x - state.cameraX, state.player.y - 4);
      } else if (event === '骑兵落马') {
        this.spawnSpriteEffect('vfx/dust', eventX + state.cameraX, eventY + 35, 175, 1, 0.5);
      } else if (event === '龙胆冲阵' || event === '刀劈千军' || event === '长坂断桥') {
        this.audio.play('musou');
      } else if (event === '百鸟朝凤' || event === '青龙斩' || event === '当阳怒吼' || event === '落地重击') {
        this.audio.play('heavy');
      } else if (event === '金甲' || event === '召唤黄巾' || event === '天公瞬移' || event === '方天横扫' || event === '飞将连击') {
        this.audio.play('crit');
      } else if (event === '格挡') {
        this.audio.play('slash');
      }
    }
    this.lastEventIndex = events.length;
  }

  private spawnParticles(count: number, color: string, originX = 640, originY = 500): void {
    for (let index = 0; index < count; index += 1) {
      if (this.particles.length >= 200) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 200;
      this.particles.push({
        x: originX + (Math.random() - 0.5) * 26,
        y: originY + (Math.random() - 0.5) * 26,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.4 + Math.random() * 0.45,
        maxLife: 0.85,
        color,
        size: 2 + Math.random() * 5,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 210 * dt;
    }
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      if (this.particles[index]!.life <= 0) this.particles.splice(index, 1);
    }
  }

  private drawParticles(): void {
    const context = this.context;
    context.save();
    for (const particle of this.particles) {
      context.globalAlpha = particle.life / particle.maxLife;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawVignette(): void {
    const context = this.context;
    if (!this.vignetteLayer || this.vignetteLayer.dpr !== this.dpr) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(WIDTH * this.dpr);
      canvas.height = Math.round(HEIGHT * this.dpr);
      const layerContext = canvas.getContext('2d');
      if (!layerContext) return;
      layerContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const gradient = layerContext.createRadialGradient(WIDTH / 2, HEIGHT / 2, 200, WIDTH / 2, HEIGHT / 2, 760);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, 'rgba(5, 4, 5, .48)');
      layerContext.fillStyle = gradient;
      layerContext.fillRect(0, 0, WIDTH, HEIGHT);
      this.vignetteLayer = { canvas, dpr: this.dpr, loaded: true };
    }
    context.drawImage(this.vignetteLayer.canvas, 0, 0, WIDTH, HEIGHT);
  }

  private createOrbTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const gradient = context.createRadialGradient(27, 27, 2, 32, 32, 32);
    gradient.addColorStop(0, '#fff3c7');
    gradient.addColorStop(0.35, '#f6c849');
    gradient.addColorStop(1, 'rgba(202, 62, 36, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return canvas;
  }
}
