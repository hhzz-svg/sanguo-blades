export type BlessingRarity = '普通' | '稀有' | '传说';
export interface BlessingDefinition {
  id: string;
  name: string;
  icon: string;
  rarity: BlessingRarity;
  category: string;
  description: string;
  effect: 'damage' | 'combo' | 'crit' | 'lowHp' | 'burn' | 'lightning' | 'slow' | 'hp' | 'healKill' | 'dodge' | 'move' | 'musou' | 'musouDamage' | 'counter' | 'heavyCooldown';
  value: number;
}

export const BLESSINGS: BlessingDefinition[] = [
  { id: 'pojun', name: '破军', icon: '破', rarity: '普通', category: '攻', description: '造成伤害提高 12%。', effect: 'damage', value: 0.12 },
  { id: 'lianhuan', name: '连环', icon: '连', rarity: '稀有', category: '攻', description: '连段终结追加一道斩击。', effect: 'combo', value: 0.12 },
  { id: 'huixin', name: '会心', icon: '心', rarity: '稀有', category: '攻', description: '暴击率提高 8%。', effect: 'crit', value: 0.08 },
  { id: 'beishui', name: '背水', icon: '背', rarity: '稀有', category: '攻', description: '生命低于 40% 时伤害提高 30%。', effect: 'lowHp', value: 0.3 },
  { id: 'huoji', name: '火计', icon: '火', rarity: '普通', category: '火', description: '轻攻击使敌人燃烧。', effect: 'burn', value: 3 },
  { id: 'tianlei', name: '天雷', icon: '雷', rarity: '稀有', category: '雷', description: '破阵命中召来天雷。', effect: 'lightning', value: 0.18 },
  { id: 'hanbing', name: '寒冰', icon: '寒', rarity: '普通', category: '冰', description: '攻击使敌人减速。', effect: 'slow', value: 0.3 },
  { id: 'tiewi', name: '铁壁', icon: '壁', rarity: '普通', category: '守', description: '气血上限提高 15 并回复。', effect: 'hp', value: 15 },
  { id: 'huichun', name: '回春', icon: '春', rarity: '普通', category: '守', description: '击败敌人回复少量气血。', effect: 'healKill', value: 0.02 },
  { id: 'jinjia', name: '金甲', icon: '甲', rarity: '传说', category: '守', description: '每 10 秒抵消一次伤害。', effect: 'hp', value: 1 },
  { id: 'jifeng', name: '疾风', icon: '风', rarity: '普通', category: '速', description: '移速提高 10%，攻速提高 8%。', effect: 'move', value: 0.1 },
  { id: 'canying', name: '残影', icon: '影', rarity: '稀有', category: '速', description: '额外获得一次闪避充能。', effect: 'dodge', value: 1 },
  { id: 'xushi', name: '蓄势', icon: '蓄', rarity: '普通', category: '无双', description: '无双积攒速度提高 25%。', effect: 'musou', value: 0.25 },
  { id: 'wushuang', name: '无双延长', icon: '双', rarity: '稀有', category: '无双', description: '无双伤害提高 30%。', effect: 'musouDamage', value: 0.3 },
  { id: 'fanjia', name: '锦囊·反击', icon: '反', rarity: '传说', category: '特殊', description: '闪避后下一击伤害翻倍。', effect: 'counter', value: 1 },
  { id: 'qinggang', name: '青釭', icon: '钢', rarity: '稀有', category: '特殊', description: '破阵冷却缩短 15%。', effect: 'heavyCooldown', value: 0.15 },
  { id: 'liehuo', name: '烈火', icon: '烈', rarity: '传说', category: '火', description: '燃烧伤害与扩散效果增强。', effect: 'burn', value: 4 },
  { id: 'tianming', name: '天命', icon: '命', rarity: '传说', category: '攻', description: '所有伤害提高 8%。', effect: 'damage', value: 0.08 },
];
