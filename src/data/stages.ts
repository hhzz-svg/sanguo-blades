import type { EnemyKind } from './enemies';

export interface StageDefinition {
  name: string;
  act: 1 | 2;
  waves?: EnemyKind[][];
  boss?: 'zhangjiao' | 'lvbu';
}

export const STAGES: StageDefinition[] = [
  {
    name: '颍川荒野', act: 1, waves: [
      ['saber', 'saber', 'shield', 'saber', 'archer', 'saber'],
      ['saber', 'cavalry', 'saber', 'archer', 'shield', 'saber'],
    ],
  },
  {
    name: '巨鹿村落', act: 1, waves: [
      ['saber', 'saber', 'shield', 'archer', 'saber', 'saber', 'cavalry'],
      ['saber', 'saber', 'archer', 'shield', 'saber', 'cavalry', 'saber'],
    ],
  },
  {
    name: '广宗城外', act: 1, waves: [
      ['saber', 'saber', 'shield', 'archer', 'saber', 'cavalry', 'saber', 'saber'],
      ['saber', 'archer', 'shield', 'saber', 'cavalry', 'saber', 'saber', 'archer'],
      ['saber', 'shield', 'saber', 'archer', 'saber', 'cavalry', 'saber', 'saber'],
    ],
  },
  {
    name: '黄巾大营', act: 1, waves: [
      ['saber', 'saber', 'shield', 'archer', 'saber', 'cavalry', 'saber', 'saber', 'archer', 'saber'],
      ['saber', 'archer', 'shield', 'saber', 'cavalry', 'saber', 'saber', 'archer', 'saber', 'shield'],
      ['saber', 'saber', 'archer', 'shield', 'saber', 'cavalry', 'saber', 'saber', 'archer', 'saber'],
    ],
  },
  { name: '黄天祭坛', act: 1, boss: 'zhangjiao' },
  {
    name: '汜水关道', act: 2, waves: [
      ['saber', 'cavalry', 'archer', 'saber', 'shield', 'cavalry', 'archer', 'saber'],
      ['cavalry', 'saber', 'archer', 'shield', 'saber', 'cavalry', 'archer', 'saber'],
    ],
  },
  {
    name: '虎牢关前', act: 2, waves: [
      ['saber', 'cavalry', 'archer', 'saber', 'shield', 'cavalry', 'archer', 'saber', 'cavalry'],
      ['cavalry', 'saber', 'archer', 'shield', 'cavalry', 'saber', 'archer', 'saber', 'cavalry'],
      ['saber', 'cavalry', 'archer', 'shield', 'saber', 'cavalry', 'archer', 'saber', 'cavalry'],
    ],
  },
  {
    name: '关城烽火', act: 2, waves: [
      ['cavalry', 'saber', 'archer', 'shield', 'cavalry', 'archer', 'saber', 'cavalry', 'archer', 'saber'],
      ['saber', 'cavalry', 'archer', 'shield', 'saber', 'cavalry', 'archer', 'saber', 'cavalry', 'archer'],
      ['cavalry', 'saber', 'archer', 'shield', 'cavalry', 'saber', 'archer', 'cavalry', 'saber', 'archer'],
    ],
  },
  { name: '虎牢关', act: 2, boss: 'lvbu' },
];

export const ACT_INTROS = {
  1: { title: '黄巾之乱', lines: ['苍天已死，黄天当立。', '乱世烽烟起，且看银枪破阵来。'] },
  2: { title: '虎牢关', lines: ['雄关万仞，飞将当道。', '诸侯联军至，今朝一战定乾坤。'] },
} as const;
