class SoundEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private musicEnabled = false;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private stepIndex = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  configure(options: { soundEnabled?: boolean; musicEnabled?: boolean }) {
    if (typeof options.soundEnabled === 'boolean') {
      this.soundEnabled = options.soundEnabled;
    }
    if (typeof options.musicEnabled === 'boolean') {
      const changed = this.musicEnabled !== options.musicEnabled;
      this.musicEnabled = options.musicEnabled;
      if (changed) {
        if (this.musicEnabled) {
          this.startMusic();
        } else {
          this.stopMusic();
        }
      }
    }
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.12, delay = 0) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    this.playTone(540, 0.055, 'triangle', 0.07);
  }

  playMove() {
    this.playTone(392, 0.08, 'sine', 0.09);
  }

  playGameStart() {
    this.playTone(392, 0.12, 'triangle', 0.09, 0);
    this.playTone(493.88, 0.12, 'triangle', 0.09, 0.08);
    this.playTone(587.33, 0.18, 'triangle', 0.11, 0.16);
  }

  playVictory() {
    this.playTone(523.25, 0.14, 'triangle', 0.11, 0);
    this.playTone(659.25, 0.14, 'triangle', 0.11, 0.1);
    this.playTone(783.99, 0.16, 'triangle', 0.12, 0.2);
    this.playTone(1046.5, 0.32, 'sine', 0.13, 0.3);
  }

  playDefeat() {
    this.playTone(349.23, 0.16, 'sine', 0.1, 0);
    this.playTone(311.13, 0.16, 'sine', 0.1, 0.14);
    this.playTone(261.63, 0.3, 'sine', 0.09, 0.28);
  }

  playDraw() {
    this.playTone(440, 0.13, 'triangle', 0.08, 0);
    this.playTone(440, 0.18, 'triangle', 0.08, 0.14);
  }

  startMusic() {
    if (!this.musicEnabled || this.musicTimer !== null) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    gain.connect(ctx.destination);
    this.musicGain = gain;

    // Gentle ambient lo-fi chord progression (C Maj7 -> A min7 -> F Maj7 -> G6)
    const chords = [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 329.63],
    ];

    const playChord = () => {
      if (!this.musicEnabled || !this.ctx || !this.musicGain) return;
      const chord = chords[this.stepIndex % chords.length];
      this.stepIndex += 1;
      const now = this.ctx.currentTime;
      for (const freq of chord) {
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 820;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        noteGain.gain.setValueAtTime(0.0001, now);
        noteGain.gain.linearRampToValueAtTime(0.28, now + 0.6);
        noteGain.gain.linearRampToValueAtTime(0.0001, now + 3.1);

        osc.connect(filter);
        filter.connect(noteGain);
        noteGain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 3.2);
      }
    };

    playChord();
    this.musicTimer = window.setInterval(playChord, 3000);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) {
      try {
        this.musicGain.disconnect();
      } catch {
        // ignore
      }
      this.musicGain = null;
    }
  }
}

export const soundEngine = new SoundEngine();
