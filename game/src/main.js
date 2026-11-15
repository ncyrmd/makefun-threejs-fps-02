// main.js — BLACKTIDE bootstrap, fixed-step simulation loop, player
// controller, round flow, view-model weapon, tracers, muzzle flash and the
// death camera. Simulation runs at a fixed 60 Hz step, decoupled from
// rendering; the HUD only reads state after each step.
//
// Night harbour lighting: a cold moon for the key light and long shadows,
// warm amber floodlights over the yard, and a dim blue hemisphere so the
// shadows never go black. The floodlights are spotlights without shadows;
// only the moon casts, so the frame stays cheap.
import * as THREE from 'three';
import { buildScene, moveCircle, hasLineOfSight, SITE_A, SITE_B, SPAWNS } from './map.js';
import {
  createState, createCombatant, resetForRound, economyForRoundEnd, swapSides,
  PHASE, WIN_ROUNDS, MAX_ROUNDS, HALFTIME_ROUND, BUY_SECONDS, ROUND_SECONDS,
  BOMB_SECONDS, PLANT_SECONDS, DEFUSE_SECONDS, TAG_FACTOR, aliveOf,
} from './state.js';
import { WEAPONS, ECONOMY, freshLoadout, giveWeapon } from './weapons.js';
import { SoundBank } from './audio.js';
import { updateBot, makeBotMesh, equipBot, syncBotMesh } from './bots.js';
import {
  eyePos, eyeHeight, canFire, currentSpread, startReload, finishReload,
  fireHitscan, throwGrenade, resolveFlash, siteAt, playerChannelTarget,
  applyDamage, burnFires, registerNoise,
} from './combat.js';
import { puffTexture, sparkTexture } from './textures.js';
import * as hud from './hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') || params.get('shot') || null;

const state = createState();
const sound = new SoundBank();
const raycaster = new THREE.Raycaster();
raycaster.far = 100;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft costs too much in software rasterizers
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1220);
scene.fog = new THREE.Fog(0x0a1220, 42, 115);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 240);
camera.rotation.order = 'YXZ';

// Moon: cold key light, low from the north-east, casts the shadows.
const moon = new THREE.DirectionalLight(0x9db8e8, 2.5);
moon.position.set(30, 34, -26);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -48; moon.shadow.camera.right = 48;
moon.shadow.camera.top = 48; moon.shadow.camera.bottom = -48;
moon.shadow.camera.far = 140;
scene.add(moon);
scene.add(new THREE.HemisphereLight(0x3d5578, 0x1c1610, 1.45));

// Floodlights: warm amber pools over the yard. Poles are built below.
function floodlight(x, z, tx, tz) {
  const spot = new THREE.SpotLight(0xffb36b, 420, 55, 0.62, 0.55, 1.4);
  spot.position.set(x, 8.5, z);
  spot.target.position.set(tx, 0, tz);
  scene.add(spot);
  scene.add(spot.target);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 8.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6, metalness: 0.5 }),
  );
  pole.position.set(x, 4.25, z);
  pole.castShadow = true;
  scene.add(pole);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xff9a2a, emissiveIntensity: 2.2 }),
  );
  lamp.position.set(x, 8.6, z);
  scene.add(lamp);
  return spot;
}
floodlight(-24, -20, -8, -8);
floodlight(24, -20, 8, -8);
floodlight(-24, 20, -8, 8);
floodlight(24, 20, 8, 8);

// The moon itself: a soft glowing sprite low in the sky, always facing
// the camera so it reads round from every angle.
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: puffTexture(), color: 0xdfeaf8, transparent: true, opacity: 0.95, fog: false,
}));
moonSprite.scale.set(16, 16, 1);
moonSprite.position.set(52, 44, -70);
scene.add(moonSprite);

buildScene(scene);

// Muzzle flash light (reused, no per-frame allocation).
const muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
scene.add(muzzleLight);

// Fire lights: a small pool, one per burning zone.
const fireLights = [];
for (let i = 0; i < 3; i++) {
  const pl = new THREE.PointLight(0xff7722, 0, 12, 1.6);
  scene.add(pl);
  fireLights.push(pl);
}

// Bomb prop: small blinking charge, visible when planted or dropped.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.3, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.7 }),
);
const bombLed = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff2222 }),
);
bombLed.position.set(0.18, 0.18, 0);
bombMesh.add(bombBody, bombLed);
bombMesh.visible = false;
scene.add(bombMesh);

// Tracers: a pool of line objects, reused.
const tracerPool = [];
for (let i = 0; i < 24; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }));
  line.visible = false; line.frustumCulled = false;
  scene.add(line);
  tracerPool.push({ line, ttl: 0 });
}
let tracerI = 0;
function spawnTracer(from, to, color) {
  const t = tracerPool[tracerI++ % tracerPool.length];
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.visible = true;
  t.ttl = 0.07;
}

