import { ENEMIES } from '../data/enemies';
import { getHero, type HeroId } from '../data/heroes';
import { AssetLoader, enemySpritePath, heroSpritePath } from './assets';
import type { GameEngine } from '../engine/engine';
import type { EnemyState } from '../engine/types';
import { AudioSynth } from './audio';

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

interface SlashEffect {
  x: number;
  y: number;
  facing: 1 | -1;
  heroId: HeroId;
  hitIndex: number;
  heavy: boolean;
  age: number;
  duration: number;
}

export class BattleRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly assets = new AssetLoader();
  private readonly particles: Particle[] = [];
  private readonly slashEffects: SlashEffect[] = [];
  private lastEventIndex = 0;
  private lastAttackSerial = 0;
  private dustTimer = 0;
  private animationTime = 0;
  private readonly dpr = Math.min(2, window.devicePixelRatio || 1);
  private readonly audio: AudioSynth;

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
  }

  render(engine: GameEngine, elapsed = 1 / 60): void {
    const state = engine.state;
    this.activeAct = state.act;
    const context = this.context;
    this.animationTime += elapsed;
    this.handleEvents(engine);
    if (state.player.attackSerial !== this.lastAttackSerial) {
      this.slashEffects.push({
        x: state.player.x,
        y: state.player.y - state.player.z - 94,
        facing: state.player.facing,
        heroId: state.heroId,
        hitIndex: state.player.comboFinished ? 4 : Math.max(0, state.player.comboIndex - 1),
        heavy: state.player.lastAttackWasHeavy,
        age: 0,
        duration: state.player.lastAttackWasHeavy ? 0.38 : 0.3,
      });
      this.lastAttackSerial = state.player.attackSerial;
    }
    for (const slash of this.slashEffects) slash.age += elapsed;
    for (let index = this.slashEffects.length - 1; index >= 0; index -= 1) {
      if (this.slashEffects[index]!.age >= this.slashEffects[index]!.duration) this.slashEffects.splice(index, 1);
    }
    this.dustTimer -= elapsed;
    if (Math.abs(state.player.vx) > 12 && this.dustTimer <= 0) {
      this.spawnParticles(2, '#b7a28b', state.player.x - state.cameraX, state.player.y - 7);
      this.dustTimer = 0.14;
    }
    this.updateParticles(elapsed);

    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 : 0;
    context.save();
    context.translate(shakeX, shakeY);
    this.drawBackground(state.act, state.cameraX);
    this.drawGround(state.cameraX);
    this.drawTelegraphs(engine);
    this.drawProjectiles(engine, state.cameraX);
    for (const image of engine.afterimages) {
      this.assets.drawSprite(context, heroSpritePath(state.heroId, 'idle'), image.x - state.cameraX, image.y, 190, state.player.facing, { alpha: image.timer / 0.32 });
    }
    const renderables = [...state.enemies.map((enemy) => ({ y: enemy.y, enemy })), { y: state.player.y, enemy: null }];
    renderables.sort((a, b) => a.y - b.y);
    for (const item of renderables) {
      if (item.enemy) this.drawEnemy(item.enemy, state.cameraX);
      else this.drawPlayer(engine, state.cameraX);
    }
    this.drawParticles();
    this.drawSlash(state.cameraX);
    this.drawDamageNumbers(engine, state.cameraX);
    this.drawVignette();
    if (state.musouSequence) {
      context.fillStyle = 'rgba(8, 6, 10, .34)';
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }
    context.restore();
  }

  private drawBackground(act: 1 | 2, cameraX: number): void {
    const context = this.context;
    const path = `scenes/act${act}_bg.jpg`;
    const image = this.assets.load(path);
    if (!image.complete || !image.naturalWidth) {
      const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, '#191518');
      sky.addColorStop(0.65, act === 1 ? '#40312b' : '#27191a');
      sky.addColorStop(1, '#171213');
      context.fillStyle = sky;
      context.fillRect(0, 0, WIDTH, HEIGHT);
      this.drawFallbackMountains(act);
      return;
    }
    const tileWidth = 1280;
    const offset = -((cameraX * 0.2) % tileWidth);
    for (let x = offset - tileWidth; x < WIDTH + tileWidth; x += tileWidth * 2) {
      context.drawImage(image, x, 0, tileWidth, HEIGHT);
      context.save();
      context.translate(x + tileWidth * 2, 0);
      context.scale(-1, 1);
      context.drawImage(image, 0, 0, tileWidth, HEIGHT);
      context.restore();
    }
    context.fillStyle = 'rgba(11, 10, 12, .1)';
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }

  private drawFallbackMountains(act: 1 | 2): void {
    const context = this.context;
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
    const hero = getHero(state.heroId);
    const x = player.x - cameraX;
    const footY = player.y - player.z;
    const pose = player.attackTimer > 0
      ? (player.lastAttackWasHeavy ? 'skill' : 'attack')
      : 'idle';
    const bob = player.attackTimer > 0 ? 0 : Math.sin(this.animationTime * 12) * 3;
    const lean = player.attackTimer > 0 ? 0 : clampValue(player.vx / hero.speed, -1, 1) * 0.045;
    this.drawShadow(x, player.y, 38);
    const weapon = hero.id === 'guanyu' ? 'guandao' : hero.id === 'zhangfei' ? 'axe' : 'spear';
    this.drawActor(
      heroSpritePath(state.heroId, pose),
      x,
      footY + bob,
      190,
      player.facing,
      hero.color,
      weapon,
      lean,
      player.hitFlash,
    );
  }

  private drawEnemy(enemy: EnemyState, cameraX: number): void {
    const x = enemy.x - cameraX;
    const footY = enemy.y - enemy.z;
    if (x < -350 || x > WIDTH + 350) return;
    this.drawShadow(x, enemy.y, enemy.boss ? 56 : 34);
    const height = enemy.boss ? 260 : enemy.kind === 'cavalry' ? 200 : 170;
    if (enemy.boss && enemy.phase === 2) {
      this.context.save();
      this.context.globalAlpha = 0.38 + Math.sin(this.animationTime * 11) * 0.12;
      this.context.strokeStyle = '#bf242b';
      this.context.shadowColor = '#f02f32';
      this.context.shadowBlur = 24;
      this.context.lineWidth = 8;
      this.context.beginPath();
      this.context.ellipse(x, enemy.y - 92, 98, 112, this.animationTime * 0.7, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
    if (enemy.elite) {
      const affixColor = enemy.affix === '铁甲' ? '#79c7e8' : enemy.affix === '嗜血' ? '#8bd47e' : '#f26a55';
      this.context.save();
      this.context.strokeStyle = affixColor;
      this.context.shadowColor = affixColor;
      this.context.shadowBlur = 18;
      this.context.globalAlpha = 0.72 + Math.sin(this.animationTime * 7) * 0.15;
      this.context.lineWidth = 3;
      this.context.strokeRect(x - 32, footY - height + 7, 64, height - 13);
      this.context.restore();
    }
    const pose = enemy.action === 'windup' || enemy.action === 'attack' || enemy.action === 'charging' ? 'attack' : 'idle';
    this.drawActor(
      enemySpritePath(enemy.kind, pose, enemy.boss),
      x,
      footY,
      height,
      enemy.facing,
      ENEMIES[enemy.kind].color,
      enemy.kind === 'shield' ? 'shield' : enemy.kind === 'cavalry' ? 'spear' : 'saber',
      Math.sin(this.animationTime * 10 + x * 0.01) * 0.02,
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
        this.context.shadowColor = '#000';
        this.context.shadowBlur = 4;
        this.context.fillText(enemy.affix ?? '精锐', x, barY - 4);
      }
      this.context.restore();
    }
    if (enemy.burn > 0) {
      for (let ember = 0; ember < 3; ember += 1) {
        const flicker = (this.animationTime * 1.8 + ember * 0.31) % 1;
        this.context.save();
        this.context.globalAlpha = 1 - flicker;
        this.context.fillStyle = ember % 2 ? '#ffd176' : '#ec5a32';
        this.context.beginPath();
        this.context.arc(x + Math.sin(this.animationTime * 8 + ember) * 24, footY - height * 0.48 - flicker * 40, 2 + flicker * 2, 0, Math.PI * 2);
        this.context.fill();
        this.context.restore();
      }
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
    lean = 0,
    hitFlash = 0,
    tint?: string,
    opacity = 1,
  ): void {
    const context = this.context;
    const flashAlpha = Math.min(0.6, Math.max(0, hitFlash / 0.12 * 0.6));
    context.save();
    context.globalAlpha = opacity;
    context.translate(x, footY);
    context.rotate(lean);
    const drawn = this.assets.drawSprite(context, path, 0, 0, height, facing, { tint, alpha: opacity });
    if (!drawn) this.drawFallbackFighter(0, 0, facing, color, height, weapon, 0);
    if (flashAlpha > 0) {
      context.globalAlpha = opacity * flashAlpha;
      const flashDrawn = this.assets.drawSprite(context, path, 0, 0, height, facing, { white: true, alpha: opacity * flashAlpha });
      if (!flashDrawn) this.drawFallbackFighter(0, 0, facing, '#fff', height, weapon, 0);
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
    lean = Math.sin(this.animationTime * 10 + x * 0.01) * 0.035,
  ): void {
    const context = this.context;
    const scale = height / 190;
    context.save();
    context.translate(x, footY);
    context.scale(facing, 1);
    context.rotate(lean);
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

  private drawSlash(cameraX: number): void {
    const context = this.context;
    for (const slash of this.slashEffects) {
      const progress = slash.age / slash.duration;
      const radius = (slash.heroId === 'guanyu' ? 126 : slash.heroId === 'zhangfei' ? 118 : 94)
        + slash.hitIndex * (slash.heroId === 'guanyu' ? 12 : 7)
        + (slash.heavy ? 42 : 0);
      const x = slash.x - cameraX + slash.facing * (slash.heroId === 'zhaoyun' ? 38 : 48);
      const y = slash.y - 11;
      context.save();
      context.translate(x, y);
      if (slash.facing < 0) context.scale(-1, 1);
      context.globalAlpha = Math.max(0, 1 - progress) * (slash.heavy ? 0.95 : 0.82);
      context.strokeStyle = slash.heavy ? '#f0c567' : slash.heroId === 'zhaoyun' ? '#e7f5f4' : '#f4e8cd';
      context.lineWidth = slash.heavy ? 10 : slash.heroId === 'zhangfei' ? 7 : 4;
      context.shadowColor = slash.heavy ? '#efaf49' : '#fff2c7';
      context.shadowBlur = slash.heavy ? 22 : 14;
      if (slash.heroId === 'zhaoyun') {
        for (let streak = 0; streak < 2 + slash.hitIndex % 2; streak += 1) {
          context.beginPath();
          context.moveTo(-18 - streak * 8, -22 + streak * 18);
          context.lineTo(radius + 18 - streak * 9, -8 + streak * 18);
          context.stroke();
        }
      } else {
        context.beginPath();
        const arcStart = slash.heroId === 'guanyu' ? -1.08 : -0.96;
        const arcEnd = slash.heroId === 'guanyu' ? 1.02 : 0.72;
        context.arc(0, 0, radius, arcStart + progress * 0.12, arcEnd + progress * 0.12);
        context.stroke();
        context.strokeStyle = '#fff6df';
        context.lineWidth = slash.heavy ? 3 : 2;
        context.beginPath();
        context.arc(0, 0, radius - 11, arcStart + 0.1, arcEnd - 0.1);
        context.stroke();
      }
      context.restore();
    }
  }

  private drawTelegraphs(engine: GameEngine): void {
    const context = this.context;
    const cameraX = engine.state.cameraX;
    for (const enemy of engine.state.enemies) {
      if (enemy.telegraph <= 0 && enemy.action !== 'charging') continue;
      const x = enemy.x - cameraX;
      const alpha = 0.28 + Math.sin(this.animationTime * 18) * 0.1;
      context.save();
      context.globalAlpha = alpha;
      context.strokeStyle = '#ef4037';
      context.fillStyle = 'rgba(210, 40, 34, .12)';
      context.shadowColor = '#f04438';
      context.shadowBlur = 14;
      context.lineWidth = enemy.boss ? 4 : 3;
      if (enemy.telegraphKind === 'charge') {
        const endX = x + enemy.facing * Math.min(900, enemy.chargeRemaining || 900);
        context.beginPath();
        context.moveTo(x, enemy.y + 2);
        context.lineTo(endX, enemy.y + 2);
        context.stroke();
        context.setLineDash([10, 8]);
        context.beginPath();
        context.moveTo(x, enemy.y - 12);
        context.lineTo(endX, enemy.y - 12);
        context.stroke();
      } else if (enemy.telegraphKind === 'sweep') {
        context.beginPath();
        context.ellipse(x + enemy.facing * 100, enemy.y - 90, 180, 88, 0, -1.15, 1.15);
        context.fill();
        context.stroke();
        context.setLineDash([8, 6]);
        context.beginPath();
        context.arc(x, enemy.y - 90, 190, enemy.facing > 0 ? -1.15 : Math.PI - 1.15, enemy.facing > 0 ? 1.15 : Math.PI + 1.15);
        context.stroke();
      } else if (enemy.telegraphKind === 'slam') {
        context.beginPath();
        context.ellipse(x, enemy.y, 72 + (1 - enemy.timer / 0.55) * 100, 25 + (1 - enemy.timer / 0.55) * 30, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      } else if (enemy.telegraphKind === 'orb' || enemy.telegraphKind === 'teleport') {
        context.beginPath();
        context.arc(x, enemy.y - 88, enemy.telegraphKind === 'orb' ? 34 : 54, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.arc(x, enemy.y - 88, enemy.telegraphKind === 'orb' ? 20 : 34, this.animationTime * 2, this.animationTime * 2 + Math.PI * 1.4);
        context.stroke();
      } else {
        context.beginPath();
        context.ellipse(x + enemy.facing * 55, enemy.y - 16, enemy.boss ? 190 : 95, 34, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
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
      context.globalAlpha = telegraph.timer >= telegraph.duration ? 0.88 : 0.25 + progress * 0.44;
      context.strokeStyle = telegraph.owner === 'player' ? '#f5d36b' : '#f23830';
      context.fillStyle = telegraph.owner === 'player' ? 'rgba(246, 208, 94, .13)' : 'rgba(225, 45, 36, .14)';
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = telegraph.kind === 'lightning' ? 18 : 10;
      context.lineWidth = telegraph.kind === 'lightning' ? 3 : 4;
      context.beginPath();
      if (telegraph.kind === 'lightning') {
        context.ellipse(x, telegraph.y, radius, radius * 0.32, 0, 0, Math.PI * 2);
      } else {
        context.ellipse(x, telegraph.y, radius, radius * 0.32, 0, 0, Math.PI * 2);
      }
      context.fill();
      context.stroke();
      if (telegraph.kind === 'lightning' && telegraph.timer >= telegraph.duration) {
        this.drawLightningBolt(x, telegraph.y, telegraph.owner === 'player' ? '#ffe68c' : '#eef2ff');
      }
      context.restore();
    }
  }

  private drawProjectiles(engine: GameEngine, cameraX: number): void {
    const context = this.context;
    for (const projectile of engine.state.projectiles) {
      const x = projectile.x - cameraX;
      const y = projectile.y - projectile.z;
      const angle = Math.atan2(projectile.vy, projectile.vx);
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.globalAlpha = Math.min(1, projectile.lifetime * 2);
      if (projectile.kind === 'arrow') {
        context.strokeStyle = '#e9d7ad';
        context.shadowColor = '#ffcf82';
        context.shadowBlur = 8;
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
        context.strokeStyle = projectile.owner === 'player' ? '#c5f1ec' : '#f7cb68';
        context.shadowColor = context.strokeStyle;
        context.shadowBlur = 20;
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
        const orbGradient = context.createRadialGradient(-5, -5, 2, 0, 0, projectile.radius + 8);
        orbGradient.addColorStop(0, '#fff3c7');
        orbGradient.addColorStop(0.35, '#f6c849');
        orbGradient.addColorStop(1, 'rgba(202, 62, 36, 0)');
        context.fillStyle = orbGradient;
        context.shadowColor = '#f6a333';
        context.shadowBlur = 18;
        context.beginPath();
        context.arc(0, 0, projectile.radius + 8, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  private drawLightningBolt(x: number, y: number, color: string): void {
    const context = this.context;
    context.save();
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 24;
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(x + Math.sin(this.animationTime * 17) * 8, y - 200);
    context.lineTo(x - 15, y - 150);
    context.lineTo(x + 12, y - 100);
    context.lineTo(x - 6, y - 54);
    context.lineTo(x, y);
    context.stroke();
    context.lineWidth = 2;
    context.strokeStyle = '#fff';
    context.stroke();
    context.restore();
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
    const gradient = context.createRadialGradient(WIDTH / 2, HEIGHT / 2, 200, WIDTH / 2, HEIGHT / 2, 760);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(5, 4, 5, .48)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
