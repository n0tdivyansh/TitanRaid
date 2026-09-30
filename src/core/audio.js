/**
 * Fully procedural WebAudio SFX - no audio files shipped.
 * Every sound is synthesised from oscillators / noise buffers on demand.
 */
import { save, persist } from './save.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = save.sound !== false;
    this.systemMuted = false;
    this.stepTimer = 0;
    this._noiseBuffer = null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.systemMuted) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    const active = this.enabled && !this.systemMuted;
    this.master.gain.value = active ? 0.5 : 0.0001;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on) {
    this.enabled = on;
    save.sound = on;
    persist();
    if (this.master && this.ctx) {
      const active = this.enabled && !this.systemMuted;
      this.master.gain.setTargetAtTime(active ? 0.5 : 0.0001, this.ctx.currentTime, 0.02);
    }
  }

  /** System mute for ad playback or window blur without altering user sound preference */
  setSystemMuted(muted) {
    this.systemMuted = !!muted;
    if (this.master && this.ctx) {
      const active = this.enabled && !this.systemMuted;
      this.master.gain.setTargetAtTime(active ? 0.5 : 0.0001, this.ctx.currentTime, 0.02);
    }
  }

  get ready() {
    return !!this.ctx && this.enabled && !this.systemMuted;
  }

  _noise() {
    if (!this.ctx) return null;
    if (!this._noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    return src;
  }

  /** Core tone helper. */
  tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.25, slide = 0, delay = 0, attack = 0.005 }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noiseBurst({ dur = 0.18, gain = 0.25, freq = 1200, q = 1, delay = 0, type = 'lowpass' }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this._noise();
    if (!src) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --------------------------------------------------------------- cues
  coin(pitchStep = 0) {
    this.tone({ freq: 880 * Math.pow(1.06, pitchStep), type: 'triangle', dur: 0.1, gain: 0.18 });
    this.tone({ freq: 1320 * Math.pow(1.06, pitchStep), type: 'sine', dur: 0.12, gain: 0.1, delay: 0.04 });
  }

  gateGood(strength = 1) {
    const base = 320 + strength * 60;
    this.tone({ freq: base, type: 'square', dur: 0.12, gain: 0.14 });
    this.tone({ freq: base * 1.5, type: 'square', dur: 0.16, gain: 0.12, delay: 0.07 });
    this.tone({ freq: base * 2, type: 'sine', dur: 0.2, gain: 0.1, delay: 0.14 });
  }

  gateBad() {
    this.tone({ freq: 220, type: 'sawtooth', dur: 0.26, gain: 0.16, slide: -140 });
    this.noiseBurst({ dur: 0.2, gain: 0.12, freq: 700 });
  }

  hit() {
    this.noiseBurst({ dur: 0.16, gain: 0.3, freq: 420 });
    this.tone({ freq: 140, type: 'sawtooth', dur: 0.18, gain: 0.2, slide: -80 });
  }

  clash() {
    this.noiseBurst({ dur: 0.1, gain: 0.22, freq: 2600, type: 'bandpass', q: 3 });
  }

  footsteps(dt, crowdSize) {
    if (!this.ready) return;
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.24;
      const g = Math.min(0.09, 0.02 + crowdSize * 0.0008);
      this.noiseBurst({ dur: 0.07, gain: g, freq: 260 });
    }
  }

  bossHit() {
    this.tone({ freq: 90, type: 'square', dur: 0.14, gain: 0.22, slide: -40 });
    this.noiseBurst({ dur: 0.12, gain: 0.18, freq: 900 });
  }

  levelWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.32, gain: 0.2, delay: i * 0.11 })
    );
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, type: 'sawtooth', dur: 0.3, gain: 0.16, delay: i * 0.13 })
    );
  }

  stairStep(i) {
    this.tone({ freq: 440 * Math.pow(2, Math.min(i, 18) / 12), type: 'square', dur: 0.12, gain: 0.16 });
  }

  whoosh() {
    this.noiseBurst({ dur: 0.35, gain: 0.14, freq: 1400, type: 'bandpass', q: 0.8 });
  }

  click() {
    this.tone({ freq: 660, type: 'square', dur: 0.06, gain: 0.12 });
  }
}

export const audio = new Audio();