// Smoke puffs + fire sprites: one sprite pool, two looks.
const smokeSprites = [];
const puffTex = puffTexture();
for (let i = 0; i < 48; i++) {
  const mat = new THREE.SpriteMaterial({ map: puffTex, color: 0xcfc8bd, transparent: true, opacity: 0, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.visible = false; sp.scale.set(6, 6, 1);
  scene.add(sp);
  smokeSprites.push(sp);
}
let smokeI = 0;
function spawnPuff(x, y, z, scale = 6, opacity = 0.75, fade = 0.02) {
  const sp = smokeSprites[smokeI++ % smokeSprites.length];
  sp.position.set(x + (Math.random() - 0.5) * 3, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 3);
  sp.material.opacity = opacity;
  sp.material.color.setHex(0xcfc8bd);
  sp.scale.set(scale, scale, 1);
  sp.userData.fade = fade;
  sp.visible = true;
}
// Hot impact sparks: small, fast-fading, amber.
const sparkSprites = [];
const sparkTex = sparkTexture();
for (let i = 0; i < 24; i++) {
  const mat = new THREE.SpriteMaterial({ map: sparkTex, color: 0xffb347, transparent: true, opacity: 0, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.visible = false; sp.scale.set(0.7, 0.7, 1);
  scene.add(sp);
  sparkSprites.push(sp);
}
let sparkI = 0;
function spawnSpark(x, y, z) {
  const sp = sparkSprites[sparkI++ % sparkSprites.length];
  sp.position.set(x, y, z);
  sp.material.opacity = 1;
  sp.scale.set(0.7, 0.7, 1);
  sp.userData.fade = 3.5;
  sp.visible = true;
}
// Fire flames: orange sprites that flicker over a burning zone.
const fireSprites = [];
for (let i = 0; i < 24; i++) {
  const mat = new THREE.SpriteMaterial({ map: puffTex, color: 0xff7722, transparent: true, opacity: 0, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.visible = false; sp.scale.set(2.2, 3.2, 1);
  scene.add(sp);
  fireSprites.push(sp);
}
let fireI = 0;
function spawnFlame(x, y, z) {
  const sp = fireSprites[fireI++ % fireSprites.length];
  sp.position.set(x + (Math.random() - 0.5) * 4, y + 0.6 + Math.random() * 1.2, z + (Math.random() - 0.5) * 4);
  sp.material.opacity = 0.85;
  sp.userData.fade = 1.4;
  sp.visible = true;
}

// ---------- weapon view-model ----------
const viewModel = new THREE.Group();
camera.add(viewModel);
scene.add(camera);
const vmMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x6a727e, roughness: 0.4, metalness: 0.7, emissive: 0x2a2f36, emissiveIntensity: 0.7 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x2fd8c8, roughness: 0.45, metalness: 0.6, emissive: 0x0a3a3a, emissiveIntensity: 0.6 }),
};
let vmBarrel = null;
function buildViewModel(kind) {
  while (viewModel.children.length) viewModel.remove(viewModel.children[0]);
  const g = new THREE.Group();
  const len = kind === 'dmr' ? 0.95 : kind === 'shotgun' ? 0.8 : kind === 'lmg' ? 0.92 : kind === 'smg' ? 0.55 : kind === 'rifle' ? 0.78 : 0.42;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, len), vmMats.body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), vmMats.body);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -len / 2 - 0.12);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), vmMats.grip);
  grip.position.set(0, -0.13, 0.08);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, kind === 'lmg' ? 0.26 : 0.18, 0.09), vmMats.accent);
  mag.position.set(0, kind === 'lmg' ? -0.18 : -0.14, -0.08);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), vmMats.accent);
  sight.position.set(0, 0.09, -0.1);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, len * 0.85),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.8 }));
  rail.position.set(0, 0.075, -0.02);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.8 }));
  post.position.set(0, 0.1, -len / 2 - 0.05);
  g.add(body, barrel, grip, mag, sight, rail, post);
  if (kind === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10), vmMats.body);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.11, -0.05);
    g.add(scope);
  }
  if (kind === 'lmg') {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), vmMats.grip);
    belt.position.set(0, -0.1, 0.18);
    g.add(belt);
  }
  g.position.set(0.36, -0.32, -0.5);
  g.rotation.y = -0.5; // angle the receiver so its side reads from the camera
  viewModel.add(g);
  vmBarrel = barrel;
  return g;
}
buildViewModel('pistol');

