const BASE = import.meta.env.BASE_URL;

export interface AnimationEntry {
  src: string;
  frames: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  figureH?: number;
  blend?: 'lighter';
}

export interface AnimationProgress {
  loaded: number;
  total: number;
  ready: boolean;
}

export interface DrawAnimationOptions {
  alpha?: number;
  flash?: number;
  tint?: string;
}

export class AnimationBank {
  private manifest: Record<string, AnimationEntry> = {};
  private readonly images = new Map<string, HTMLImageElement | null>();
  private readonly processed = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
  private readonly progressListeners = new Set<(progress: AnimationProgress) => void>();
  private loading: Promise<void> | null = null;
  private progress: AnimationProgress = { loaded: 0, total: 0, ready: false };

  load(onProgress?: (progress: AnimationProgress) => void): Promise<void> {
    if (onProgress) {
      this.progressListeners.add(onProgress);
      onProgress(this.progress);
    }
    if (!this.loading) this.loading = this.preload();
    return this.loading;
  }

  getProgress(): AnimationProgress {
    return { ...this.progress };
  }

  getEntry(key: string): AnimationEntry | undefined {
    return this.manifest[key];
  }

  drawAnim(
    context: CanvasRenderingContext2D,
    key: string,
    frame: number,
    x: number,
    footY: number,
    targetHeight: number,
    facing: 1 | -1,
    options: DrawAnimationOptions = {},
  ): boolean {
    const entry = this.manifest[key];
    if (!entry) return false;
    const image = this.images.get(entry.src);
    if (!image?.complete || !image.naturalWidth) return false;

    const referenceHeight = this.referenceHeight(key, entry);
    const scale = targetHeight / referenceHeight;
    const frameIndex = ((Math.floor(frame) % entry.frames) + entry.frames) % entry.frames;
    const sourceX = frameIndex * entry.w;
    const source = options.tint ? this.processedStrip(image, entry, options.tint) : image;
    const alpha = options.alpha ?? 1;

    context.save();
    context.globalAlpha *= alpha;
    if (entry.blend === 'lighter') context.globalCompositeOperation = 'lighter';
    context.translate(x, footY);
    context.scale(facing * scale, scale);
    context.drawImage(source, sourceX, 0, entry.w, entry.h, -entry.anchorX, -entry.anchorY, entry.w, entry.h);

    const flashAlpha = Math.min(0.6, Math.max(0, ((options.flash ?? 0) / 0.12) * 0.6));
    if (flashAlpha > 0 && entry.blend !== 'lighter') {
      context.globalAlpha = alpha * flashAlpha;
      const whiteStrip = this.processedStrip(image, entry, 'white');
      context.drawImage(whiteStrip, sourceX, 0, entry.w, entry.h, -entry.anchorX, -entry.anchorY, entry.w, entry.h);
    }
    context.restore();
    return true;
  }

  private async preload(): Promise<void> {
    try {
      const response = await fetch(`${BASE}assets/anim/manifest.json`);
      if (!response.ok) throw new Error(`Animation manifest returned ${response.status}`);
      this.manifest = await response.json() as Record<string, AnimationEntry>;
      const sources = [...new Set(Object.values(this.manifest).map(({ src }) => src))];
      this.progress = { loaded: 0, total: sources.length, ready: false };
      this.notifyProgress();
      await Promise.all(sources.map((src) => this.preloadImage(src)));
    } catch {
      this.manifest = {};
    }
    this.progress = { ...this.progress, ready: true };
    this.notifyProgress();
  }

  private preloadImage(src: string): Promise<void> {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      let finished = false;
      const finish = (loaded: boolean): void => {
        if (finished) return;
        finished = true;
        this.images.set(src, loaded ? image : null);
        this.progress = { ...this.progress, loaded: this.progress.loaded + 1 };
        this.notifyProgress();
        resolve();
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = `${BASE}assets/${src}`;
      if (image.complete) finish(image.naturalWidth > 0);
    });
  }

  private referenceHeight(key: string, entry: AnimationEntry): number {
    if (key.startsWith('vfx/')) return entry.h;
    const character = key.slice(0, key.indexOf('/'));
    const reference = this.manifest[`${character}/idle`] ?? this.manifest[`${character}/walk`] ?? entry;
    return reference.figureH ?? reference.h;
  }

  private processedStrip(image: HTMLImageElement, entry: AnimationEntry, effect: string): HTMLCanvasElement {
    let variants = this.processed.get(image);
    if (!variants) {
      variants = new Map();
      this.processed.set(image, variants);
    }
    const cached = variants.get(effect);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = entry.w * entry.frames;
    canvas.height = entry.h;
    const context = canvas.getContext('2d');
    if (context) {
      if (effect === 'act2') context.filter = 'hue-rotate(-40deg) saturate(1.2) brightness(0.8)';
      else if (effect === 'blue') context.filter = 'hue-rotate(170deg) saturate(1.2) brightness(1.15)';
      context.drawImage(image, 0, 0);
      if (effect === 'white') {
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    variants.set(effect, canvas);
    return canvas;
  }

  private notifyProgress(): void {
    const progress = this.getProgress();
    for (const listener of this.progressListeners) listener(progress);
  }
}

export const animationBank = new AnimationBank();

export function drawAnim(
  context: CanvasRenderingContext2D,
  key: string,
  frame: number,
  x: number,
  footY: number,
  targetHeight: number,
  facing: 1 | -1,
  options: DrawAnimationOptions = {},
): boolean {
  return animationBank.drawAnim(context, key, frame, x, footY, targetHeight, facing, options);
}
