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