// ---------- combatants ----------
const SALVAGE_NAMES = ['REEF', 'TIDE', 'DOCK', 'PIER'];
const SALVAGE_ROLES = ['entry', 'awp', 'lurk', 'support'];
const HARBOUR_NAMES = ['CRANE', 'BUOY', 'GULL', 'ANCHOR', 'KEEL'];
const HARBOUR_ROLES = ['anchor', 'rotator', 'anchor', 'rotator', 'awp'];
function spawnCombatants() {
  state.player = createCombatant('player', 'YOU', 'salvage', -32, 0, false);
  state.player.botIndex = 0;
  state.bots = [];
  SPAWNS.salvage.forEach(([x, z], i) => {
    if (i === 4) return; // the fifth spawn is the player's
    const b = createCombatant('bot-s' + i, SALVAGE_NAMES[i], 'salvage', x, z, true, SALVAGE_ROLES[i]);
    b.botIndex = i;
    state.bots.push(b);
  });
  SPAWNS.harbour.forEach(([x, z], i) => {
    const b = createCombatant('bot-h' + i, HARBOUR_NAMES[i], 'harbour', x, z, true, HARBOUR_ROLES[i]);
    b.botIndex = i;
    state.bots.push(b);
  });
  for (const b of state.bots) makeBotMesh(scene, b);
  for (const b of state.bots) equipBot(b, 1);
}
spawnCombatants();

function placeAtSpawns() {
  const atk = [state.player, ...state.bots.filter((b) => b.team === state.attackTeam)];
  const def = state.bots.filter((b) => b.team !== state.attackTeam);
  const atkSpawns = state.attackTeam === 'salvage' ? SPAWNS.salvage : SPAWNS.harbour;
  const defSpawns = state.attackTeam === 'salvage' ? SPAWNS.harbour : SPAWNS.salvage;
  atk.forEach((c, i) => {
    const s = atkSpawns[i % atkSpawns.length];
    c.x = s[0]; c.z = s[1]; c.y = 0; c.vy = 0;
    c.yaw = atkSpawns === SPAWNS.salvage ? -Math.PI / 2 : Math.PI / 2;
  });
  def.forEach((c, i) => {
    const s = defSpawns[i % defSpawns.length];
    c.x = s[0]; c.z = s[1]; c.y = 0; c.vy = 0;
    c.yaw = defSpawns === SPAWNS.salvage ? -Math.PI / 2 : Math.PI / 2;
  });
}

// ---------- input ----------
const keys = {};
let mouseDX = 0, mouseDY = 0;
let firing = false, aiming = false;
let pointerLocked = false;
let channel = null; // {kind, site, t, need}
let channelKeyHeld = false;

addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { state.muted = !state.muted; sound.setMuted(state.muted); return; }
  keys[e.code] = true;
  if (e.code === 'KeyR') tryReload();
  if (e.code === 'KeyB') toggleBuy();
  if (e.code === 'Digit1') switchWeaponSlot(1);
  if (e.code === 'Digit2') switchWeaponSlot(2);
  if (e.code === 'Digit3') switchWeaponSlot(3);
  if (e.code === 'Digit4') tryThrow('flash');
  if (e.code === 'Digit5') tryThrow('smoke');
  if (e.code === 'Digit6') tryThrow('fire');
  if (e.code === 'KeyE') channelKeyHeld = true;
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyE') channelKeyHeld = false;
});
addEventListener('mousedown', (e) => {
  if (state.phase === PHASE.LIVE && (pointerLocked || state.demo)) {
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) { firing = false; state.player.sprayN = 0; }
  if (e.button === 2) aiming = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  mouseDX += e.movementX; mouseDY += e.movementY;
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && state.phase === PHASE.LIVE && !state.demo) showPause();
});
addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function lockPointer() {
  if (state.demo) return;
  renderer.domElement.requestPointerLock();
}
function tryReload() {
  const p = state.player;
  if (!p || !p.alive || state.phase !== PHASE.LIVE) return;
  if (startReload(p)) sound.reload();
}
function switchWeaponSlot(slot) {
  const p = state.player;
  if (!p || !p.alive) return;
  const ids = Object.keys(p.loadout.weapons);
  const match = ids.find((id) => WEAPONS[id].slot === slot);
  if (match && match !== p.loadout.current) {
    p.loadout.current = match;
    p.reloadT = 0;
    p.sprayN = 0;
    buildViewModel(WEAPONS[match].kind);
    sound.click();
  }
}
function tryThrow(kind) {
  const p = state.player;
  if (!p || !p.alive || state.phase !== PHASE.LIVE) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const res = throwGrenade(state, p, kind, dir);
  if (!res) { sound.denied(); return; }
  if (kind === 'flash') {
    sound.flashPop();
    resolveFlash(state, res);
    spawnPuff(res.x, res.y, res.z);
  } else if (kind === 'fire') {
    sound.fireWhoosh();
    for (let i = 0; i < 5; i++) spawnFlame(res.x, 0.2, res.z);
  } else {
    sound.smokePop();
    for (let i = 0; i < 6; i++) spawnPuff(res.x, res.y + 0.4, res.z);
  }
}

