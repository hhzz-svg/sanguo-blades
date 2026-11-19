import { HEROES, type HeroId } from '../data/heroes';
import { TALENTS } from '../data/talents';
import { ACT_INTROS } from '../data/stages';
import { BLESSINGS, type BlessingDefinition } from '../data/blessings';
import { defaultSave, type SaveData } from '../engine/save';
import type { GameState } from '../engine/types';
import type { OwnedBlessings } from '../engine/blessings';
import type { AudioSynth } from '../render/audio';

const BASE = import.meta.env.BASE_URL;
const assetUrl = (path: string): string => new URL(`${BASE}assets/${path}`, document.baseURI).href;

export type UiAction =
  | 'start'
  | 'title'
  | 'talents'
  | 'guide'
  | 'hero-confirm'
  | 'intro-start'
  | 'pause'
  | 'resume'
  | 'quit'
  | 'advance'
  | 'audio';

export class GameUI {
  readonly root: HTMLElement;
  selectedHero: HeroId = 'zhaoyun';

  constructor(root: HTMLElement, private readonly onAction: (action: UiAction) => void, private readonly audio: AudioSynth) {
    this.root = root;
  }

  showTitle(save: SaveData = defaultSave()): void {
    this.root.innerHTML = `
      <main class="title-screen screen" style="--scene:url('${assetUrl('scenes/title_bg.jpg')}')">
        <div class="title-grain"></div>
        <div class="title-copy">
          <div class="eyebrow"><span></span> 建安纪年 · 群雄逐鹿</div>
          <div class="seal">破</div>
          <h1>三国<span>·</span>破阵</h1>
          <p class="title-subtitle">长枪所向，千军辟易</p>
          <div class="title-rule"><i></i><b>✦</b><i></i></div>
          <div class="title-actions">
            <button class="button primary" data-action="start">开始征战 <span>➜</span></button>
            <button class="button ghost" data-action="talents">演武场</button>
            <button class="button ghost" data-action="guide">兵书 · 操作指南</button>
          </div>
          <div class="title-meta">已立功勋 <strong>${save.merit}</strong><span>纹银铸就不灭英名</span></div>
        </div>
        <div class="title-footer"><span>《三国·破阵》</span><span>一骑当千 · 乱世征途</span><button data-action="audio" class="audio-toggle">♫ 音效 ${this.audioLabel()}</button></div>
      </main>`;
    this.bindActions();
  }

