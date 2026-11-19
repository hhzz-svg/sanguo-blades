export interface TalentDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
}

export const TALENTS: TalentDefinition[] = [
  { id: 'vitality', name: '气血', description: '气血上限 +6%', maxLevel: 5 },
  { id: 'might', name: '武力', description: '伤害 +5%', maxLevel: 5 },
  { id: 'resolve', name: '战意', description: '无双获取 +8%', maxLevel: 5 },
  { id: 'adapt', name: '机变', description: '每两级获得一次锦囊重选', maxLevel: 5 },
  { id: 'pay', name: '军饷', description: '功勋收益 +10%', maxLevel: 5 },
  { id: 'guard', name: '护体', description: '每关开始获得额外护盾', maxLevel: 5 },
];
