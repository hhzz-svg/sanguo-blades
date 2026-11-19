export type SoundName = 'slash' | 'hit' | 'heavy' | 'crit' | 'dodge' | 'musou';

export class AudioSynth {
  private context: AudioContext | null = null;
  private enabled: boolean;
  private bgmTimer: number | undefined;
  private bgmStep = 0;

  constructor() {
    try {
      this.enabled = localStorage.getItem('sanguo-blades.audio') !== 'off';
    } catch {
      this.enabled = true;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('sanguo-blades.audio', this.enabled ? 'on' : 'off');
    } catch {
      // Audio preference remains available for this session.
    }
    if (!this.enabled) this.stopBgm();
    return this.enabled;
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    const context = this.getContext();
    if (!context) return;
    const presets: Record<SoundName, { frequency: number; duration: number; type: OscillatorType; gain: number }> = {
      slash: { frequency: 560, duration: 0.09, type: 'sawtooth', gain: 0.045 },
      hit: { frequency: 110, duration: 0.12, type: 'triangle', gain: 0.12 },
      heavy: { frequency: 68, duration: 0.32, type: 'sine', gain: 0.18 },
      crit: { frequency: 880, duration: 0.22, type: 'triangle', gain: 0.1 },
      dodge: { frequency: 390, duration: 0.13, type: 'sawtooth', gain: 0.06 },
      musou: { frequency: 52, duration: 0.7, type: 'sine', gain: 0.22 },
    };
    const preset = presets[name];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, preset.frequency * 0.35), context.currentTime + preset.duration);
    gain.gain.setValueAtTime(preset.gain, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + preset.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + preset.duration);
  }

  startBgm(): void {
    if (!this.enabled || this.bgmTimer !== undefined) return;
    const notes = [110, 110, 146.8, 130.8, 98, 98, 130.8, 110];
    this.bgmTimer = window.setInterval(() => {
      if (!this.enabled) return;
      const context = this.getContext();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = notes[this.bgmStep % notes.length]!;
      gain.gain.setValueAtTime(0.018, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.42);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.44);
      this.bgmStep += 1;
    }, 450);
  }

  stopBgm(): void {
    if (this.bgmTimer !== undefined) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = undefined;
    }
  }

  private getContext(): AudioContext | null {
    if (this.context) return this.context;
    const AudioContextType = window.AudioContext;
    if (!AudioContextType) return null;
    this.context = new AudioContextType();
    void this.context.resume();
    return this.context;
  }
}