// ---------- UI wiring ----------
const $ = (id) => document.getElementById(id);
$('play-btn').addEventListener('click', () => {
  sound.ensure();
  $('menu').hidden = true;
  $('hud').hidden = false;
  startMatch();
  lockPointer();
});
$('how-btn').addEventListener('click', () => {
  const el = $('how-extra');
  el.hidden = !el.hidden;
});
$('buy-close').addEventListener('click', () => { closeBuy(); lockPointer(); });
$('resume-btn').addEventListener('click', () => { $('pause').hidden = true; state.paused = false; lockPointer(); });
$('restart-btn').addEventListener('click', () => { $('pause').hidden = true; state.paused = false; startMatch(); lockPointer(); });
$('again-btn').addEventListener('click', () => { $('end').hidden = true; startMatch(); lockPointer(); });
function toggleBuy() {
  if (state.phase !== PHASE.BUY) return;
  if ($('buy').hidden) openBuy(); else closeBuy();
}
function openBuy() {
  hud.renderBuy(state, onBuyClick);
  $('buy').hidden = false;
}
function onBuyClick(item) {
  if (hud.applyBuy(state, item)) {
    sound.buy();
    buildViewModel(WEAPONS[state.player.loadout.current].kind);
  } else sound.denied();
  hud.renderBuy(state, onBuyClick);
}
function closeBuy() { $('buy').hidden = true; }

// ---------- round flow ----------
function startMatch() {
  state.score = { salvage: 0, harbour: 0 };
  state.round = 1;
  state.half = 1;
  state.attackTeam = 'salvage';
  state.lossStreak = { salvage: 0, harbour: 0 };
  state.roundHistory = [];
  state.stats = { kills: 0, deaths: 0, damage: 0, shots: 0, hits: 0, headshots: 0, plants: 0, defuses: 0, wallbangs: 0 };
  for (const c of [state.player, ...state.bots]) {
    c.kills = 0; c.deaths = 0; c.damageDealt = 0;
    c.loadout = freshLoadout();
    c.team = c.id === 'player' || c.id.startsWith('bot-s') ? 'salvage' : 'harbour';
  }
  sound.craneHorn();
  startRound();
}

function startRound() {
  // Halftime: before round 5 the crews swap roles.
  if (state.round === HALFTIME_ROUND && state.half === 1) {
    swapSides(state);
    hud.showBanner('HALFTIME — SIDES SWAP', 'You defended the harbour in the first half. Now hold it.', 'info');
  }
  resetForRound(state);
  placeAtSpawns();
  for (const b of state.bots) equipBot(b, state.round);
  // The charge rides with the attacking crew. In the first half that is the
  // player; in the second it is the first attacker bot.
  if (state.player.team === state.attackTeam) {
    state.bomb.carrierId = 'player';
  } else {
    const ab = state.bots.find((b) => b.team === state.attackTeam);
    state.bomb.carrierId = ab ? ab.id : 'player';
  }
  state.phase = PHASE.BUY;
  state.phaseT = BUY_SECONDS;
  hud.clearBanner();
  if (state.round !== HALFTIME_ROUND || state.half !== 2) {
    hud.showBanner('ROUND ' + state.round, state.round === 1 ? 'Buy up — press B for the shop' : '', 'info');
    setTimeout(() => { if (state.phase === PHASE.BUY) hud.clearBanner(); }, 2500);
  }
  openBuy();
  buildViewModel(WEAPONS[state.player.loadout.current].kind);
  bombMesh.visible = false;
}

function defendTeam() {
  return state.attackTeam === 'salvage' ? 'harbour' : 'salvage';
}

function endRound(winner, reason) {
  if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
  state.roundWinner = winner;
  state.roundReason = reason;
  economyForRoundEnd(state, winner);
  state.phase = PHASE.ROUND_END;
  state.phaseT = 5;
  const won = winner === state.player.team;
  const wName = winner === 'salvage' ? 'SALVAGERS' : 'HARBOUR WATCH';
  hud.showBanner(wName + ' WIN THE ROUND', reason, won ? 'win' : 'lose');
  if (won) sound.roundWin(); else sound.roundLose();
  if (state.score.salvage >= WIN_ROUNDS || state.score.harbour >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
    endMatch(state.score.salvage > state.score.harbour ? 'salvage' : 'harbour');
  }
}

function endMatch(winner) {
  state.winner = winner;
  state.phase = PHASE.MATCH_END;
  state.phaseT = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.renderMatchEnd(state);
  $('end').hidden = false;
  $('buy').hidden = true;
}

function checkRoundEnd() {
  if (state.phase !== PHASE.LIVE) return;
  const aAlive = aliveOf(state, state.attackTeam);
  const dAlive = aliveOf(state, defendTeam());
  if (state.bomb.state === 'planted') {
    if (dAlive === 0) endRound(state.attackTeam, 'Charge planted — no defenders left to defuse it.');
    return;
  }
  if (aAlive === 0) { endRound(defendTeam(), 'All attackers eliminated.'); return; }
  if (dAlive === 0) {
    if (state.bomb.state === 'carried' || state.bomb.state === 'dropped') {
      endRound(state.attackTeam, 'All defenders eliminated.');
    }
    return;
  }
  if (state.phaseT <= 0) {
    if (state.bomb.state === 'planted') return; // bomb timer governs
    endRound(defendTeam(), 'Time expired — the charge was never planted.');
  }
}

