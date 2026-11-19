import './ui/ui.css';
import { HEROES } from './data/heroes';
import { GameEngine, FIXED_DT } from './engine/engine';
import { offerBlessings } from './engine/blessings';
import { defaultSave, loadSave, saveData, type SaveData } from './engine/save';
import { TALENTS } from './data/talents';
import { AudioSynth } from './render/audio';
import { BattleRenderer } from './render/renderer';
import { GameUI, type UiAction } from './ui/ui';
import type { GameState, TickInput } from './engine/types';

const root = document.querySelector<HTMLElement>('#app')!;

const audio = new AudioSynth();
let saved: SaveData;
try {
  saved = loadSave(localStorage);
} catch {
  saved = defaultSave();
}
let engine: GameEngine | null = null;
let renderer: BattleRenderer | null = null;
let screen: 'title' | 'hero' | 'intro' | 'battle' | 'talents' | 'guide' | 'result' = 'title';
let resultSaved = false;
let modalShown = false;
let pauseShown = false;
let lastFrame = 0;
let accumulator = 0;
const keys = new Set<string>();
const touchState = { moveX: 0, moveY: 0 };
const queued: { dodge: boolean; jump: boolean; pause: boolean; proceed: boolean } = {
  dodge: false,
  jump: false,
  pause: false,
  proceed: false,
};
const ui = new GameUI(root, handleAction, audio);
ui.showTitle(saved);

declare global {
  interface Window {
    __SANGUO__: {
      getState: () => GameState | null;
      engine: GameEngine | null;
    };
  }
}

window.__SANGUO__ = {
  getState: () => engine?.state ?? null,
  get engine() {
    return engine;
  },
};

function handleAction(action: UiAction): void {
  switch (action) {
    case 'start':
      screen = 'hero';
      ui.showHeroSelect();
      break;
    case 'title':
      screen = 'title';
      engine = null;
      ui.showTitle(saved);
      break;
    case 'talents':
      screen = 'talents';
      ui.showTalents(saved, upgradeTalent);
      break;
    case 'guide':
      screen = 'guide';
      ui.showGuide();
      break;
    case 'hero-confirm':
      beginRun();
      break;
    case 'intro-start':
      mountBattle();
      break;
    case 'pause':
      if (engine) {
        engine.state.paused = true;
        pauseShown = true;
        ui.showPause(engine.state, () => {
          engine!.state.paused = false;
          pauseShown = false;
          clearBattleModal();
        });
      }
      break;
    case 'resume':
      if (engine) engine.state.paused = false;
      pauseShown = false;
      clearBattleModal();
      break;
    case 'quit':
      engine = null;
      renderer = null;
      resultSaved = false;
      audio.stopBgm();
      screen = 'title';
      ui.showTitle(saved);
      break;
    case 'advance':
      queued.proceed = true;
      break;
    case 'audio':
      audio.toggle();
      ui.showTitle(saved);
      screen = 'title';
      break;
  }
}

function beginRun(): void {
  const hero = HEROES.some(({ id }) => id === ui.selectedHero) ? ui.selectedHero : 'zhaoyun';
  engine = new GameEngine({ heroId: hero, seed: Date.now(), talents: saved.talents });
  resultSaved = false;
  modalShown = false;
  screen = 'intro';
  ui.showActIntro(1);
}

function mountBattle(): void {
  if (!engine) engine = new GameEngine({ heroId: ui.selectedHero, seed: Date.now(), talents: saved.talents });
  const canvas = ui.showBattle();
  renderer = new BattleRenderer(canvas, audio);
  screen = 'battle';
  audio.startBgm();
  ui.updateBattle(engine.state);
  setupTouchControls();
}

function upgradeTalent(id: string): boolean {
  const level = saved.talents[id] ?? 0;
  const definition = TALENTS.find((talent) => talent.id === id);
  if (!definition || level >= definition.maxLevel) return false;
  const cost = 30 * (level + 1);
  if (saved.merit < cost) return false;
  saved.merit -= cost;
  saved.talents[id] = level + 1;
  persistSave();
  return true;
}

