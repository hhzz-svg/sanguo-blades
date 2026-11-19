import { describe, expect, it } from 'vitest';
import { BLESSINGS } from '../src/data/blessings';
import { GameEngine } from '../src/engine/engine';
import { addBlessing, offerBlessings } from '../src/engine/blessings';
import { composeDamage, resolveGuardedDamage } from '../src/engine/damage';
import { SeededRandom } from '../src/engine/random';
import { defaultSave, loadSave, saveData, SAVE_KEY, type StorageLike } from '../src/engine/save';
import type { HeroId } from '../src/data/heroes';

describe('combo and damage', () => {
  it('advances the five-hit combo and resets after its timing window', () => {
    const engine = new GameEngine({ seed: 2 });
    for (let hit = 0; hit < 5; hit += 1) {
      engine.tick({ attack: true });
      for (let frame = 0; frame < 17; frame += 1) engine.tick();
    }
    expect(engine.attackHistory).toEqual([0, 1, 2, 3, 4]);
    expect(engine.state.player.comboIndex).toBe(4);
    for (let frame = 0; frame < 30; frame += 1) engine.tick();
    expect(engine.state.player.comboWindow).toBe(0);
    expect(engine.state.player.comboIndex).toBe(0);
  });

  it('composes crit, blessing, and combo-rank damage multipliers', () => {
    const damage = composeDamage({
      base: 20,
      critical: true,
      criticalMultiplier: 2.2,
      blessingBonus: 0.12,
      comboRankBonus: 0.1,
    });
    expect(damage).toBeCloseTo(20 * 2.2 * 1.12 * 1.1);
  });

  it('guards frontal light hits and breaks guard with heavy attacks', () => {
    expect(resolveGuardedDamage(100, { shield: true, frontal: true, heavy: false }))
      .toEqual({ damage: 10, guarded: true, guardBroken: false });
    expect(resolveGuardedDamage(100, { shield: true, frontal: true, heavy: true }))
      .toEqual({ damage: 100, guarded: false, guardBroken: true });
  });
});

describe('blessings and save data', () => {
  it('offers distinct blessings, levels owned choices, caps at three, and excludes maxed choices', () => {
    const random = new SeededRandom(42);
    const offers = offerBlessings({}, random);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map(({ id }) => id)).size).toBe(3);
    const rerolled = offerBlessings({}, random, 3, offers.map(({ id }) => id));
    expect(rerolled.every(({ id }) => !offers.some((offer) => offer.id === id))).toBe(true);
    const owned = { [offers[0]!.id]: 1 };
    expect(addBlessing(owned, offers[0]!.id)).toBe(2);
    expect(addBlessing(owned, offers[0]!.id)).toBe(3);
    expect(addBlessing(owned, offers[0]!.id)).toBe(3);
    const maxedOffers = offerBlessings({ [offers[0]!.id]: 3 }, new SeededRandom(9), BLESSINGS.length);
    expect(maxedOffers.some(({ id }) => id === offers[0]!.id)).toBe(false);
  });

  it('round-trips talents and merit and falls back to defaults for corrupt JSON', () => {
    const values = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const data = defaultSave();
    data.merit = 82;
    data.talents.might = 3;
    data.stats.wins = 2;
    saveData(storage, data);
    expect(loadSave(storage)).toEqual(data);
    values.set(SAVE_KEY, '{broken');
    expect(loadSave(storage)).toEqual(defaultSave());
  });
});

describe('headless simulation', () => {
  it.each<HeroId>(['zhaoyun', 'guanyu', 'zhangfei'])('%s survives a deterministic stage simulation', (heroId) => {
    const engine = new GameEngine({ heroId, seed: 12 });
    expect(engine.state.waveCount).toBeGreaterThanOrEqual(2);
    for (let frame = 0; frame < 180 * 60 && !engine.state.gameOver; frame += 1) {
      const input = {
        moveX: 1,
        attack: true,
        heavy: engine.state.player.heavyCooldown <= 0,
        dodge: frame % 120 === 0,
        musou: engine.state.player.musou >= 100,
      };
      engine.tick(input);
      expect(Number.isFinite(engine.state.player.x)).toBe(true);
      expect(Number.isFinite(engine.state.player.y)).toBe(true);
    }
    expect(engine.state.kills).toBeGreaterThan(0);
  });

  it.each([
    { stageIndex: 4, boss: 'zhangjiao' },
    { stageIndex: 8, boss: 'lvbu' },
  ])('instantiates and damages boss $boss', ({ stageIndex }) => {
    const engine = new GameEngine({ heroId: 'guanyu', seed: 99, stageIndex });
    const boss = engine.state.enemies[0]!;
    expect(boss.boss).toBe(true);
    const initialHp = boss.hp;
    engine.state.player.x = boss.x - 40;
    engine.state.player.facing = 1;
    engine.tick({ heavy: true });
    expect(boss.hp).toBeLessThan(initialHp);
  });
});

