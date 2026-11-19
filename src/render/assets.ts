const BASE = import.meta.env.BASE_URL;

export class AssetLoader {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly whiteMasks = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

  load(path: string): HTMLImageElement {
    const existing = this.images.get(path);
    if (existing) return existing;
    const image = new Image();
    image.src = `${BASE}assets/${path}`;
    image.decoding = 'async';
    this.images.set(path, image);
    return image;
  }

  get(path: string): HTMLImageElement | undefined {
    return this.images.get(path);
  }

  drawSprite(
    context: CanvasRenderingContext2D,
    path: string,
    x: number,
    footY: number,
    height: number,
    facing: 1 | -1,
    options: { white?: boolean; alpha?: number; tint?: string } = {},
  ): boolean {
    const image = this.load(path);
    if (!image.complete || image.naturalWidth === 0) return false;
    const width = height * image.naturalWidth / image.naturalHeight;
    context.save();
    context.globalAlpha = options.alpha ?? 1;
    if (options.tint) context.filter = `sepia(.3) saturate(1.8) hue-rotate(${options.tint})`;
    context.translate(x, footY);
    context.scale(facing, 1);
    const source = options.white ? this.whiteMask(image) : image;
    context.drawImage(source, -width / 2, -height, width, height);
    context.restore();
    return true;
  }

  private whiteMask(image: HTMLImageElement): HTMLCanvasElement {
    const cached = this.whiteMasks.get(image);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(image, 0, 0);
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.whiteMasks.set(image, canvas);
    return canvas;
  }
}

export function heroSpritePath(heroId: string, pose: 'idle' | 'attack' | 'skill'): string {
  return `heroes/${heroId}_${pose}.png`;
}

export function enemySpritePath(kind: string, pose: 'idle' | 'attack', boss: boolean): string {
  if (boss) return `bosses/${kind}_${pose}.png`;
  const name = kind === 'elite' ? 'saber' : kind;
  return `enemies/${name}_${pose}.png`;
}
