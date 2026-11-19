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

interface AnimationFrame {
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  variants: Map<string, CanvasImageSource>;
}

const VFX_MAX_HEIGHT: Record<string, number> = {
  'vfx/slash': 248,
  'vfx/slash_gold': 142,
  'vfx/thrust': 178,
  'vfx/impact': 156,
  'vfx/fire': 325,
  'vfx/lightning': 300,
  'vfx/dust': 230,
  'vfx/dragon_azure': 510,
  'vfx/dragon_green': 540,
  'vfx/shockwave': 590,
};

export class AnimationBank {
  private manifest: Record<string, AnimationEntry> = {};
  private readonly framesBySource = new Map<string, AnimationFrame[]>();
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
    const frames = entry && this.framesBySource.get(entry.src);
    if (!entry || !frames?.length) return false;

    const frameIndex = ((Math.floor(frame) % frames.length) + frames.length) % frames.length;
    const image = frames[frameIndex];
    if (!image?.bitmap) return false;

    const scale = targetHeight / this.referenceHeight(key, entry);
    const alpha = options.alpha ?? 1;
    const source = options.tint ? this.tintFrame(image, options.tint) : image.bitmap;
    const drawX = image.offsetX - entry.anchorX;
    const drawY = image.offsetY - entry.anchorY;
    const draw = (bitmap: CanvasImageSource): void => {
      context.drawImage(bitmap, 0, 0, image.width, image.height, drawX, drawY, image.width, image.height);
    };

    context.save();
    context.globalAlpha *= alpha;
    if (entry.blend === 'lighter') context.globalCompositeOperation = 'lighter';
    context.translate(x, footY);
    context.scale(facing * scale, scale);
    draw(source);