describe('new combat systems', () => {
  it('damages the player with an arrow unless dodge i-frames catch it, triggering 刹那', () => {
    const makeArrow = (engine: GameEngine, id: number) => {
      const player = engine.state.player;
      engine.state.projectiles.push({
        id,
        owner: 'enemy',
        kind: 'arrow',
        x: player.x - 24,
        y: player.y,
        z: 0,
        vx: 1440,
        vy: 0,
        damage: 12,
        pierce: 0,
        lifetime: 1,
        depthTolerance: 40,
        radius: 8,
        hitIds: [],
        critical: false,
      });
    };
    const undodged = new GameEngine({ seed: 34 });
    undodged.state.enemies = [];
    undodged.state.player.x = 500;
    const hpBefore = undodged.state.player.hp;
    makeArrow(undodged, 91001);
    undodged.tick();
    expect(undodged.state.player.hp).toBeLessThan(hpBefore);

    const dodged = new GameEngine({ seed: 34 });
    dodged.state.enemies = [];
    dodged.state.player.x = dodged.state.arenaEndX;
    dodged.state.player.facing = 1;
    const dodgedHp = dodged.state.player.hp;
    makeArrow(dodged, 91002);
    dodged.tick({ dodge: true });
    expect(dodged.state.player.hp).toBe(dodgedHp);
    expect(dodged.state.events).toContain('刹那');
  });

  it('lets cavalry hit once and stuns it for 1.2 seconds after a timed dodge', () => {
    const prepareCharge = (engine: GameEngine) => {
      const horse = engine.state.enemies[0]!;
      const player = engine.state.player;
      horse.kind = 'cavalry';
      horse.action = 'charging';
      horse.facing = -1;
      horse.chargeDirection = -1;
      horse.chargeRemaining = 40;
      horse.chargeHitPlayer = false;
      horse.chargeDodged = false;
      horse.timer = 650;
      horse.telegraphKind = 'charge';
      horse.x = player.x + 30;
      horse.y = player.y;
      return horse;
    };
    const undodged = new GameEngine({ seed: 8 });
    const chargingHorse = prepareCharge(undodged);
    const hpBefore = undodged.state.player.hp;
    for (let frame = 0; frame < 8; frame += 1) undodged.tick();
    expect(chargingHorse.chargeHitPlayer).toBe(true);
    expect(undodged.state.player.hp).toBeCloseTo(hpBefore - chargingHorse.damage);

    const dodged = new GameEngine({ seed: 8 });
    const avoidedHorse = prepareCharge(dodged);
    avoidedHorse.x = dodged.state.player.x + 200;
    const dodgedHp = dodged.state.player.hp;
    dodged.tick({ dodge: true });
    for (let frame = 0; frame < 3; frame += 1) dodged.tick();
    expect(avoidedHorse.chargeHitPlayer).toBe(true);
    expect(avoidedHorse.action).toBe('stunned');
    expect(avoidedHorse.stun).toBeGreaterThanOrEqual(1.2);
    expect(dodged.state.player.hp).toBe(dodgedHp);
  });

  it('applies a normal-archetype elite affix and 铁甲 reduces damage by 40%', () => {
    const generated = new GameEngine({ seed: 1, stageIndex: 2 });
    const elite = generated.state.enemies.find((enemy) => enemy.elite);
    expect(elite).toBeDefined();
    expect(elite?.affix).toMatch(/狂暴|铁甲|嗜血/);
    expect(elite?.kind).not.toBe('elite');

    const strike = (affix: '铁甲' | undefined): number => {
      const engine = new GameEngine({ seed: 1, stageIndex: 2 });
      const target = engine.state.enemies.find((enemy) => enemy.elite)!;
      target.kind = 'saber';
      target.affix = affix ?? null;
      target.hp = 1000;
      target.maxHp = 1000;
      target.guard = false;
      target.action = 'stunned';
      target.stun = 5;
      target.x = engine.state.player.x + 80;
      target.y = engine.state.player.y;
      engine.state.player.facing = 1;
      engine.tick({ attack: true });
      return 1000 - target.hp;
    };
    expect(strike('铁甲')).toBeCloseTo(strike(undefined) * 0.6);
  });

  it('spawns each wave within its arena and ahead of the locked camera', () => {
    const engine = new GameEngine({ seed: 19 });
    expect(Math.min(...engine.state.enemies.map((enemy) => enemy.x))).toBeGreaterThan(engine.state.cameraX);
    engine.state.enemies = [];
    engine.state.waveComplete = true;
    engine.state.waveClearTimer = 0;
    engine.state.player.x = engine.state.nextWaveX;
    engine.tick();
    expect(engine.state.waveIndex).toBe(1);
    expect(Math.min(...engine.state.enemies.map((enemy) => enemy.x))).toBeGreaterThan(engine.state.cameraX);
  });

  it('runs Musou over multiple ticks and remains invulnerable for the whole sequence', () => {
    const engine = new GameEngine({ heroId: 'zhaoyun', seed: 63 });
    const player = engine.state.player;
    const target = engine.state.enemies[0]!;
    engine.state.enemies = [target];
    target.x = player.x + 150;
    target.y = player.y;
    target.z = 0;
    target.vz = 0;
    target.hp = 5000;
    target.maxHp = 5000;
    target.action = 'stunned';
    target.stun = 20;
    target.guard = false;
    player.musou = 100;
    const targetDamageFrames: number[] = [];
    let previousHp = target.hp;
    const playerHp = player.hp;

    for (let frame = 0; frame < 220; frame += 1) {
      engine.tick({ musou: frame === 0 });
      if (target.hp < previousHp) {
        targetDamageFrames.push(frame);
        previousHp = target.hp;
      }
      if (frame === 0) {
        engine.state.projectiles.push({
          id: 92001,
          owner: 'enemy',
          kind: 'arrow',
          x: player.x + 120,
          y: player.y,
          z: 0,
          vx: -900,
          vy: 0,
          damage: 20,
          pierce: 0,
          lifetime: 1,
          depthTolerance: 40,
          radius: 8,
          hitIds: [],
          critical: false,
        });
      }
      expect(Number.isFinite(player.hp)).toBe(true);
      expect(player.hp).toBe(playerHp);
      if (!engine.state.musouSequence && frame > 0) break;
    }
    expect(new Set(targetDamageFrames).size).toBeGreaterThan(1);
    expect(engine.state.musouSequence).toBeNull();
  });
});

