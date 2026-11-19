import { TALENTS } from '../data/talents';

export const SAVE_KEY = 'sanguo-blades.save.v1';

export interface SaveData {
  version: 1;
  merit: number;
  talents: Record<string, number>;
  stats: {
    runs: number;
    wins: number;
    bestCombo: number;
    totalKills: number;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    merit: 0,
    talents: Object.fromEntries(TALENTS.map(({ id }) => [id, 0])),
    stats: { runs: 0, wins: 0, bestCombo: 0, totalKills: 0 },
  };
}

export function loadSave(storage: StorageLike): SaveData {
  const defaults = defaultSave();
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const candidate = parsed as Partial<SaveData>;
    if (candidate.version !== 1 || typeof candidate.merit !== 'number'
      || !candidate.talents || typeof candidate.talents !== 'object'
      || !candidate.stats || typeof candidate.stats !== 'object') return defaults;

    const talents = { ...defaults.talents };
    for (const { id, maxLevel } of TALENTS) {
      const value = candidate.talents[id];
      if (typeof value === 'number' && Number.isFinite(value)) {
        talents[id] = Math.max(0, Math.min(maxLevel, Math.floor(value)));
      }
    }
    return {
      version: 1,
      merit: Math.max(0, Math.floor(candidate.merit)),
      talents,
      stats: {
        runs: finiteNonnegative(candidate.stats.runs),
        wins: finiteNonnegative(candidate.stats.wins),
        bestCombo: finiteNonnegative(candidate.stats.bestCombo),
        totalKills: finiteNonnegative(candidate.stats.totalKills),
      },
    };
  } catch {
    return defaults;
  }
}

export function saveData(storage: StorageLike, data: SaveData): void {
  storage.setItem(SAVE_KEY, JSON.stringify(data));
}

function finiteNonnegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