// ---------- events from combat ----------
function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'tracer') {
      spawnTracer(ev.from, ev.to, ev.color);
      if (ev.from.distanceTo(camera.position) < 2) {
        muzzleLight.position.copy(ev.from);
        muzzleLight.intensity = 14;
      }
    } else if (ev.type === 'wall') {
      spawnSpark(ev.at.x, ev.at.y, ev.at.z);
    } else if (ev.type === 'hit') {
      if (ev.attacker === state.player) {
        state.stats.hits++;
        if (ev.isHead) state.stats.headshots++;
        if (ev.wallbang) state.stats.wallbangs++;
        hud.hitmarker(false, ev.wallbang);
        sound.hit(ev.isHead);
        const v = ev.victim;
        hud.damageNumber(worldToScreen, v.x, v.y + 1.5, v.z, ev.hpDmg, ev.isHead);
      }
      if (ev.victim === state.player) {
        hud.flashDamage();
        sound.hurt();
        const a = ev.attacker;
        if (a) {
          const ang = Math.atan2(a.x - state.player.x, a.z - state.player.z);
          const rel = (ang - (-state.player.yaw)) * 180 / Math.PI;
          hud.setHitDir(rel);
        }
      }
    } else if (ev.type === 'kill') {
      const wname = ev.attacker ? WEAPONS[ev.attacker.loadout.current].name : '—';
      hud.addFeed(state, ev.attacker || ev.victim, ev.victim, wname, ev.isHead);
      if (ev.attacker === state.player) { hud.hitmarker(true, ev.wallbang); sound.kill(); }
      if (ev.victim === state.player) {
        state.spectateId = pickSpectate();
        hud.showBanner('YOU ARE DOWN', 'Spectating a teammate — next round starts soon', 'lose');
      }
    } else if (ev.type === 'planted') {
      hud.showBanner('CHARGE PLANTED — SITE ' + ev.site, 'Defend it for 35 seconds', 'info');
      sound.plantBeep();
      if (ev.by === state.player) state.stats.plants++;
    } else if (ev.type === 'defused') {
      endRound(defendTeam(), 'The charge was defused.');
      if (ev.by === state.player) state.stats.defuses++;
    } else if (ev.type === 'bombDropped') {
      hud.showHint('Charge dropped — pick it up (walk over it)');
    } else if (ev.type === 'bombPickup') {
      if (ev.by === state.player) hud.showHint('You have the charge — plant at A or B');
    } else if (ev.type === 'grenade') {
      if (ev.kind === 'smoke') {
        for (let i = 0; i < 6; i++) spawnPuff(ev.x, 1, ev.z);
      } else if (ev.kind === 'fire') {
        for (let i = 0; i < 5; i++) spawnFlame(ev.x, 0.2, ev.z);
      } else {
        spawnPuff(ev.x, ev.y, ev.z);
      }
    } else if (ev.type === 'callout') {
      hud.showCallout(ev.text);
    }
  }
}

function pickSpectate() {
  const mates = state.bots.filter((b) => b.team === state.player.team && b.alive);
  return mates.length ? mates[0].id : null;
}

