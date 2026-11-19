export interface StageDefinition {
  name: string;
  act: 1 | 2;
  boss?: 'zhangjiao' | 'lvbu';
}

export const STAGES: StageDefinition[] = [
  { name: '颍川荒野', act: 1 },
  { name: '巨鹿村落', act: 1 },
  { name: '广宗城外', act: 1 },
  { name: '黄巾大营', act: 1 },
  { name: '黄天祭坛', act: 1, boss: 'zhangjiao' },
  { name: '汜水关道', act: 2 },
  { name: '虎牢关前', act: 2 },
  { name: '关城烽火', act: 2 },
  { name: '虎牢关', act: 2, boss: 'lvbu' },
];

export const ACT_INTROS = {
  1: { title: '黄巾之乱', lines: ['苍天已死，黄天当立。', '乱世烽烟起，且看银枪破阵来。'] },
  2: { title: '虎牢关', lines: ['雄关万仞，飞将当道。', '诸侯联军至，今朝一战定乾坤。'] },
} as const;
