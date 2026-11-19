export type HeroId = 'zhaoyun' | 'guanyu' | 'zhangfei';

export interface HeroDefinition {
  id: HeroId;
  name: string;
  title: string;
  weapon: string;
  hp: number;
  attack: number;
  speed: number;
  dodges: number;
  color: string;
  passive: string;
  heavy: string;
  ultimate: string;
  heavyCooldown: number;
  range: number;
}

export const HEROES: HeroDefinition[] = [
  {
    id: 'zhaoyun',
    name: '赵云',
    title: '常山龙胆',
    weapon: '龙胆亮银枪',
    hp: 120,
    attack: 20,
    speed: 320,
    dodges: 2,
    color: '#d5dce7',
    passive: '七进七出：闪避成功后重置破阵冷却，获得短暂增伤。',
    heavy: '百鸟朝凤',
    ultimate: '龙胆冲阵',
    heavyCooldown: 4,
    range: 132,
  },
  {
    id: 'guanyu',
    name: '关羽',
    title: '武圣',
    weapon: '青龙偃月刀',
    hp: 150,
    attack: 26,
    speed: 270,
    dodges: 1,
    color: '#329b63',
    passive: '武圣：暴击率提高，暴击伤害大幅提升。',
    heavy: '青龙斩',
    ultimate: '刀劈千军',
    heavyCooldown: 5,
    range: 150,
  },
  {
    id: 'zhangfei',
    name: '张飞',
    title: '燕人猛将',
    weapon: '丈八蛇矛',
    hp: 180,
    attack: 24,
    speed: 260,
    dodges: 1,
    color: '#b54b3e',
    passive: '万人敌：受到伤害降低，破阵命中可震慑敌人。',
    heavy: '当阳怒吼',
    ultimate: '长坂断桥',
    heavyCooldown: 6,
    range: 136,
  },
];

export function getHero(id: HeroId): HeroDefinition {
  return HEROES.find((hero) => hero.id === id) ?? HEROES[0]!;
}