function worldToScreen(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  if (v.z > 1) return null;
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------- player simulation ----------
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
let bobPhase = 0;
let beepT = 0;

function updatePlayer(dt) {
  const p = state.player;
  if (!p.alive) return;
  // Look
  const sens = aiming && WEAPONS[p.loadout.current].zoom ? 0.0011 : 0.0021;
  p.yaw -= mouseDX * sens;
  p.pitch -= mouseDY * sens;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  mouseDX = 0; mouseDY = 0;
  // Recoil recovery
  p.recoilPitch = Math.max(0, p.recoilPitch - dt * 0.25);
  p.spreadBloom = Math.max(0, p.spreadBloom - dt * 0.09);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) finishReload(p);
  }
  if (p.blindT > 0) p.blindT -= dt;
  if (p.tagT > 0) p.tagT -= dt;
  // Movement with acceleration. Tagging slows you after a hit.
  const walk = keys['ShiftLeft'] || keys['ShiftRight'];
  const crouch = keys['ControlLeft'] || keys['KeyC'];
  p.crouched = !!crouch;
  let speed = walk ? 2.6 : 4.9;
  if (crouch) speed = 2.2;
  if (!p.onGround) speed *= 0.85;
  if (aiming) speed *= 0.55;
  if (p.tagT > 0) speed *= TAG_FACTOR;
  let ix = 0, iz = 0;
  if (keys['KeyW']) iz -= 1;
  if (keys['KeyS']) iz += 1;
  if (keys['KeyA']) ix -= 1;
  if (keys['KeyD']) ix += 1;
  const il = Math.hypot(ix, iz) || 1;
  ix /= il; iz /= il;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  const wx = (ix * cos - iz * sin) * speed;
  const wz = (ix * sin + iz * cos) * speed;
  const accel = p.onGround ? 14 : 5;
  p.vx = (p.vx ?? 0) + (wx - (p.vx ?? 0)) * Math.min(1, accel * dt);
  p.vz = (p.vz ?? 0) + (wz - (p.vz ?? 0)) * Math.min(1, accel * dt);
  const [nx, nz] = moveCircle(p.x, p.z, p.vx * dt, p.vz * dt, 0.4, eyeHeight(p));
  p.x = nx; p.z = nz;
  p.moving = Math.hypot(p.vx, p.vz) > 0.5;
  p.speed = Math.hypot(p.vx, p.vz);
  // Jump / gravity
  if (keys['Space'] && p.onGround) { p.vy = 5.2; p.onGround = false; }
  p.vy -= 14 * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  if (p.moving && p.onGround) bobPhase += dt * p.speed * 1.6;
  // Bomb pickup
  if (state.bomb.state === 'dropped') {
    const d = Math.hypot(p.x - state.bomb.x, p.z - state.bomb.z);
    if (d < 1.6) {
      state.bomb.state = 'carried'; state.bomb.carrierId = 'player';
      handleEvents([{ type: 'bombPickup', by: p }]);
    }
  }
  // Plant / defuse channel (hold E)
  const target = playerChannelTarget(state);
  if (target && target.kind !== 'pickup' && channelKeyHeld) {
    if (!channel || channel.kind !== target.kind) {
      channel = { kind: target.kind, site: target.site, t: 0, need: target.need };
    }
    channel.t += dt;
    const label = target.kind === 'plant'
      ? 'PLANTING CHARGE — SITE ' + target.site
      : 'DEFUSING CHARGE — SITE ' + target.site;
    hud.setPlantBar(true, label, channel.t / channel.need);
    if (Math.floor(channel.t * 4) !== Math.floor((channel.t - dt) * 4)) sound.plantBeep();
    if (channel.t >= channel.need) {
      if (target.kind === 'plant') {
        state.bomb.state = 'planted';
        state.bomb.site = target.site;
        state.bomb.x = p.x; state.bomb.z = p.z;
        state.bomb.timer = BOMB_SECONDS;
        state.stats.plants++;
        handleEvents([{ type: 'planted', by: p, site: target.site }]);
      } else {
        state.bomb.state = 'defused';
        state.stats.defuses++;
        handleEvents([{ type: 'defused', by: p }]);
      }
      channel = null;
      hud.setPlantBar(false);
    }
  } else {
    if (channel) { channel = null; hud.setPlantBar(false); }
  }
  // Firing
  const def = WEAPONS[p.loadout.current];
  if (firing && canFire(p, state.time)) {
    const ammo = p.loadout.weapons[p.loadout.current];
    if (ammo.mag <= 0) { sound.dryFire(); firing = false; tryReload(); }
    else {
      camera.getWorldDirection(_dir);
      const spread = currentSpread(p);
      _dir.x += (Math.random() - 0.5) * spread * 2;
      _dir.y += (Math.random() - 0.5) * spread * 2;
      _dir.z += (Math.random() - 0.5) * spread * 2;
      _dir.normalize();
      const evs = fireHitscan(state, p, _dir, state.time, raycaster);
      registerNoise(state, p.x, p.z);
      state.stats.shots += def.pellets || 1;
      handleEvents(evs);
      sound.shot(def.sound, 0);
      p.pitch += def.recoil * 0.35;
      if (!def.auto) firing = false;
    }
  }
}

