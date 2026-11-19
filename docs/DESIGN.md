# 《三国·破阵》Sanguo Blades — Design Spec (v1)

2.5D side-scrolling musou action roguelike in the browser. Original work, Three Kingdoms theme. UI text in Simplified Chinese.

## Tech
- Vite + TypeScript (strict), no UI framework. Canvas 2D for battle, DOM overlays for screens/HUD/modals.
- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`). Scripts: `dev`, `build`, `preview`, `test` (vitest), `typecheck`.
- Layout: `src/data/` (heroes, enemies, bosses, blessings, stages, talents), `src/engine/` (pure logic, no DOM), `src/render/` (canvas renderer, vfx, audio), `src/ui/` (screens, hud, modals, touch), `src/main.ts`.
- Engine must be DOM-free and deterministic given a seeded RNG + input stream, so it can run headless in vitest.
- Expose `window.__SANGUO__ = { getState(), engine }` for automated testing.

## World & camera
- Logical resolution 1280x720, scaled to fit window (letterbox), DPR capped at 2.
- Entities: `x` (horizontal), `y` (depth, walkable band y ∈ [430, 650]), `z` (height, ≥0). Draw order by `y`. Shadow ellipse at ground.
- Attack hit test: horizontal range in facing direction + `|dy| <= depthTolerance` (default 45) + `z` check for airborne.
- Stage is wider than screen (e.g. 3200px). Camera follows player; during a wave the camera is locked to an arena segment (invisible walls). After all waves: "前进 ➔" indicator, walking to the right end finishes the stage.

## Controls
- Keyboard: WASD/arrows move (A/D horizontal, W/S depth), J = attack, K = heavy, L or Shift = dodge, Space = jump, Q or U = musou, Esc = pause. Mouse left = attack, right = heavy.
- Touch (auto-detected / coarse pointer): virtual joystick bottom-left, 5 buttons bottom-right (斩/破/闪/跃/无双).
- Holding J continues the combo.

## Combat feel (must have)
- 5-hit light combo with per-hit timing window (~0.45s to chain); hit 4 launches (z velocity), hit 5 is a big knockback finisher.
- Air attack: J in air = air slash; K in air = plunge slam (AOE on landing).
- Hitstop (40–90ms by hit weight), screen shake, white flash on hit enemies, damage numbers (crit bigger/gold), knockback, stagger, launch + fall bounce.
- Dodge: short invincible dash with afterimages; dodging within 0.15s before an enemy hit lands triggers "刹那" slow-mo (0.3x for 0.6s) + bonus musou.
- Combo counter (resets after 2.5s without hits); ranks at 10/30/60/100 (勇/猛/烈/神) giving +5/10/15/25% damage.
- Musou gauge 0–100%: gained on dealing/taking damage; Q when full = hero ultimate, invincible during it.
- Enemy telegraphs: red flash / ground warning before strong attacks.

## Heroes (3)
| id | 名 | 称号 | 兵器 | HP | ATK | Speed | Dodges |
|---|---|---|---|---|---|---|---|
| zhaoyun | 赵云 | 常山龙胆 | 龙胆亮银枪 | 120 | 20 | 320 | 2 |
| guanyu | 关羽 | 武圣 | 青龙偃月刀 | 150 | 26 | 270 | 1 |
| zhangfei | 张飞 | 燕人猛将 | 丈八蛇矛 | 180 | 24 | 260 | 1 |

- 赵云: passive 七进七出 — a successful dodge resets heavy cooldown and grants +20% damage for 2s. Heavy 百鸟朝凤 (CD 4s): dash-thrust 260px, pierces, 220% dmg. Musou 龙胆冲阵: 6 rapid dashes back and forth across the screen, 6×180%.
- 关羽: passive 武圣 — 15% crit, crit dmg ×2.2. Light combo has wide arcs (range 150). Heavy 青龙斩 (CD 5s): forward crescent wave projectile, 300% dmg, travels 600px. Musou 刀劈千军: 3 huge crescent waves in sequence, 3×350% screen-wide.
- 张飞: passive 万人敌 — 20% damage reduction; heavy hits stun 1s. Heavy 当阳怒吼 (CD 6s): roar AOE radius 220, 150% dmg, stun 1.5s, knockback. Musou 长坂断桥: 3 ground slams each creating expanding shockwave, 3×300%.

## Enemies
Act 1 faction 黄巾军 (yellow), Act 2 faction 西凉/董卓军 (dark red/black). Same AI archetypes, reskinned via tint + data.
| id | 名 | archetype | HP | DMG | notes |
|---|---|---|---|---|---|
| saber | 刀兵 | melee grunt | 40 | 8 | approach, windup 0.5s, slash |
| archer | 弓手 | ranged | 30 | 7 | keeps 350–500px distance, shoots arrows (projectile, dodgeable) |
| shield | 盾兵 | blocker | 80 | 10 | blocks frontal light attacks (90% reduction, "格挡" text); heavy/musou/back hits break guard (stagger 1.2s) |
| cavalry | 骑兵 | charger | 70 | 14 | telegraph 0.8s then charges across lane at high speed; stunned briefly if dodged |
| elite | 精锐 (随机词缀) | any archetype ×2.5 HP | — | affixes: 狂暴 (fast), 铁甲 (armor), 嗜血 (lifesteal); glowing outline |

Bosses (with HP bar at top, 2 phases, phase 2 at 50% HP = enrage + faster):
- zhangjiao 张角 「天公将军」 (Act 1): teleports, calls lightning circles (telegraphed AOE), summons 3 saber grunts, slow orb projectiles. HP 900.
- lvbu 吕布 「飞将」 (Act 2): wide halberd sweeps (telegraphed), long horse charge across stage, jump slam with shockwave; phase 2 combos 2 sweeps + charge. HP 1400.

Difficulty scaling per stage index: enemy HP ×(1 + 0.12·i), dmg ×(1 + 0.08·i).

## Campaign
- Act 1 「黄巾之乱」: 4 stages (颍川荒野, 巨鹿村落, 广宗城外, 黄巾大营) + boss 张角 (黄天祭坛).
- Act 2 「虎牢关」: 3 stages (汜水关道, 虎牢关前, 关城烽火) + boss 吕布.
- Each normal stage: 2–3 waves of 6–14 enemies, mixed archetypes, elites appear from stage 3 on.
- Act intro card (title + 2-line poem) before each act. Act backgrounds: act1_bg.jpg (both normal and boss of act 1), act2_bg.jpg.
- After every non-final stage: blessing pick modal (3 choices). After act 1 boss: 军营 camp modal = choose one: 疗伤 (heal 60%), 锻兵 (+15% ATK), 擂鼓 (+1 blessing pick).
- Silver (纹银) drops from enemies; spent at camp? v1: no shop; silver just converts to 功勋 at run end.
- Run end (victory or death): result screen with kills, max combo, time, 功勋 earned = kills·1 + stagesCleared·20 + victory 200.

## Blessings (锦囊) — roguelike 3-pick
Pool of ~18, each stackable to level 3 (picking again levels up), rarity 普通/稀有/传说 weighting 60/30/10.
Categories & examples:
- 攻: 破军 (+12% dmg/level), 连环 (+1 extra hit sub-slash on combo hit 5), 会心 (+8% crit), 背水 (+30% dmg when HP<40%).
- 火计 (火): light hits apply burn (DoT 3s), burn spreads on kill (level 3).
- 雷 (天雷): heavy hits call a lightning strike on target, chains to 2 more at lv3.
- 冰/寒: hits slow enemies 30%.
- 守: 铁壁 (+15 max HP & heal), 回春 (heal 2% per kill), 金甲 (shield absorbs one hit every 10s).
- 速: 疾风 (+10% move, attack speed +8%), 残影 (+1 dodge charge).
- 无双: 蓄势 (+25% musou gain), 无双延长 (musou dmg +30%).
- 特殊: 锦囊·反击 (after dodge, next attack ×2), 青釭 (heavy CD −15%).
Show icon glyph (single Chinese char in a seal), name, rarity color, description, current level.

## Meta progression — 演武场 (localStorage)
Currency 功勋. 6 talents, 5 levels each, cost 30·(level+1):
气血 (+6% max HP), 武力 (+5% dmg), 战意 (+8% musou gain), 机变 (+1 blessing reroll per run per 2 levels), 军饷 (+10% 功勋), 护体 (start each stage with 10% shield per level).
Save: talents, 功勋, stats (runs, wins, best combo, total kills). Versioned key `sanguo-blades.save.v1`.

## Screens
Title (bg title_bg.jpg, ember particles, buttons 开始征战 / 演武场 / 兵书(操作指南)), Hero select (3 cards with portrait {id}_card.jpg, stats bars, skills text, 出征 button; keys 1–3/←→/Enter), Talents, Guide, Act intro, HUD (portrait, HP bar, musou bar, dodge charges, heavy CD, combo counter, stage name, wave info, boss HP bar, pause button), Blessing modal, Camp modal, Pause (current blessings list, resume/quit), Result.
Visual style: dark ink-wash + red/gold Chinese style (black #0b0a0c, crimson #b3201b, gold #e0b45a), serif CJK font stack ("Noto Serif SC","Songti SC",serif).

## Assets (public/assets/…), all optional at runtime — renderer must draw a fallback silhouette if an image is missing
- scenes/title_bg.jpg, scenes/act1_bg.jpg, scenes/act2_bg.jpg (wide 1536x1024 painted backgrounds; horizontal parallax: repeat/mirror tile to cover stage width)
- heroes/{id}_card.jpg (portrait card), heroes/{id}_idle.png, heroes/{id}_attack.png, heroes/{id}_skill.png (transparent PNG, character facing RIGHT, feet at bottom center)
- enemies/{saber|archer|shield|cavalry}_{idle|attack}.png (facing RIGHT; act 2 reskin via canvas tint/hue filter)
- bosses/{zhangjiao|lvbu}_{idle|attack}.png
Sprites are static poses; animation = procedural transforms (bob, squash/stretch, lean, rotation, lunge offset) + swapping pose image per state + procedural weapon-trail arcs/VFX.

## Audio
WebAudio synthesized only (no files): slash whoosh, hit thud, heavy boom, crit ring, dodge swish, musou drum+gong, war-drum BGM loop on battle, toggle on/off persisted.
