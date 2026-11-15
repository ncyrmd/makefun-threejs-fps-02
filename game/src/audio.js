// audio.js — synthesized WebAudio sounds for RIPTIDE. No audio files
// ship with the game; every shot, beep and sting is built from
// oscillators and filtered noise at runtime. The harbour adds two of its
// own: the low crane horn that opens a round, and the whoosh of an
// incendiary going up.
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

  // One oscillator blip: a tone that slides from `freq` to `slideTo`
  // over `dur` seconds at volume `vol`.
  _tone(freq, dur, type, vol, slideTo) {
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

  // One burst of filtered noise.
  _hiss(dur, filterFreq, vol, type = 'lowpass') {
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

  // A short two-note phrase, the second note delayed by `gap` ms.
  _phrase(notes, gap = 130) {
    notes.forEach(([freq, dur, vol], i) => {
      setTimeout(() => this._tone(freq, dur, 'sine', vol, freq), i * gap);
    });
  }

  // Shot by weapon family. `dist` attenuates distant fire. Each family
  // is a noise burst (the crack) plus a tone (the body of the shot).
  shot(kind, dist = 0) {
    if (!this.ctx || this.muted) return;
    const att = Math.max(0.15, 1 - dist / 60);
    const SHOTS = {
      pistol: [0.09, 1800, 0.5, 220, 0.07, 'square', 0.25, 90],
      smg: [0.07, 2400, 0.42, 320, 0.05, 'square', 0.2, 140],
      rifle: [0.12, 1400, 0.6, 160, 0.1, 'sawtooth', 0.3, 70],
      lmg: [0.13, 1100, 0.55, 130, 0.11, 'sawtooth', 0.28, 60],
      shotgun: [0.22, 900, 0.8, 110, 0.16, 'sawtooth', 0.4, 45],
      dmr: [0.2, 2600, 0.7, 520, 0.14, 'square', 0.3, 120],
    };
    const s = SHOTS[kind] || [0.1, 1500, 0.5, 200, 0.08, 'square', 0.25, 90];
    this._hiss(s[0], s[1], s[2] * att);
    this._tone(s[3], s[4], s[5], s[6] * att, s[7]);
  }

  reload() {
    this._tone(700, 0.06, 'square', 0.15, 500);
    this._tone(500, 0.06, 'square', 0.15, 900);
  }
  dryFire() { this._tone(900, 0.04, 'square', 0.2, 700); }
  hit(isHead) { this._tone(isHead ? 1400 : 1000, 0.05, 'sine', 0.3, isHead ? 1800 : 700); }
  kill() {
    this._tone(660, 0.09, 'sine', 0.35, 990);
    this._tone(990, 0.12, 'sine', 0.3, 1320);
  }
  hurt() { this._tone(180, 0.15, 'sawtooth', 0.25, 90); }
  buy() {
    this._tone(880, 0.07, 'sine', 0.25, 880);
    this._tone(1320, 0.09, 'sine', 0.25, 1320);
  }
  click() { this._tone(1200, 0.03, 'square', 0.12, 1200); }
  denied() { this._tone(220, 0.12, 'square', 0.2, 160); }
  roundWin() { this._phrase([[523, 0.14, 0.3], [659, 0.14, 0.3], [784, 0.22, 0.32]], 130); }
  roundLose() { this._phrase([[392, 0.16, 0.3], [311, 0.24, 0.3]], 160); }
  plantBeep() { this._tone(1050, 0.08, 'square', 0.25, 1050); }
  bombBeep(urgent) {
    this._tone(urgent ? 1500 : 1150, 0.07, 'square', 0.28, urgent ? 1500 : 1150);
  }
  explosion() {
    this._hiss(0.9, 300, 0.9);
    this._tone(60, 0.8, 'sine', 0.6, 30);
  }
  flashPop() {
    this._hiss(0.15, 4000, 0.6, 'highpass');
    this._tone(2000, 0.1, 'sine', 0.2, 300);
  }
  smokePop() { this._hiss(0.4, 700, 0.35); }
  fireWhoosh() {
    this._hiss(0.7, 500, 0.5);
    this._tone(90, 0.5, 'sawtooth', 0.25, 50);
  }
  // The crane horn that opens the round: two low tones across the water.
  craneHorn() {
    this._tone(98, 1.1, 'sawtooth', 0.22, 92);
    this._tone(147, 1.1, 'sawtooth', 0.16, 139);
  }
}