// ---------- fixed-step simulation ----------
function simulate(dt) {
  state.time += dt;
  if (state.phase === PHASE.BUY) {
    state.phaseT -= dt;
    $('buy-timer').textContent = Math.max(0, Math.ceil(state.phaseT));
    if (state.phaseT <= 0) {
      closeBuy();
      state.phase = PHASE.LIVE;
      state.phaseT = ROUND_SECONDS;
      hud.showBanner('GO GO GO', 'Plant the charge at A or B', 'info');
      setTimeout(() => { if (state.phase === PHASE.LIVE) hud.clearBanner(); }, 2200);
    }
    return;
  }
  if (state.phase === PHASE.ROUND_END) {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      if (state.phase === PHASE.MATCH_END) return;
      state.round++;
      startRound();
    }
    return;
  }
  if (state.phase !== PHASE.LIVE) return;
  state.phaseT -= dt;
  // Bomb timer
  if (state.bomb.state === 'planted') {
    state.bomb.timer -= dt;
    beepT -= dt;
    if (beepT <= 0) { sound.bombBeep(state.bomb.timer < 10); beepT = state.bomb.timer < 10 ? 0.5 : 1; }
    if (state.bomb.timer <= 0) {
      state.bomb.state = 'exploded';
      sound.explosion();
      const site = state.bomb.site === 'A' ? SITE_A : SITE_B;
      const all = [state.player, ...state.bots];
      for (const c of all) {
        if (!c.alive) continue;
        const d = Math.hypot(c.x - site.x, c.z - site.z);
        if (d < 16) {
          const evs = [];
          applyDamage(state, c, 200, 0, null, false, evs);
          handleEvents(evs);
        }
      }
      endRound(state.attackTeam, 'The charge detonated at Site ' + state.bomb.site + '.');
      return;
    }
  }
  // Smokes and fires decay; fires burn.
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    state.smokes[i].ttl -= dt;
    if (state.smokes[i].ttl <= 0) state.smokes.splice(i, 1);
  }
  for (let i = state.fires.length - 1; i >= 0; i--) {
    state.fires[i].ttl -= dt;
    if (state.fires[i].ttl <= 0) state.fires.splice(i, 1);
  }
  if (state.fires.length) {
    const evs = [];
    burnFires(state, dt, evs);
    handleEvents(evs);
  }
  // Old noise stops mattering.
  for (let i = state.noise.length - 1; i >= 0; i--) {
    if (state.time - state.noise[i].t > 6) state.noise.splice(i, 1);
  }
  updatePlayer(dt);
  const events = [];
  for (const b of state.bots) updateBot(state, b, dt, raycaster, events, sound);
  handleEvents(events);
  checkRoundEnd();
}

// ---------- render ----------
const _v = new THREE.Vector3();
function render(dtReal) {
  const p = state.player;
  let target = p;
  if (!p.alive && state.spectateId) {
    const mate = state.bots.find((b) => b.id === state.spectateId);
    if (mate && mate.alive) target = mate;
  }
  if (target) {
    const bobY = target.moving && target.onGround ? Math.sin(bobPhase) * 0.035 : 0;
    const bobX = target.moving && target.onGround ? Math.cos(bobPhase * 0.5) * 0.012 : 0;
    camera.position.set(target.x + bobX, target.y + eyeHeight(target) + bobY, target.z);
    camera.rotation.y = target.yaw;
    camera.rotation.x = target.pitch + (target === p ? p.recoilPitch * 0.4 : 0);
    camera.rotation.z = 0;
  }
  // ADS zoom
  const def = WEAPONS[p.loadout.current];
  const wantFov = aiming && def.zoom ? 74 * def.zoom : 74;
  camera.fov += (wantFov - camera.fov) * Math.min(1, dtReal * 10);
  camera.updateProjectionMatrix();
  // View-model sway / recoil
  viewModel.position.y = -0.02 + (p.moving ? Math.sin(bobPhase) * 0.006 : 0);
  viewModel.rotation.x = p.recoilPitch * 0.9;
  viewModel.position.z = aiming ? -0.62 : -0.55;
  // Muzzle light decay
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dtReal * 160);
  // Tracer decay
  for (const t of tracerPool) {
    if (t.ttl > 0) { t.ttl -= dtReal; if (t.ttl <= 0) t.line.visible = false; }
  }
  // Smoke sprites fade (impacts fade fast, smoke clouds linger).
  for (const sp of smokeSprites) {
    if (sp.visible) {
      sp.material.opacity -= dtReal * (sp.userData.fade || 0.02);
      sp.scale.multiplyScalar(1 + dtReal * (sp.userData.fade > 1 ? 0.4 : 0.08));
      if (sp.material.opacity <= 0.05) sp.visible = false;
    }
  }
  // Sparks fade fast.
  for (const sp of sparkSprites) {
    if (sp.visible) {
      sp.material.opacity -= dtReal * (sp.userData.fade || 3);
      if (sp.material.opacity <= 0.05) sp.visible = false;
    }
  }
  // Flames flicker over burning zones.
  for (const sp of fireSprites) {
    if (sp.visible) {
      sp.material.opacity -= dtReal * (sp.userData.fade || 1.4);
      sp.scale.y = 3.2 + Math.sin(state.time * 13 + sp.position.x) * 0.5;
      if (sp.material.opacity <= 0.05) sp.visible = false;
    }
  }
  // Fire lights follow the burning zones.
  for (let i = 0; i < fireLights.length; i++) {
    const f = state.fires[i];
    if (f) {
      fireLights[i].position.set(f.x, 1.2, f.z);
      fireLights[i].intensity = 22 + Math.sin(state.time * 11 + i * 2) * 6;
    } else {
      fireLights[i].intensity = 0;
    }
  }
  // Bomb prop + LED blink
  if (state.bomb.state === 'planted' || state.bomb.state === 'dropped') {
    bombMesh.visible = true;
    bombMesh.position.set(state.bomb.x, 0.16, state.bomb.z);
    bombLed.material.color.setHex(Math.sin(state.time * 8) > 0 ? 0xff2222 : 0x550000);
  } else bombMesh.visible = false;
  // Bot meshes
  for (const b of state.bots) syncBotMesh(b);
  // Flash blindness overlay
  const blind = p.blindT > 0 ? Math.min(1, p.blindT / 1.2) : 0;
  hud.setFlashWhite(blind);
  renderer.render(scene, camera);
}

