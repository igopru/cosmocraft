// src/client/audio/GameAudioClient.ts
/**
 * Клиентский аудио-движок CosmoCraft
 * Синтезирует звуки через Web Audio API прямо в браузере
 * (без зависимости от внешнего сервера soulful-space-ambient)
 */
export class GameAudioClient {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _volume: number = 0.7;
  private _muted: boolean = false;
  private _ambientStarted: boolean = false;

  // Ambient layers
  private padOscillators: OscillatorNode[] = [];
  private padFilter: BiquadFilterNode | null = null;
  private padGain: GainNode | null = null;
  private chordTimer: any = null;

  private bassOscillators: OscillatorNode[] = [];
  private bassTimer: any = null;

  private melodyOsc: OscillatorNode | null = null;
  private melodyTimer: any = null;

  private textureSource: AudioBufferSourceNode | null = null;

  private heartbeatOsc: OscillatorNode | null = null;
  private heartbeatTimer: any = null;

  // Настройки
  private padOscType: OscillatorType = 'triangle';
  private padFilterFreq: number = 2000;
  private chordSpeedMs: number = 20000;

  // G minor scale
  private readonly notes = [196.00, 233.08, 261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 466.16, 523.25, 587.33, 622.25, 698.46];
  private readonly chords = [
    [this.notes[0], this.notes[2], this.notes[6]],   // Gm (i)
    [this.notes[2], this.notes[5], this.notes[9]],   // Cm (iv)
    [this.notes[4], this.notes[7], this.notes[11]],  // D# (VI)
    [this.notes[3], this.notes[8], this.notes[10]]   // D (V sus4)
  ];
  private readonly bassNotes = [this.notes[0] / 2, this.notes[2] / 2, this.notes[4] / 2, this.notes[3] / 2];
  private currentChord = 0;