function persistSave(): void {
  try {
    saveData(localStorage, saved);
  } catch {
    // The run still works when browser storage is unavailable.
  }
}

function clearBattleModal(): void {
  root.querySelector('#battle-modal')?.replaceChildren();
}

function mountBlessingModal(): void {
  if (!engine || modalShown) return;
  modalShown = true;
  showBlessingChoices();
}

function showBlessingChoices(excluded: string[] = []): void {
  if (!engine) return;
  const options = offerBlessings(engine.state.blessings, engine.random, 3, excluded);
  ui.showBlessings(options, engine.state.blessings, (id) => {
    engine!.pickBlessing(id);
    advanceAfterReward();
  }, () => {
    if (!engine || engine.state.blessingRerolls <= 0) return;
    engine.state.blessingRerolls -= 1;
    showBlessingChoices([...excluded, ...options.map(({ id }) => id)]);
  }, engine.state.blessingRerolls);
}

function mountCampModal(): void {
  if (!engine || modalShown) return;
  modalShown = true;
  ui.showCamp((choice) => {
    if (!engine) return;
    if (choice === 'heal') {
      engine.state.player.hp = Math.min(engine.state.player.maxHp, engine.state.player.hp + engine.state.player.maxHp * 0.6);
    } else if (choice === 'attack') {
      engine.state.player.attack *= 1.15;
    } else {
      showBlessingChoices();
      return;
    }
    advanceAfterReward();
  });
}

function advanceAfterReward(): void {
  if (!engine) return;
  const priorAct = engine.state.act;
  engine.advanceStage();
  modalShown = false;
  if (engine.state.gameOver) {
    finishRun();
    return;
  }
  if (priorAct !== engine.state.act) {
    screen = 'intro';
    ui.showActIntro(engine.state.act);
  } else {
    mountBattle();
  }
}

function finishStage(): void {
  if (!engine || modalShown) return;
  if (engine.state.stageIndex === 8) {
    engine.advanceStage();
    finishRun();
  } else if (engine.state.stageIndex === 4) {
    mountCampModal();
  } else {
    mountBlessingModal();
  }
}

function finishRun(): void {
  if (!engine || resultSaved) return;
  resultSaved = true;
  screen = 'result';
  audio.stopBgm();
  const state = engine.state;
  const stagesCleared = state.victory ? state.stageIndex + 1 : state.stageIndex;
  const earned = state.kills + stagesCleared * 20 + (state.victory ? 200 : 0);
  saved.merit += Math.floor(earned * (1 + (saved.talents.pay ?? 0) * 0.1));
  saved.stats.runs += 1;
  saved.stats.wins += state.victory ? 1 : 0;
  saved.stats.bestCombo = Math.max(saved.stats.bestCombo, state.maxCombo);
  saved.stats.totalKills += state.kills;
  persistSave();
  ui.showResult(state, saved);
}

function inputForTick(): TickInput {
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const input: TickInput = {
    moveX: touchState.moveX || (right === left ? 0 : right ? 1 : -1),
    moveY: touchState.moveY || (down === up ? 0 : down ? 1 : -1),
    attack: keys.has('j') || keys.has('mouse-left') || keys.has('touch-attack'),
    heavy: keys.has('k') || keys.has('mouse-right') || keys.has('touch-heavy'),
    dodge: queued.dodge,
    jump: queued.jump || keys.has('touch-jump'),
    musou: keys.has('q') || keys.has('u') || keys.has('touch-musou'),
    pause: queued.pause,
    proceed: queued.proceed,
  };
  queued.dodge = false;
  queued.jump = false;
  queued.pause = false;
  queued.proceed = false;
  return input;
}

function onKeyDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (screen === 'hero' && ['1', '2', '3', 'arrowleft', 'arrowright'].includes(key)) {
    const current = HEROES.findIndex(({ id }) => id === ui.selectedHero);
    const next = key === '1' ? 0 : key === '2' ? 1 : key === '3' ? 2 : (current + (key === 'arrowright' ? 1 : 2)) % 3;
    ui.selectedHero = HEROES[next]!.id;
    ui.showHeroSelect();
    return;
  }
  if (screen === 'hero' && key === 'enter') {
    beginRun();
    return;
  }
  if (key === 'escape' && !event.repeat && screen === 'battle') queued.pause = true;
  if ((key === 'l' || key === 'shift') && !event.repeat) queued.dodge = true;
  if (key === ' ' && !event.repeat) queued.jump = true;
  if (screen === 'battle' && ['j', 'k', 'q', 'u', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'l', ' '].includes(key)) {
    keys.add(key);
    return;
  }
  if (['j', 'k', 'q', 'u', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) keys.add(key);
}

function onKeyUp(event: KeyboardEvent): void {
  keys.delete(event.key.toLowerCase());
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', () => keys.clear());
document.addEventListener('contextmenu', (event) => {
  if (screen === 'battle') event.preventDefault();
});

root.addEventListener('pointerdown', (event) => {
  if (screen !== 'battle' || !(event.target instanceof HTMLCanvasElement)) return;
  if (event.button === 0) keys.add('mouse-left');
  if (event.button === 2) keys.add('mouse-right');
});
window.addEventListener('pointerup', () => {
  keys.delete('mouse-left');
  keys.delete('mouse-right');
});

function setupTouchControls(): void {
  const controls = root.querySelector<HTMLElement>('#touch-controls');
  if (!controls) return;
  controls.classList.toggle('hidden', !window.matchMedia('(pointer: coarse)').matches);
  const stick = controls.querySelector<HTMLElement>('#virtual-stick');
  let pointerId: number | null = null;
  const updateStick = (event: PointerEvent) => {
    if (!stick || pointerId !== event.pointerId) return;
    const rect = stick.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    touchState.moveX = Math.abs(dx) > 0.2 ? Math.max(-1, Math.min(1, dx)) : 0;
    touchState.moveY = Math.abs(dy) > 0.2 ? Math.max(-1, Math.min(1, dy)) : 0;
    const knob = stick.querySelector<HTMLElement>('i');
    if (knob) knob.style.transform = `translate(${touchState.moveX * 26}px, ${touchState.moveY * 26}px)`;
  };
  stick?.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    stick.setPointerCapture(pointerId);
    updateStick(event);
  });
  stick?.addEventListener('pointermove', updateStick);
  stick?.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    touchState.moveX = 0;
    touchState.moveY = 0;
    const knob = stick.querySelector<HTMLElement>('i');
    if (knob) knob.style.transform = '';
  });
  controls.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const key = `touch-${control}`;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (control !== 'dodge') keys.add(key);
      if (control === 'dodge') queued.dodge = true;
      if (control === 'jump') queued.jump = true;
    });
    button.addEventListener('pointerup', () => keys.delete(key));
    button.addEventListener('pointercancel', () => keys.delete(key));
  });
}

function frame(now: number): void {
  if (!lastFrame) lastFrame = now;
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (screen === 'battle' && engine && renderer) {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      engine.tick(inputForTick());
      accumulator -= FIXED_DT;
    }
    renderer.render(engine, elapsed);
    ui.updateBattle(engine.state);
    if (!engine.state.paused && engine.state.stageComplete && !modalShown) finishStage();
    if (engine.state.paused && !pauseShown) {
      pauseShown = true;
      ui.showPause(engine.state, () => {
        engine!.state.paused = false;
        pauseShown = false;
        clearBattleModal();
      });
    } else if (!engine.state.paused && pauseShown) {
      pauseShown = false;
      clearBattleModal();
    }
    if (engine.state.gameOver && !resultSaved) finishRun();
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