// ---------- main loop ----------
// Fixed-step sim (1/60 s) decoupled from rendering. The frame delta is
// clamped to 0.25 s and the sim runs up to 15 catch-up steps per frame, so
// the match keeps real time down to ~4 FPS; beyond that the backlog is
// dropped (acc capped at 0.5 s) instead of spiralling. The FPS counter
// measures UNclamped frame time — clamping it would lie about the rate.
let last = performance.now();
let lastFps = last;
let acc = 0;
let hudT = 0;
let fpsFrames = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dtReal = Math.min(0.25, (now - last) / 1000);
  const dtFps = (now - lastFps) / 1000;
  last = now; lastFps = now;
  if (!state.paused && state.phase !== PHASE.MENU) {
    acc += dtReal;
    let steps = 0;
    while (acc >= STEP && steps < 15) {
      simulate(STEP);
      acc -= STEP;
      steps++;
    }
    if (acc > 0.5) acc = 0.5; // drop backlog beyond half a second
  }
  render(dtReal);
  fpsFrames++; fpsT += dtFps;
  if (fpsT >= 1) {
    $('fps').textContent = Math.round(fpsFrames / fpsT) + ' FPS';
    fpsFrames = 0; fpsT = 0;
  }
  // HUD at 10 Hz is plenty (minimap + numbers) and avoids a DOM write +
  // canvas redraw on every rendered frame.
  hudT += dtReal;
  if (hudT >= 0.1 && (state.phase === PHASE.LIVE || state.phase === PHASE.BUY || state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END)) {
    hud.updateHud(state);
    hudT = 0;
  }
}
requestAnimationFrame(loop);

// ---------- pause ----------
function showPause() {
  if (state.demo) return;
  state.paused = true;
  $('pause').hidden = false;
}

// ---------- demo / screenshot mode ----------
function setupDemo() {
  if (!DEMO) return;
  state.demo = true;
  sound.ensure();
  $('menu').hidden = true;
  $('hud').hidden = false;
  startMatch();
  // Skip the buy phase for play shots; keep it for the buy shot.
  if (DEMO === 'play' || DEMO === 'end') {
    closeBuy();
    state.phase = PHASE.LIVE;
    state.phaseT = 87;
    // Stage a firefight down the north lane: the player looks east along
    // z=-19 with defenders spread in the open ahead of them.
    const p = state.player;
    p.x = -16; p.z = -19; p.yaw = -Math.PI / 2 + 0.05; p.pitch = 0.01;
    giveWeapon(p.loadout, 'rifle');
    buildViewModel('rifle');
    p.loadout.armor = 50; p.loadout.helmet = true; p.loadout.money = 3250;
    const d = state.bots.filter((b) => b.team !== state.attackTeam);
    d[0].x = 0; d[0].z = -21; d[1].x = 6; d[1].z = -18; d[2].x = 12; d[2].z = -20;
    d[3].x = 18; d[3].z = -17; d[4].x = 4; d[4].z = -14;
    const a = state.bots.filter((b) => b.team === state.attackTeam);
    a[0].x = -17; a[0].z = -22; a[1].x = -13; a[1].z = -15;
    state.score = { salvage: 2, harbour: 1 };
    state.round = 4;
    hud.clearBanner();
  }
  if (DEMO === 'buy') {
    state.phase = PHASE.BUY;
    state.phaseT = 12;
    state.player.loadout.money = 4800;
    hud.renderBuy(state, onBuyClick);
  }
  if (DEMO === 'end') {
    state.score = { salvage: 5, harbour: 2 };
    state.winner = 'salvage';
    state.stats = { kills: 14, deaths: 6, damage: 1840, shots: 210, hits: 96, headshots: 11, plants: 2, defuses: 0, wallbangs: 3 };
    for (const c of [state.player, ...state.bots]) { c.kills = 3 + Math.floor(Math.random() * 8); c.deaths = 2 + Math.floor(Math.random() * 6); c.damageDealt = 400 + Math.floor(Math.random() * 1200); }
    state.player.kills = 14; state.player.deaths = 6; state.player.damageDealt = 1840;
    endMatch('salvage');
  }
  if (DEMO === 'menu') {
    // Menu shot is the start screen; keep the 3D scene visible behind it.
    $('menu').hidden = false;
    $('buy').hidden = true;
    $('hud').hidden = true;
    hud.clearBanner();
    state.phase = PHASE.MENU;
  }
}
setupDemo();

// Expose a tiny debug handle for automated testing (no network, no cheating).
window.__blacktide = { state, version: '2.0.0', viewModel, camera, renderer, scene };