  showHeroSelect(): void {
    const cards = HEROES.map((hero, index) => `
      <button class="hero-card ${hero.id === this.selectedHero ? 'selected' : ''}" data-hero="${hero.id}">
        <div class="hero-portrait" style="--portrait:url('${assetUrl(`heroes/${hero.id}_card.jpg`)}')">
          <div class="portrait-index">0${index + 1}</div>
          <div class="portrait-caption"><small>${hero.title}</small><strong>${hero.name}</strong></div>
        </div>
        <div class="hero-card-info">
          <div class="weapon">${hero.weapon}</div>
          <div class="stat-row"><span>气血</span><i><b style="width:${hero.hp / 1.8}%"></b></i><strong>${hero.hp}</strong></div>
          <div class="stat-row"><span>武力</span><i><b style="width:${hero.attack * 3.1}%"></b></i><strong>${hero.attack}</strong></div>
          <div class="stat-row"><span>身法</span><i><b style="width:${hero.speed / 4}%"></b></i><strong>${hero.speed}</strong></div>
          <p>${hero.passive}</p>
        </div>
      </button>`).join('');
    this.root.innerHTML = `
      <main class="screen parchment-screen">
        <header class="screen-heading"><button class="back-button" data-action="title">← 返回</button><div class="eyebrow">择良将 · 赴沙场</div><h2>选择你的武将</h2><p>各怀绝技，皆可破阵</p></header>
        <section class="hero-select-grid">${cards}</section>
        <div class="hero-actions"><span>← → 选择武将　　按 Enter 出征</span><button class="button primary" data-action="hero-confirm">披甲出征 <span>➜</span></button></div>
      </main>`;
    this.bindActions();
    this.root.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.hero as HeroId | undefined;
        if (id) {
          this.selectedHero = id;
          this.showHeroSelect();
        }
      });
    });
  }

  showActIntro(act: 1 | 2): void {
    const intro = ACT_INTROS[act];
    this.root.innerHTML = `
      <main class="screen act-intro" style="--scene:url('${assetUrl(`scenes/act${act}_bg.jpg`)}')">
        <div class="intro-mist"></div><div class="intro-mark">第 ${act} 幕</div>
        <div class="intro-content"><div class="eyebrow">风云再起 · 乱世征途</div><h2>${intro.title}</h2><div class="title-rule"><i></i><b>✦</b><i></i></div>
          <p>${intro.lines[0]}</p><p>${intro.lines[1]}</p><button class="button primary" data-action="intro-start">踏入战场 <span>➜</span></button>
        </div>
      </main>`;
    this.bindActions();
  }

  showBattle(): HTMLCanvasElement {
    this.root.innerHTML = `
      <main class="battle-screen">
        <canvas id="battle-canvas" aria-label="战场"></canvas>
        <div class="battle-vignette"></div>
        <section class="hud-top">
          <div class="hero-hud"><div class="hud-portrait" id="hud-portrait"></div><div class="hud-bars"><strong id="hud-hero-name">赵云</strong><div class="hp-track"><i id="hud-hp"></i></div><div class="hud-numbers" id="hud-hp-number"></div><div class="musou-track"><i id="hud-musou"></i></div><small>无双</small></div></div>
          <div class="stage-hud"><div class="stage-act">讨伐 · <span id="hud-act">黄巾之乱</span></div><strong id="hud-stage">颍川荒野</strong><small id="hud-wave">第 1 / 2 波</small></div>
          <button class="hud-pause" data-action="pause">Ⅱ</button>
        </section>
        <section class="hud-boss hidden" id="boss-hud"><div class="boss-name" id="boss-name"></div><div class="boss-track"><i id="boss-hp"></i></div></section>
        <section class="hud-bottom">
          <div class="combo-hud" id="combo-hud"><strong id="combo-count">0</strong><span>连击</span><b id="combo-rank"></b></div>
          <div class="combat-hints"><span>J 斩击</span><span>K 破阵</span><span>Q 无双</span><span>L 闪避</span></div>
          <div class="charge-hud"><span>闪避 <b id="hud-dodge">0 / 2</b></span><span>破阵 <b id="hud-heavy">就绪</b></span><div class="charge-track"><i id="hud-charge"></i></div></div>
          <button class="advance-button hidden" id="advance-button" data-action="advance">前进 <b>➜</b></button>
        </section>
        <div class="touch-controls hidden" id="touch-controls">
          <div class="virtual-stick" id="virtual-stick"><i></i></div>
          <div class="touch-buttons"><button data-control="attack">斩</button><button data-control="heavy">破</button><button data-control="dodge">闪</button><button data-control="jump">跃</button><button data-control="musou">无双</button></div>
        </div>
        <div id="battle-modal"></div>
      </main>`;
    this.bindActions();
    return this.root.querySelector<HTMLCanvasElement>('#battle-canvas')!;
  }

  updateBattle(state: GameState): void {
    const hero = HEROES.find((entry) => entry.id === state.heroId)!;
    this.setText('#hud-hero-name', hero.name);
    this.setText('#hud-act', state.act === 1 ? '黄巾之乱' : '虎牢关');
    this.setText('#hud-stage', state.stageName);
    this.setText('#hud-wave', state.waveComplete ? '敌阵已破 · 前进' : `第 ${state.waveIndex + 1} / ${state.waveCount} 波　敌军 ${state.enemies.length} 人`);
    const hp = this.root.querySelector<HTMLElement>('#hud-hp');
    if (hp) hp.style.width = `${Math.max(0, state.player.hp / state.player.maxHp * 100)}%`;
    const musou = this.root.querySelector<HTMLElement>('#hud-musou');
    if (musou) musou.style.width = `${state.player.musou}%`;
    this.setText('#hud-hp-number', `${Math.ceil(state.player.hp)} / ${Math.ceil(state.player.maxHp)}`);
    this.setText('#hud-dodge', `${state.player.dodgeCharges} / ${state.player.maxDodgeCharges}`);
    this.setText('#hud-heavy', state.player.heavyCooldown > 0 ? `${state.player.heavyCooldown.toFixed(1)}s` : '就绪');
    const charge = this.root.querySelector<HTMLElement>('#hud-charge');
    if (charge) charge.style.width = `${Math.max(0, (1 - state.player.heavyCooldown / hero.heavyCooldown) * 100)}%`;
    const combo = this.root.querySelector<HTMLElement>('#combo-hud');
    combo?.classList.toggle('visible', state.player.comboDisplayTimer > 0);
    this.setText('#combo-count', String(state.player.comboHits));
    const rank = state.player.comboHits >= 100 ? '神' : state.player.comboHits >= 60 ? '烈' : state.player.comboHits >= 30 ? '猛' : state.player.comboHits >= 10 ? '勇' : '';
    this.setText('#combo-rank', rank);
    const boss = state.enemies.find((enemy) => enemy.boss);
    this.root.querySelector('#boss-hud')?.classList.toggle('hidden', !boss);
    if (boss) {
      this.setText('#boss-name', `「${boss.kind === 'zhangjiao' ? '天公将军' : '飞将'}」${boss.kind === 'zhangjiao' ? '张角' : '吕布'}${boss.phase === 2 ? ' · 狂怒' : ''}`);
      const bossHp = this.root.querySelector<HTMLElement>('#boss-hp');
      if (bossHp) bossHp.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
    }
    this.root.querySelector('#advance-button')?.classList.toggle('hidden', !state.waveComplete || state.stageComplete);
    const portrait = this.root.querySelector<HTMLElement>('#hud-portrait');
    if (portrait) portrait.style.backgroundImage = `url('${assetUrl(`heroes/${hero.id}_card.jpg`)}')`;
  }

  showBlessings(
    options: BlessingDefinition[],
    owned: OwnedBlessings,
    onPick: (id: string) => void,
    onReroll?: () => void,
    rerolls = 0,
  ): void {
    const cards = options.map((blessing, index) => `
      <button class="blessing-card ${blessing.rarity.toLowerCase()}" data-pick="${blessing.id}">
        <span class="blessing-rarity">${blessing.rarity} · ${blessing.category}</span>
        <span class="blessing-seal">${blessing.icon}</span><strong>${blessing.name}</strong>
        <p>${blessing.description}</p><span class="blessing-level">当前 Lv.${owned[blessing.id] ?? 0}</span>
        <span class="choose-label">纳入锦囊 <b>0${index + 1}</b></span>
      </button>`).join('');
    const modal = this.root.querySelector<HTMLElement>('#battle-modal');
    if (!modal) return;
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal-panel blessing-modal"><div class="eyebrow">破阵得锦囊 · 策马再征途</div><h2>择一锦囊</h2><p class="modal-subtitle">天命所归，善用其势</p><div class="blessing-grid">${cards}</div>${rerolls > 0 ? `<button class="reroll-button" data-reroll>重选锦囊 · 剩余 ${rerolls} 次</button>` : ''}</section></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.pick;
        if (id) onPick(id);
      });
    });
    modal.querySelector('[data-reroll]')?.addEventListener('click', () => onReroll?.());
  }

  showCamp(onChoose: (choice: 'heal' | 'attack' | 'blessing') => void): void {
    const choices = [
      ['heal', '疗伤', '回复 60% 气血', '✚'],
      ['attack', '锻兵', '永久提高 15% 武力', '⚒'],
      ['blessing', '擂鼓', '再获一次锦囊', '鼓'],
    ] as const;
    const modal = this.root.querySelector<HTMLElement>('#battle-modal');
    if (!modal) return;
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal-panel camp-modal"><div class="eyebrow">黄巾已平 · 暂歇军营</div><h2>军营整备</h2><p class="modal-subtitle">将军请择一策，养精蓄锐再出征</p><div class="camp-grid">${choices.map(([id, title, detail, icon]) => `<button class="camp-card" data-camp="${id}"><span>${icon}</span><strong>${title}</strong><small>${detail}</small></button>`).join('')}</div></section></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-camp]').forEach((button) => {
      button.addEventListener('click', () => {
        const choice = button.dataset.camp as 'heal' | 'attack' | 'blessing' | undefined;
        if (choice) onChoose(choice);
      });
    });
  }

  showPause(state: GameState, onResume: () => void): void {
    const modal = this.root.querySelector<HTMLElement>('#battle-modal');
    if (!modal) return;
    const list = Object.entries(state.blessings).map(([id, level]) => {
      const blessing = BLESSINGS.find((entry) => entry.id === id);
      return blessing ? `<span>${blessing.icon} ${blessing.name} Lv.${level}</span>` : '';
    }).join('');
    modal.innerHTML = `<div class="modal-backdrop"><section class="modal-panel pause-modal"><div class="eyebrow">暂息片刻 · 整军待发</div><h2>战场暂停</h2><div class="owned-blessings">${list || '<span>尚无锦囊</span>'}</div><div class="pause-actions"><button class="button primary" data-resume>继续征战</button><button class="button ghost" data-action="quit">返回主菜单</button></div></section></div>`;
    modal.querySelector('[data-resume]')?.addEventListener('click', onResume);
    this.bindActions();
  }

  showResult(state: GameState, save: SaveData): void {
    const stagesCleared = state.victory ? state.stageIndex + 1 : state.stageIndex;
    const earned = state.kills + stagesCleared * 20 + (state.victory ? 200 : 0);
    this.root.innerHTML = `<main class="screen result-screen"><div class="result-card"><div class="eyebrow">${state.victory ? '天下归心 · 凯旋而归' : '壮志未酬 · 养精再战'}</div><div class="result-seal">${state.victory ? '胜' : '战'}</div><h2>${state.victory ? '大获全胜' : '征途暂歇'}</h2><p>乱世留英名，功勋刻青史</p><div class="result-stats"><div><small>斩敌</small><strong>${state.kills}</strong></div><div><small>最高连击</small><strong>${state.maxCombo}</strong></div><div><small>征战时间</small><strong>${Math.floor(state.time / 60)}分${Math.floor(state.time % 60)}秒</strong></div></div><div class="merit-earned">获得功勋 <strong>${earned}</strong><small>当前总功勋 ${save.merit + earned}</small></div><button class="button primary" data-action="start">再战一场 <span>➜</span></button></div></main>`;
    this.bindActions();
  }

  showGuide(): void {
    const rows = [['移动', 'W A S D / 方向键', '前后左右走位'], ['轻攻击', 'J / 鼠标左键', '连续按压可衔接五段连击'], ['破阵', 'K / 鼠标右键', '释放武将专属强力技'], ['闪避', 'L / Shift', '短暂无敌，抓准时机触发「刹那」'], ['跳跃', 'Space', '空中轻斩，落地破阵'], ['无双', 'Q / U', '无双槽满时施展武将绝技'], ['暂停', 'Esc', '查看锦囊或返回主菜单']];
    this.root.innerHTML = `<main class="screen parchment-screen guide-screen"><header class="screen-heading"><button class="back-button" data-action="title">← 返回</button><div class="eyebrow">兵书 · 操作指南</div><h2>战阵之法</h2><p>运筹帷幄，方能百战不殆</p></header><section class="guide-table">${rows.map(([name, key, description]) => `<div><strong>${name}</strong><kbd>${key}</kbd><span>${description}</span></div>`).join('')}</section><p class="guide-touch">触屏设备将自动显示虚拟摇杆与战斗按钮。</p></main>`;
    this.bindActions();
  }

  showTalents(save: SaveData, onUpgrade: (id: string) => boolean): void {
    const cards = TALENTS.map((talent) => {
      const level = save.talents[talent.id] ?? 0;
      const cost = 30 * (level + 1);
      return `<article class="talent-card"><span class="talent-level">Lv. ${level} / ${talent.maxLevel}</span><strong>${talent.name}</strong><p>${talent.description}</p><div class="talent-pips">${Array.from({ length: talent.maxLevel }, (_, index) => `<i class="${index < level ? 'filled' : ''}"></i>`).join('')}</div><button class="button ${level >= talent.maxLevel ? 'disabled' : 'small'}" data-talent="${talent.id}" ${level >= talent.maxLevel || save.merit < cost ? 'disabled' : ''}>${level >= talent.maxLevel ? '已满级' : `修习 · ${cost} 功勋`}</button></article>`;
    }).join('');
    this.root.innerHTML = `<main class="screen parchment-screen talent-screen"><header class="screen-heading"><button class="back-button" data-action="title">← 返回</button><div class="eyebrow">演武场 · 武学精进</div><h2>百炼成钢</h2><p>投入功勋，提升将军实力</p><div class="merit-balance">现有功勋 <strong>${save.merit}</strong></div></header><section class="talent-grid">${cards}</section></main>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-talent]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.talent;
        if (id && onUpgrade(id)) this.showTalents(save, onUpgrade);
      });
    });
    this.bindActions();
  }

  bindActions(): void {
    this.root.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => {
      element.addEventListener('click', () => {
        const action = element.dataset.action as UiAction | undefined;
        if (action) this.onAction(action);
      });
    });
  }

  private setText(selector: string, text: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = text;
  }

  private audioLabel(): string {
    return this.audio.isEnabled ? '开' : '关';
  }
}
