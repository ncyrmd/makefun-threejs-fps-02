// audio.js — every sound is synthesized with WebAudio. No audio files exist.
// A tiny synth: filtered noise bursts for gunfire, sine thumps for explosions,
// short blips for UI, hit ticks and the bomb beeper.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.42;
  }

  _noise(dur, filterFreq, type, gain, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, type, gain, slideTo = null, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // distance 0..1 attenuates volume and low-passes the crack.
  shot(kind, distance = 0) {
    if (!this.ctx) return;
    const vol = Math.max(0.08, 1 - distance * 0.85);
    const presets = {
      pistol: [0.09, 2400, 0.5, 160],
      smg: [0.07, 3000, 0.34, 190],
      rifle: [0.12, 1800, 0.62, 120],
      shotgun: [0.22, 900, 0.85, 70],
      dmr: [0.28, 1400, 0.9, 90],
    };
    const [dur, freq, gain, thump] = presets[kind] || presets.rifle;
    this._noise(dur, freq, 'lowpass', gain * vol);
    this._tone(thump, dur * 0.9, 'sine', gain * 0.8 * vol, thump * 0.5);
  }

  dryFire() { this._tone(1400, 0.04, 'square', 0.08); }
  reload() {
    this._tone(900, 0.05, 'square', 0.1);
    this._tone(600, 0.05, 'square', 0.1, null, 0.18);
    this._tone(1200, 0.06, 'square', 0.12, null, 0.55);
  }
  hit(head = false) { this._tone(head ? 2400 : 1800, 0.06, 'square', 0.16); }
  kill() { this._tone(520, 0.09, 'square', 0.18); this._tone(780, 0.12, 'square', 0.14, null, 0.07); }
  hurt() { this._tone(220, 0.12, 'sawtooth', 0.2, 110); }
  click() { this._tone(1000, 0.04, 'square', 0.1); }
  buy() { this._tone(660, 0.07, 'sine', 0.2); this._tone(990, 0.1, 'sine', 0.2, null, 0.07); }
  denied() { this._tone(220, 0.12, 'square', 0.16); }
  plantBeep() { this._tone(1150, 0.07, 'square', 0.16); }
  bombBeep(fast) { this._tone(fast ? 1500 : 1000, 0.08, 'square', 0.2); }
  defuseTick() { this._tone(800, 0.05, 'square', 0.1); }
  explosion() {
    this._noise(1.4, 300, 'lowpass', 1.0);
    this._tone(60, 1.2, 'sine', 0.9, 28);
    this._noise(0.5, 4000, 'highpass', 0.35);
  }
  roundWin() {
    [523, 659, 784].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.22, null, i * 0.11));
  }
  roundLose() {
    [392, 330, 262].forEach((f, i) => this._tone(f, 0.26, 'triangle', 0.2, null, i * 0.13));
  }
  flashPop() { this._noise(0.3, 5000, 'highpass', 0.5); this._tone(3000, 0.25, 'sine', 0.15, 1800); }
  smokePop() { this._noise(0.5, 800, 'lowpass', 0.4); }
  step() { this._noise(0.05, 500, 'lowpass', 0.05); }
}