    const flashAlpha = Math.min(0.6, Math.max(0, ((options.flash ?? 0) / 0.12) * 0.6));
    if (flashAlpha > 0 && entry.blend !== 'lighter') {
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = alpha * flashAlpha;
      draw(image.bitmap);
    }
    context.restore();
    return true;
  }

  private async preload(): Promise<void> {
    try {
      const response = await fetch(`${BASE}assets/anim/manifest.json`);
      if (!response.ok) throw new Error(`Animation manifest returned ${response.status}`);
      this.manifest = await response.json() as Record<string, AnimationEntry>;
    } catch {
      this.manifest = {};
      this.progress = { loaded: 0, total: 0, ready: true };
      this.notifyProgress();
      return;
    }

    const sources = [...new Set(Object.values(this.manifest).map(({ src }) => src))];
    this.progress = { loaded: 0, total: sources.length, ready: false };
    this.notifyProgress();

    for (const src of sources) {
      const entry = Object.entries(this.manifest).find(([, value]) => value.src === src)?.[1];
      const image = await this.preloadImage(src);
      if (image && entry) {
        try {
          this.framesBySource.set(src, await this.sliceFrames(src, image, entry));
        } catch {
          this.framesBySource.set(src, []);
        } finally {
          image.onload = null;
          image.onerror = null;
          image.src = '';
        }
      } else {
        this.framesBySource.set(src, []);
      }
      this.progress = { ...this.progress, loaded: this.progress.loaded + 1 };
      this.notifyProgress();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }

    this.progress = { ...this.progress, ready: true };
    this.notifyProgress();
  }

  private preloadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      let finished = false;
      const finish = (loaded: boolean): void => {
        if (finished) return;
        finished = true;
        resolve(loaded ? image : null);
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = `${BASE}assets/${src}`;
      if (image.complete) finish(image.naturalWidth > 0);
    });
  }

  private async sliceFrames(src: string, image: HTMLImageElement, entry: AnimationEntry): Promise<AnimationFrame[]> {
    const scratch = document.createElement('canvas');
    scratch.width = entry.w;
    scratch.height = entry.h;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) return [];

    const key = Object.entries(this.manifest).find(([, value]) => value.src === src)?.[0] ?? '';
    const maxPixels = this.maxFramePixels(key);
    const frames: AnimationFrame[] = [];
    for (let index = 0; index < entry.frames; index += 1) {
      context.clearRect(0, 0, entry.w, entry.h);
      context.drawImage(image, index * entry.w, 0, entry.w, entry.h, 0, 0, entry.w, entry.h);
      const { data } = context.getImageData(0, 0, entry.w, entry.h);
      let left = entry.w;
      let top = entry.h;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < entry.h; y += 1) {
        for (let x = 0; x < entry.w; x += 1) {
          if (data[(y * entry.w + x) * 4 + 3]! <= 8) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      if (right < left || bottom < top) {
        frames.push({ bitmap: null, width: 0, height: 0, offsetX: 0, offsetY: 0, variants: new Map() });
        continue;
      }

      left = Math.max(0, left - 2);
      top = Math.max(0, top - 2);
      right = Math.min(entry.w - 1, right + 2);
      bottom = Math.min(entry.h - 1, bottom + 2);
      const width = right - left + 1;
      const height = bottom - top + 1;
      const sourceScale = Math.min(1, maxPixels / (key.startsWith('vfx/') ? Math.max(width, height) : height));
      const resizeWidth = Math.max(1, Math.round(width * sourceScale));
      const resizeHeight = Math.max(1, Math.round(height * sourceScale));
      let bitmap: ImageBitmap;
      if (sourceScale < 1) {
        try {
          bitmap = await createImageBitmap(image, index * entry.w + left, top, width, height, {
            resizeWidth,
            resizeHeight,
            resizeQuality: 'high',
          });
        } catch {
          bitmap = await this.resizeBitmap(image, index * entry.w + left, top, width, height, resizeWidth, resizeHeight);
        }
      } else {
        bitmap = await createImageBitmap(image, index * entry.w + left, top, width, height);
      }
      frames.push({
        bitmap,
        width,
        height,
        offsetX: left,
        offsetY: top,
        variants: new Map(),
      });
    }
    return frames;
  }

  private async resizeBitmap(
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    resizeWidth: number,
    resizeHeight: number,
  ): Promise<ImageBitmap> {
    const source = await createImageBitmap(image, x, y, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = resizeWidth;
    canvas.height = resizeHeight;
    const context = canvas.getContext('2d');
    if (!context) return source;
    context.drawImage(source, 0, 0, resizeWidth, resizeHeight);
    const bitmap = await createImageBitmap(canvas);
    source.close();
    return bitmap;
  }

  private maxFramePixels(key: string): number {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (key.startsWith('vfx/')) return Math.min(512, (VFX_MAX_HEIGHT[key] ?? 512) * dpr);
    const character = key.slice(0, key.indexOf('/'));
    const maxHeight = character === 'zhaoyun' || character === 'guanyu' || character === 'zhangfei'
      ? 190
      : character === 'lvbu' || character === 'zhangjiao'
        ? 260
        : character === 'cavalry' ? 200 : 170;
    return maxHeight * dpr;
  }

  private referenceHeight(key: string, entry: AnimationEntry): number {
    if (key.startsWith('vfx/')) return entry.h;
    const character = key.slice(0, key.indexOf('/'));
    const reference = this.manifest[`${character}/idle`] ?? this.manifest[`${character}/walk`] ?? entry;
    return reference.figureH ?? reference.h;
  }

  private tintFrame(frame: AnimationFrame, effect: string): CanvasImageSource {
    const cached = frame.variants.get(effect);
    if (cached) return cached;
    if (!frame.bitmap) return document.createElement('canvas');

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(frame.bitmap.width, frame.bitmap.height)
      : document.createElement('canvas');
    canvas.width = frame.bitmap.width;
    canvas.height = frame.bitmap.height;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (context) {
      context.filter = effect === 'act2'
        ? 'hue-rotate(-40deg) saturate(1.2) brightness(0.8)'
        : 'hue-rotate(170deg) saturate(1.2) brightness(1.15)';
      context.drawImage(frame.bitmap, 0, 0);
      context.filter = 'none';
    }
    frame.variants.set(effect, canvas);
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
