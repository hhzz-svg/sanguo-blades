import { BLESSINGS, type BlessingDefinition } from '../data/blessings';
import { SeededRandom } from './random';

export type OwnedBlessings = Record<string, number>;

export function offerBlessings(
  owned: OwnedBlessings,
  random: SeededRandom,
  count = 3,
  excluded: string[] = [],
): BlessingDefinition[] {
  const unavailable = new Set(excluded);
  const available = BLESSINGS.filter((blessing) => (owned[blessing.id] ?? 0) < 3 && !unavailable.has(blessing.id));
  const rarityWeight = { 普通: 0.6, 稀有: 0.3, 传说: 0.1 };
  const weighted = available
    .map((blessing) => ({
      blessing,
      score: Math.pow(Math.max(random.next(), Number.EPSILON), 1 / rarityWeight[blessing.rarity]),
    }))
    .sort((a, b) => b.score - a.score);
  return weighted.slice(0, Math.min(count, weighted.length)).map(({ blessing }) => blessing);
}

export function addBlessing(owned: OwnedBlessings, id: string): number {
  const level = Math.min(3, (owned[id] ?? 0) + 1);
  owned[id] = level;
  return level;
}
