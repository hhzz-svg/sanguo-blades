import { ENEMIES } from '../data/enemies';
import { getHero } from '../data/heroes';
import { AssetLoader, enemySpritePath, heroSpritePath } from './assets';
import type { GameEngine } from '../engine/engine';
import type { EnemyState } from '../engine/types';
import { AudioSynth } from './audio';

const WIDTH = 1280;
const HEIGHT = 720;

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

export class BattleRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly assets = new AssetLoader();
  private readonly particles: Particle[] = [];
  private lastEventIndex = 0;
  private lastAttackTimer = 0;
  private slashAge = 1;
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
    this.activeAct = state.act;
    const context = this.context;
    this.animationTime += elapsed;
    this.handleEvents(state.events);
    if (state.player.attackTimer > 0 && this.lastAttackTimer <= 0) this.slashAge = 0;
    this.lastAttackTimer = state.player.attackTimer;
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
    this.drawSlash(engine, state.cameraX);
    this.drawDamageNumbers(engine, state.cameraX);
    this.drawVignette();
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
    this.drawShadow(x, player.y, 38);
    if (player.invulnerability > 0 && Math.floor(this.animationTime * 28) % 2 === 0) {
      const flashDrawn = this.assets.drawSprite(this.context, heroSpritePath(state.heroId, pose), x, footY + bob, 190, player.facing, { white: true, alpha: 0.8 });
      if (!flashDrawn) this.drawFallbackFighter(x, footY + bob, player.facing, '#ffffff', 190, 'spear');
    } else {
      const drawn = this.assets.drawSprite(this.context, heroSpritePath(state.heroId, pose), x, footY + bob, 190, player.facing);
      if (!drawn) this.drawFallbackFighter(x, footY + bob, player.facing, hero.color, 190, 'spear');
    }
    if (player.attackTimer > 0) this.slashAge = Math.min(0.45, this.slashAge + 1 / 60);
  }

  private drawEnemy(enemy: EnemyState, cameraX: number): void {
    const x = enemy.x - cameraX;
    const footY = enemy.y - enemy.z;
    if (x < -350 || x > WIDTH + 350) return;
    this.drawShadow(x, enemy.y, enemy.boss ? 56 : 34);
    if (enemy.telegraph > 0) {
      this.context.save();
      this.context.globalAlpha = 0.16 + Math.sin(this.animationTime * 15) * 0.07;
      this.context.fillStyle = '#e52d2d';
      this.context.beginPath();
      this.context.ellipse(x, enemy.y + 1, enemy.boss ? 165 : enemy.kind === 'cavalry' ? 120 : 75, 17, 0, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
    }
    const pose = enemy.action === 'windup' || enemy.action === 'attack' ? 'attack' : 'idle';
    const height = enemy.boss ? 260 : enemy.kind === 'cavalry' ? 200 : 170;
    if (enemy.flash > 0) {
      const flashDrawn = this.assets.drawSprite(this.context, enemySpritePath(enemy.kind, pose, enemy.boss), x, footY, height, enemy.facing, { white: true, alpha: 0.85 });
      if (!flashDrawn) this.drawFallbackFighter(x, footY, enemy.facing, '#ffffff', height, enemy.kind === 'shield' ? 'shield' : 'saber');
    } else {
      const drawn = this.assets.drawSprite(this.context, enemySpritePath(enemy.kind, pose, enemy.boss), x, footY, height, enemy.facing, {
        tint: this.stateActTint(enemy),
      });
      if (!drawn) this.drawFallbackFighter(x, footY, enemy.facing, ENEMIES[enemy.kind].color, height, enemy.kind === 'shield' ? 'shield' : 'saber');
    }
    if (enemy.flash > 0) {
      this.context.save();
      this.context.fillStyle = '#fff';
      this.context.font = '600 14px "Noto Serif SC", serif';
      this.context.textAlign = 'center';
      this.context.fillText(ENEMIES[enemy.kind].name, x, footY - height - 8);
      this.context.restore();
    }
    if (enemy.kind === 'elite') {
      this.context.save();
      this.context.strokeStyle = 'rgba(255, 210, 101, .8)';
      this.context.shadowColor = '#ffce63';
      this.context.shadowBlur = 12;
      this.context.strokeRect(x - 25, footY - height + 12, 50, height - 25);
      this.context.restore();
    }
  }

  private stateActTint(enemy: EnemyState): string | undefined {
    return this.currentAct === 2 && !enemy.boss ? '145deg' : undefined;
  }

  private get currentAct(): 1 | 2 {
    return this.activeAct;
  }

  private activeAct: 1 | 2 = 1;

  private drawFallbackFighter(x: number, footY: number, facing: 1 | -1, color: string, height: number, weapon: 'spear' | 'shield' | 'saber'): void {
    const context = this.context;
    const scale = height / 190;
    const lean = Math.sin(this.animationTime * 10 + x * 0.01) * 0.035;
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
      context.lineTo(height * (weapon === 'spear' ? 0.78 : 0.58), -height * 0.42);
      context.stroke();
      context.fillStyle = '#ded3b7';
      context.beginPath();
      context.moveTo(height * 0.76, -height * 0.42);
      context.lineTo(height * 0.68, -height * 0.48);
      context.lineTo(height * 0.7, -height * 0.37);
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

  private drawSlash(engine: GameEngine, cameraX: number): void {
    const player = engine.state.player;
    if (player.attackTimer <= 0) return;
    const context = this.context;
    const heavy = player.lastAttackWasHeavy;
    const radius = heavy ? 150 : 110 + player.comboIndex * 5;
    const x = player.x - cameraX + player.facing * 42;
    const y = player.y - player.z - 105;
    context.save();
    context.translate(x, y);
    if (player.facing < 0) context.scale(-1, 1);
    context.globalAlpha = Math.min(0.85, (player.attackTimer / (heavy ? 0.54 : 0.23)) * 0.9);
    context.strokeStyle = heavy ? '#f0c567' : '#e9e0c7';
    context.lineWidth = heavy ? 9 : 5;
    context.shadowColor = heavy ? '#efaf49' : '#fff2c7';
    context.shadowBlur = 18;
    context.beginPath();
    context.arc(0, 0, radius, -0.92, 0.78);
    context.stroke();
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, radius - 9, -0.83, 0.67);
    context.stroke();
    context.restore();
  }

  private drawTelegraphs(engine: GameEngine): void {
    const context = this.context;
    for (const enemy of engine.state.enemies) {
      if (!enemy.boss || enemy.telegraph <= 0) continue;
      const x = enemy.x - engine.state.cameraX;
      context.save();
      context.fillStyle = `rgba(190, 31, 28, ${0.08 + Math.sin(this.animationTime * 18) * 0.04})`;
      context.beginPath();
      context.ellipse(x, enemy.y, 190, 42, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(230, 63, 45, .85)';
      context.setLineDash([10, 8]);
      context.stroke();
      context.restore();
    }
  }

  private drawDamageNumbers(engine: GameEngine, cameraX: number): void {
    const context = this.context;
    context.save();
    context.textAlign = 'center';
    for (const number of engine.state.floatingNumbers) {
      context.globalAlpha = Math.min(1, number.timer * 1.5);
      context.font = `${number.crit ? '900 28px' : '700 21px'} "Noto Serif SC", serif`;
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(20, 12, 10, .8)';
      context.fillStyle = number.value < 0 ? '#ef7564' : number.crit ? '#ffd66a' : '#fff0d2';
      context.strokeText(String(Math.abs(number.value)), number.x - cameraX, number.y);
      context.fillText(String(Math.abs(number.value)), number.x - cameraX, number.y);
    }
    context.restore();
  }

  private handleEvents(events: string[]): void {
    if (events.length < this.lastEventIndex) this.lastEventIndex = 0;
    for (const event of events.slice(this.lastEventIndex)) {
      if (event === '击破') {
        this.audio.play('hit');
        this.spawnParticles(9, '#e9b85f');
      } else if (event === '闪避' || event === '刹那') {
        this.audio.play('dodge');
        this.spawnParticles(6, '#d4e7e4');
      } else if (event === '破防' || event === '狂怒') {
        this.audio.play('heavy');
        this.spawnParticles(12, '#e96645');
      } else if (event === '受击') {
        this.audio.play('hit');
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

  private spawnParticles(count: number, color: string): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 200;
      this.particles.push({
        x: 640 + (Math.random() - 0.5) * 300,
        y: 500 + (Math.random() - 0.5) * 130,
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
