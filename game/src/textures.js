// textures.js — every texture in EMBERLINE is drawn on a canvas at load time.
// No image, font or audio file is ever fetched: the game is fully self-contained.
import * as THREE from 'three';

const cache = new Map();

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function noiseSpeckle(ctx, w, h, n, alpha, dark) {
  for (let i = 0; i < n; i++) {
    const g = Math.random();
    ctx.fillStyle = dark ? `rgba(0,0,0,${alpha * g})` : `rgba(255,255,255,${alpha * g})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function panelLines(ctx, w, h, step, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

export function groundTexture() {
  if (cache.has('ground')) return cache.get('ground');
  const tex = makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8a6b45'; ctx.fillRect(0, 0, w, h);
    // dry cracked earth patches
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * 46;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      const tone = Math.random() > 0.5 ? '122,94,58' : '158,124,80';
      g.addColorStop(0, `rgba(${tone},0.55)`); g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // cracks
    ctx.strokeStyle = 'rgba(60,40,22,0.5)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    noiseSpeckle(ctx, w, h, 2600, 0.16, true);
    noiseSpeckle(ctx, w, h, 1200, 0.1, false);
  });
  tex.repeat.set(10, 8);
  cache.set('ground', tex);
  return tex;
}

export function wallTexture() {
  if (cache.has('wall')) return cache.get('wall');
  const tex = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6f6250'; ctx.fillRect(0, 0, w, h);
    panelLines(ctx, w, h, 64, 'rgba(0,0,0,0.28)');
    // weather streaks
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      ctx.fillStyle = `rgba(40,28,16,${0.05 + Math.random() * 0.12})`;
      ctx.fillRect(x, Math.random() * h * 0.4, 2 + Math.random() * 4, 40 + Math.random() * 120);
    }
    // hazard stripe near the bottom edge
    ctx.fillStyle = '#c98a1e';
    for (let x = -20; x < w + 20; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 28, h - 18); ctx.lineTo(x + 12, h - 18); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, h - 18, w, 4);
    noiseSpeckle(ctx, w, h, 1400, 0.14, true);
  });
  cache.set('wall', tex);
  return tex;
}

export function crateTexture() {
  if (cache.has('crate')) return cache.get('crate');
  const tex = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a5c33'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(30,18,6,0.6)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    panelLines(ctx, w, h, 42, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = 'rgba(240,200,120,0.85)';
    ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center';
    ctx.fillText('EL-07', w / 2, h / 2 + 12);
    noiseSpeckle(ctx, w, h, 900, 0.15, true);
  });
  cache.set('crate', tex);
  return tex;
}

export function metalTexture() {
  if (cache.has('metal')) return cache.get('metal');
  const tex = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4c545c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2);
    }
    panelLines(ctx, w, h, 128, 'rgba(0,0,0,0.35)');
    // rivets
    ctx.fillStyle = 'rgba(20,22,26,0.8)';
    for (const [x, y] of [[16, 16], [240, 16], [16, 240], [240, 240], [128, 128]]) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    }
    noiseSpeckle(ctx, w, h, 1000, 0.12, true);
  });
  cache.set('metal', tex);
  return tex;
}

export function siteTexture(letter, color) {
  const key = 'site' + letter;
  if (cache.has(key)) return cache.get(key);
  const tex = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 96, 0, 7); ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 120px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + 6);
  });
  cache.set(key, tex);
  return tex;
}

// A soft round sprite used for smoke puffs and muzzle glow.
export function puffTexture() {
  if (cache.has('puff')) return cache.get('puff');
  const tex = makeCanvas(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  cache.set('puff', tex);
  return tex;
}