  /**
   * Инициализировать AudioContext (вызывать по первому клику пользователя)
   */
  async init(): Promise<boolean> {
    if (this.ctx) return true;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      return true;
    } catch (e) {
      console.error('❌ Audio init failed:', e);
      return false;
    }
  }

  private ensureCtx(): boolean {
    if (!this.ctx) {
      // console.warn('⚠️ Audio not initialized. Call init() first.');
      return false;
    }
    return true;
  }

  // ========================
  // ГРОМКОСТЬ / MUTE
  // ========================

  get volume(): number { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._muted ? 0 : this._volume;
  }

  get muted(): boolean { return this._muted; }
  set muted(v: boolean) {
    this._muted = v;
    if (this.masterGain) this.masterGain.gain.value = v ? 0 : this._volume;
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  // ========================
  // ЗВУКОВЫЕ ЭФФЕКТЫ
  // ========================

  /** Звук лазера */
  playLaser(intensity: number = 0.5) {
    if (!this.ensureCtx() || this._muted) return;
    const now = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    const filter = this.ctx!.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880 + intensity * 440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);

    filter.type = 'lowpass';
    filter.frequency.value = 4000;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.3 * this._volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Звук ракеты / двигателя */
  playRocket(vol: number = 0.6) {
    if (!this.ensureCtx() || this._muted) return;
    const now = this.ctx!.currentTime;
    const master = this.masterGain!;

    // Шумовой слой
    const noise = this.createNoiseBuffer(1.5);
    const noiseSource = this.ctx!.createBufferSource();
    noiseSource.buffer = noise;
    const noiseFilter = this.ctx!.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 150;
    noiseFilter.Q.value = 0.5;
    const noiseGain = this.ctx!.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(vol * this._volume * 0.3, now + 0.1);
    noiseGain.gain.setValueAtTime(vol * this._volume * 0.3, now + 0.5);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noiseSource.start(now);
    noiseSource.stop(now + 1.5);

    // Саб-бас
    const osc = this.ctx!.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const oscGain = this.ctx!.createGain();
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(vol * this._volume * 0.2, now + 0.1);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc.connect(oscGain);
    oscGain.connect(master);
    osc.start(now);
    osc.stop(now + 1.5);
  }

  /** Звук захвата цели */
  playTargetLock(locked: boolean = true) {
    if (!this.ensureCtx() || this._muted) return;
    const now = this.ctx!.currentTime;

    if (locked) {
      // 3 быстрых бипа
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = 800 + i * 200;
        gain.gain.setValueAtTime(0.001, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.2 * this._volume, now + i * 0.12 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.2);
      }
    } else {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
      gain.gain.setValueAtTime(0.2 * this._volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  }

  /** Звук открытия люка */
  playHatch() {
    if (!this.ensureCtx() || this._muted) return;
    const now = this.ctx!.currentTime;
    const noise = this.createNoiseBuffer(0.7);
    const source = this.ctx!.createBufferSource();
    source.buffer = noise;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.linearRampToValueAtTime(800, now + 0.25);
    filter.frequency.linearRampToValueAtTime(200, now + 0.5);
    filter.Q.value = 2;
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.7 * this._volume, now + 0.05);
    gain.gain.setValueAtTime(0.8 * this._volume, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    source.start(now);
    source.stop(now + 0.7);
  }

  /** Остановить все звуки */
  stopAll() {
    this.stopAmbient();
    // Все короткие эффекты сами останавливаются — Web Audio cleanup
  }

  // ========================
  // ФОНОВЫЙ АМБИЕНТ
  // ========================

  async startAmbient() {
    if (this._ambientStarted) return;
    if (!this.ensureCtx()) return;
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();

    this._ambientStarted = true;
    this.startPad();
    this.startBassline();
    this.startMelody();
    this.startTexture();
    console.log('🎵 Ambient started');
  }

  stopAmbient() {
    this._ambientStarted = false;

    // Pad
    this.padOscillators.forEach(o => { try { o.stop(); } catch {} });
    this.padOscillators = [];
    if (this.chordTimer) clearTimeout(this.chordTimer);

    // Bass
    this.bassOscillators.forEach(o => { try { o.stop(); } catch {} });
    this.bassOscillators = [];
    if (this.bassTimer) clearTimeout(this.bassTimer);

    // Melody
    if (this.melodyOsc) { try { this.melodyOsc.stop(); } catch {} }
    this.melodyOsc = null;
    if (this.melodyTimer) clearTimeout(this.melodyTimer);

    // Texture
    if (this.textureSource) { try { this.textureSource.stop(); } catch {} }
    this.textureSource = null;

    // Heartbeat
    if (this.heartbeatOsc) { try { this.heartbeatOsc.stop(); } catch {} }
    this.heartbeatOsc = null;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);

    console.log('🔇 Ambient stopped');
  }

  private startPad() {
    if (!this._ambientStarted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const chord = this.chords[this.currentChord % this.chords.length];

    this.padGain = this.ctx.createGain();
    this.padGain.gain.setValueAtTime(0, now);
    this.padGain.gain.linearRampToValueAtTime(0.08 * this._volume, now + 6);
    this.padGain.connect(this.masterGain!);

    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = this.padFilterFreq;
    this.padFilter.connect(this.padGain);

    this.padOscillators = [];
    chord.forEach(freq => {
      [freq, freq * 1.003].forEach(f => {
        const osc = this.ctx!.createOscillator();
        osc.type = this.padOscType;
        osc.frequency.value = f;
        osc.connect(this.padFilter!);
        osc.start(now);
        this.padOscillators.push(osc);
      });
    });

    this.scheduleNextChord();
  }

  private scheduleNextChord() {
    if (!this._ambientStarted) return;
    this.chordTimer = setTimeout(() => {
      if (!this._ambientStarted) return;
      // Fade out
      const now = this.ctx!.currentTime;
      if (this.padGain) {
        this.padGain.gain.cancelScheduledValues(now);
        this.padGain.gain.setValueAtTime(this.padGain.gain.value, now);
        this.padGain.gain.linearRampToValueAtTime(0, now + 3);
      }
      this.padOscillators.forEach(o => { try { o.stop(now + 3); } catch {} });
      this.padOscillators = [];
      this.currentChord++;
      setTimeout(() => this.startPad(), 3100);
    }, this.chordSpeedMs);
  }

  private startBassline() {
    if (!this._ambientStarted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const freq = this.bassNotes[Math.floor(Math.random() * this.bassNotes.length)];

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq / 2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15 * this._volume, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.1 * this._volume, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 7);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain!);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 7);
    osc2.stop(now + 7);

    this.bassOscillators.push(osc1, osc2);
    this.bassTimer = setTimeout(() => this.startBassline(), 10000 + Math.random() * 4000);
  }

  private startMelody() {
    if (!this._ambientStarted || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Простая мелодическая фраза
    const phrase = [0, 2, 4, 2].map(i => this.notes[i % this.notes.length]);
    phrase.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx!.createGain();
      const t = now + i * 0.8;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.06 * this._volume, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.7);
    });

    this.melodyTimer = setTimeout(() => this.startMelody(), 18000 + Math.random() * 8000);
  }

  private startTexture() {
    if (!this._ambientStarted || !this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    this.textureSource = this.ctx.createBufferSource();
    this.textureSource.buffer = buffer;
    this.textureSource.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.03 * this._volume;
    this.textureSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    this.textureSource.start();
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    if (!this.ctx) throw new Error('No context');
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // ========================
  // ПАРАМЕТРЫ
  // ========================

  setPadOscillatorType(type: OscillatorType) {
    this.padOscType = type;
  }

  setPadFilterFrequency(freq: number) {
    this.padFilterFreq = freq;
    if (this.padFilter) this.padFilter.frequency.value = freq;
  }

  setChordSpeed(ms: number) {
    this.chordSpeedMs = Math.max(4000, Math.min(30000, ms));
  }
}