describe('balance and full campaign', () => {
  const botTick = (engine: GameEngine, frame: number) => {
    const player = engine.state.player;
    const nearest = engine.state.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((left, right) => Math.hypot(left.x - player.x, (left.y - player.y) * 1.2)
        - Math.hypot(right.x - player.x, (right.y - player.y) * 1.2))[0];
    const dx = nearest ? nearest.x - player.x : Number.POSITIVE_INFINITY;
    const dy = nearest ? nearest.y - player.y : 0;
    engine.tick({
      moveX: nearest && Math.abs(dx) < 450 ? (Math.abs(dx) > 12 ? Math.sign(dx) : 0) : 1,
      moveY: nearest && Math.abs(dy) > 38 ? Math.sign(dy) : 0,
      attack: true,
      heavy: engine.state.player.heavyCooldown <= 0,
      dodge: frame % 120 === 0,
      musou: engine.state.player.musou >= 100,
    });
  };

  it.each<HeroId>(['zhaoyun', 'guanyu', 'zhangfei'])('%s averages above 30% HP after five stage-one seeds', (heroId) => {
    const seeds = [1, 2, 3, 4, 5];
    const results = seeds.map((seed) => {
      const engine = new GameEngine({ heroId, seed });
      for (let frame = 0; frame < 180 * 60 && !engine.state.gameOver && !engine.state.stageComplete; frame += 1) {
        botTick(engine, frame);
      }
      return {
        hpPercent: engine.state.player.hp / engine.state.player.maxHp * 100,
        cleared: engine.state.stageComplete,
      };
    });
    const averageHp = results.reduce((total, result) => total + result.hpPercent, 0) / results.length;
    console.info(`[balance] ${heroId}: ${results.map(({ hpPercent }) => hpPercent.toFixed(1)).join('/')}% HP; average ${averageHp.toFixed(1)}%; cleared ${results.filter(({ cleared }) => cleared).length}/5`);
    expect(averageHp).toBeGreaterThan(30);
    expect(results.every(({ cleared }) => cleared)).toBe(true);
  });

  it.each<HeroId>(['zhaoyun', 'guanyu', 'zhangfei'])('%s completes or dies during a finite 30-minute campaign simulation', (heroId) => {
    const engine = new GameEngine({ heroId, seed: 2025 });
    let frame = 0;
    for (; frame < 30 * 60 * 60 && !engine.state.gameOver; frame += 1) {
      if (engine.state.stageComplete) {
        if (engine.state.stageIndex === 8) {
          engine.advanceStage();
          break;
        }
        if (engine.state.stageIndex === 4) {
          const player = engine.state.player;
          player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.6);
        } else {
          engine.pickBlessing(BLESSINGS[0]!.id);
        }
        engine.advanceStage();
        continue;
      }
      botTick(engine, frame);
      if (frame % 60 === 0) {
        expect(Number.isFinite(engine.state.player.x)).toBe(true);
        expect(Number.isFinite(engine.state.player.y)).toBe(true);
        expect(Number.isFinite(engine.state.player.hp)).toBe(true);
      }
    }
    const cleared = engine.state.victory;
    const reachedStage = engine.state.stageIndex + 1;
    console.info(`[campaign] ${heroId}: ${cleared ? 'cleared 9/9' : `stage ${reachedStage}; ${engine.state.gameOver ? 'died' : '30-minute limit'}`} (${(frame / 3600).toFixed(1)} simulated minutes)`);
    expect(engine.state.gameOver || engine.state.victory).toBe(true);
    expect(frame).toBeLessThanOrEqual(30 * 60 * 60);
  });
});
