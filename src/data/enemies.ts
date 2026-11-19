export type EnemyKind = 'saber' | 'archer' | 'shield' | 'cavalry' | 'elite' | 'zhangjiao' | 'lvbu';

export interface EnemyDefinition {
  id: EnemyKind;
  name: string;
  hp: number;
  damage: number;
  speed: number;
  range: number;
  color: string;
  boss?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDefinition> = {
  saber: { id: 'saber', name: '刀兵', hp: 40, damage: 8, speed: 105, range: 72, color: '#d4a32e' },
  archer: { id: 'archer', name: '弓手', hp: 30, damage: 7, speed: 92, range: 410, color: '#d4a32e' },
  shield: { id: 'shield', name: '盾兵', hp: 80, damage: 10, speed: 72, range: 76, color: '#bd8b25' },
  cavalry: { id: 'cavalry', name: '骑兵', hp: 70, damage: 14, speed: 190, range: 100, color: '#d4a32e' },
  elite: { id: 'elite', name: '精锐', hp: 100, damage: 14, speed: 112, range: 82, color: '#d4a32e' },
  zhangjiao: { id: 'zhangjiao', name: '张角', hp: 900, damage: 18, speed: 85, range: 250, color: '#e2c16b', boss: true },
  lvbu: { id: 'lvbu', name: '吕布', hp: 1400, damage: 26, speed: 138, range: 150, color: '#a12d25', boss: true },
};

export const WAVE_COMPOSITIONS: EnemyKind[][][] = [
  [
    ['saber', 'saber', 'shield', 'saber', 'archer', 'saber'],
    ['saber', 'cavalry', 'saber', 'archer', 'shield', 'saber'],
  ],
  [
    ['saber', 'archer', 'shield', 'saber', 'cavalry', 'saber', 'saber'],
    ['elite', 'saber', 'archer', 'shield', 'cavalry', 'saber', 'saber'],
  ],
];
