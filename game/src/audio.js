// audio.js — synthesized WebAudio sounds for BLACKTIDE. No audio files
// ship with the game; every shot, beep and sting is built from oscillators
// and filtered noise at runtime. The harbour adds two of its own: the low
// crane horn that opens a round, and the whoosh of an incendiary going up.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  _noiseBuffer(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _burst(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur);
  }

  _noise(dur, filterFreq, vol, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  // Shot by weapon family. `dist` attenuates distant fire.
  shot(kind, dist = 0) {
    if (!this.ctx || this.muted) return;
    const att = Math.max(0.15, 1 - dist / 60);
    switch (kind) {
      case 'pistol':
        this._noise(0.09, 1800, 0.5 * att);
        this._burst(220, 0.07, 'square', 0.25 * att, 90);
        break;
      case 'smg':
        this._noise(0.07, 2400, 0.42 * att);
        this._burst(320, 0.05, 'square', 0.2 * att, 140);
        break;
      case 'rifle':
        this._noise(0.12, 1400, 0.6 * att);
        this._burst(160, 0.1, 'sawtooth', 0.3 * att, 70);
        break;
      case 'lmg':
        this._noise(0.13, 1100, 0.55 * att);
        this._burst(130, 0.11, 'sawtooth', 0.28 * att, 60);
        break;
      case 'shotgun':
        this._noise(0.22, 900, 0.8 * att);
        this._burst(110, 0.16, 'sawtooth', 0.4 * att, 45);
        break;
      case 'dmr':
        this._noise(0.2, 2600, 0.7 * att);
        this._burst(520, 0.14, 'square', 0.3 * att, 120);
        break;
      default:
        this._noise(0.1, 1500, 0.5 * att);
    }
  }

  reload() { this._burst(700, 0.06, 'square', 0.15, 500); this._burst(500, 0.06, 'square', 0.15, 900); }
  dryFire() { this._burst(900, 0.04, 'square', 0.2, 700); }
  hit(isHead) { this._burst(isHead ? 1400 : 1000, 0.05, 'sine', 0.3, isHead ? 1800 : 700); }
  kill() { this._burst(660, 0.09, 'sine', 0.35, 990); this._burst(990, 0.12, 'sine', 0.3, 1320); }
  hurt() { this._burst(180, 0.15, 'sawtooth', 0.25, 90); }
  buy() { this._burst(880, 0.07, 'sine', 0.25, 880); this._burst(1320, 0.09, 'sine', 0.25, 1320); }
  click() { this._burst(1200, 0.03, 'square', 0.12, 1200); }
  denied() { this._burst(220, 0.12, 'square', 0.2, 160); }
  roundWin() {
    this._burst(523, 0.14, 'sine', 0.3, 523);
    setTimeout(() => this._burst(659, 0.14, 'sine', 0.3, 659), 130);
    setTimeout(() => this._burst(784, 0.22, 'sine', 0.32, 784), 260);
  }
  roundLose() {
    this._burst(392, 0.16, 'sine', 0.3, 392);
    setTimeout(() => this._burst(311, 0.24, 'sine', 0.3, 311), 160);
  }
  plantBeep() { this._burst(1050, 0.08, 'square', 0.25, 1050); }
  bombBeep(urgent) {
    this._burst(urgent ? 1500 : 1150, 0.07, 'square', 0.28, urgent ? 1500 : 1150);
  }
  explosion() {
    this._noise(0.9, 300, 0.9);
    this._burst(60, 0.8, 'sine', 0.6, 30);
  }
  flashPop() { this._noise(0.15, 4000, 0.6, 'highpass'); this._burst(2000, 0.1, 'sine', 0.2, 300); }
  smokePop() { this._noise(0.4, 700, 0.35); }
  fireWhoosh() { this._noise(0.7, 500, 0.5); this._burst(90, 0.5, 'sawtooth', 0.25, 50); }
  // The crane horn that opens the round: two low tones across the water.
  craneHorn() {
    this._burst(98, 1.1, 'sawtooth', 0.22, 92);
    this._burst(147, 1.1, 'sawtooth', 0.16, 139);
  }
}
