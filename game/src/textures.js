// textures.js — procedural canvas textures for BLACKTIDE's night harbor.
// Every texture is drawn at load time; no image files ship with the game.
// The palette is night: wet asphalt, rusted corrugated steel, painted
// containers in dock colours, hazard striping, and glowing site decals.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deterministic speckle so a texture looks the same on every load.
function speckle(ctx, w, h, n, colors, sizeMax) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const s = 1 + Math.random() * sizeMax;
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.globalAlpha = 0.08 + Math.random() * 0.22;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

// Wet asphalt yard: dark blue-grey with oil stains, cracks and painted
// lane markings worn down by container traffic.
export function groundTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#2e323d'; ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 2600, ['#3a3f4c', '#23262f', '#484e5c', '#1c1f27'], 3);
  // Oil stains.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 12 + Math.random() * 42;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(8,10,14,0.55)'); g.addColorStop(1, 'rgba(8,10,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // Cracks.
  ctx.strokeStyle = 'rgba(10,11,14,0.7)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 22; i++) {
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 44; y += (Math.random() - 0.5) * 44; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // Faded yellow lane lines.
  ctx.fillStyle = 'rgba(214,178,60,0.35)';
  ctx.fillRect(0, 250, 512, 5);
  ctx.fillRect(250, 0, 5, 512);
  return toTexture(c, 8);
}

// Corrugated warehouse steel: vertical ribs, rust streaks, rivets.
export function wallTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#55555e'; ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#44444c'); g.addColorStop(0.5, '#686872'); g.addColorStop(1, '#3c3c44');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 16, 256);
  }
  // Rust streaks running down from the top edge.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, len = 20 + Math.random() * 90;
    const g = ctx.createLinearGradient(x, 0, x, len);
    g.addColorStop(0, 'rgba(122,72,32,0.5)'); g.addColorStop(1, 'rgba(122,72,32,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 3 + Math.random() * 4, len);
  }
  // Rivets along the ribs.
  ctx.fillStyle = 'rgba(20,20,24,0.8)';
  for (let x = 8; x < 256; x += 16) for (let y = 12; y < 256; y += 42) ctx.fillRect(x - 1, y, 3, 3);
  speckle(ctx, 256, 256, 500, ['#2c2c32', '#66666e'], 2);
  return toTexture(c, 2);
}

// Shipping container side: deep ribs and a stencilled code. `base` is the
// paint colour; each stack gets its own tint so the yard reads in colour
// even at night.
export function containerTexture(base) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 32, 256);
  }
  // Wear along the bottom edge and rust at the corners.
  const g = ctx.createLinearGradient(0, 200, 0, 256);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,12,6,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 200, 256, 56);
  speckle(ctx, 256, 256, 700, ['rgba(0,0,0,0.4)', 'rgba(255,255,255,0.08)'], 2);
  // Stencilled container code.
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('BTDU 481 902-7', 18, 52);
  ctx.font = 'bold 15px monospace';
  ctx.fillText('MAX GROSS 30 480 KG', 18, 78);
  return toTexture(c, 1);
}

// Wooden crate: planks, nails, stencil.
export function crateTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#6e5636'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    ctx.fillStyle = y % 84 === 0 ? '#7a6240' : '#655231';
    ctx.fillRect(0, y, 256, 42);
    ctx.fillStyle = 'rgba(20,12,6,0.6)';
    ctx.fillRect(0, y, 256, 2);
  }
  // Diagonal brace.
  ctx.strokeStyle = 'rgba(30,20,10,0.5)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(256, 0); ctx.stroke();
  ctx.fillStyle = 'rgba(235,225,200,0.8)';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('BLACKTIDE', 52, 130);
  speckle(ctx, 256, 256, 500, ['#4a3a22', '#8a7048'], 2);
  return toTexture(c, 1);
}

// Brushed dark metal for containers' roofs, the crane and the forklifts.
export function metalTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#3c4148'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(0, i, 256, 1);
  }
  speckle(ctx, 256, 256, 600, ['#2a2e34', '#565d66'], 2);
  return toTexture(c, 2);
}

// Hazard striping for the crane legs and the dock edge.
export function hazardTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#c8a020'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#151312';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 128); ctx.lineTo(i + 16, 128); ctx.lineTo(i + 16 + 128, 0); ctx.lineTo(i + 128, 0);
    ctx.closePath(); ctx.fill();
  }
  return toTexture(c, 1);
}

// Site decal: a big letter on the ground, drawn once and reused.
export function siteTexture(letter, color) {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = color; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Neon sign texture for the warehouse wall: the harbour's name in cyan.
export function neonTexture(text, color) {
  const [c, ctx] = canvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 22;
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 12;
  ctx.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft radial puff for smoke clouds, dust and muzzle smoke.
let _puff = null;
export function puffTexture() {
  if (_puff) return _puff;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _puff = new THREE.CanvasTexture(c);
  return _puff;
}

// Hot spark dot for bullet impacts.
let _spark = null;
export function sparkTexture() {
  if (_spark) return _spark;
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.4, 'rgba(255,160,60,0.8)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _spark = new THREE.CanvasTexture(c);
  return _spark;
}

// Water at the dock's edge: dark, almost black, with a faint moon glitter.
export function waterTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256, x = Math.random() * 256, w = 20 + Math.random() * 70;
    ctx.strokeStyle = `rgba(120,160,210,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  }
  return toTexture(c, 6);
}
