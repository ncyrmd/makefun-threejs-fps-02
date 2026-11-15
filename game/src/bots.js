// bots.js — bot brains for both teams. Bots navigate the waypoint graph, take
// cover, hold angles, react to what they see and hear, plant the charge and
// defuse it. They are deliberately fair: reaction delays, aim error that grows
// with distance and target speed, and burst fire with pauses.
import * as THREE from 'three';
import { WEAPONS, giveWeapon } from './weapons.js';
import {
  WAYPOINTS, nearestWaypoint, findPath, hasLineOfSight, moveCircle, SITE_A, SITE_B,
} from './map.js';
import { eyePos, eyeHeight, canFire, startReload, finishReload, fireHitscan, siteAt, updateChannel, bombSitePos } from './combat.js';

const _eye = new THREE.Vector3();
const _tEye = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Bot loadouts: a mix so fights feel varied.
const BOT_GUNS = ['rifle', 'rifle', 'smg', 'smg', 'shotgun', 'dmr'];
export function equipBot(bot, round) {
  const gun = BOT_GUNS[(bot.botIndex + round) % BOT_GUNS.length];
  giveWeapon(bot.loadout, gun);
  if (Math.random() < 0.5) { bot.loadout.armor = 50; }
  if (Math.random() < 0.4) { bot.loadout.helmet = true; }
  if (Math.random() < 0.3) { bot.loadout.flash = 1; }
  if (Math.random() < 0.25) { bot.loadout.smoke = 1; }
}

export function makeBotMesh(scene, bot) {
  const g = new THREE.Group();
  const color = bot.team === 'attack' ? 0x3f8cff : 0xff6a3d;
  const dark = bot.team === 'attack' ? 0x1d2f4d : 0x4d241d;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), bodyMat);
  body.position.y = 0.95; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.58; head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  helmet.position.y = 1.6;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.32), darkMat);
  legs.position.y = 0.28;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.85), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.28, 1.15, 0.3);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.05),
    new THREE.MeshStandardMaterial({ color: bot.team === 'attack' ? 0x9fd8ff : 0xffb37a, emissive: bot.team === 'attack' ? 0x2266aa : 0xaa3311, emissiveIntensity: 0.9 }));
  visor.position.set(0, 1.58, 0.2);
  g.add(body, head, helmet, legs, gun, visor);
  body.userData = { combatant: bot, part: 'body' };
  head.userData = { combatant: bot, part: 'head' };
  helmet.userData = { combatant: bot, part: 'head' };
  bot.mesh = g; bot.bodyMesh = body; bot.headMesh = head;
  scene.add(g);
  return g;
}

function nearestEnemy(state, bot) {
  const all = [state.player, ...state.bots];
  let best = null, bd = Infinity;
  for (const c of all) {
    if (!c.alive || c.team === bot.team) continue;
    const d = Math.hypot(c.x - bot.x, c.z - bot.z);
    if (d < bd) { bd = d; best = c; }
  }
  return { enemy: best, dist: bd };
}

function visibleEnemy(state, bot) {
  const { enemy, dist } = nearestEnemy(state, bot);
  if (!enemy || dist > 55) return null;
  if (bot.blindT > 0) return null;
  eyePos(bot, _eye);
  eyePos(enemy, _tEye);
  if (!hasLineOfSight(_eye, _tEye, state.smokes)) return null;
  return { enemy, dist };
}

function setPathTo(bot, tx, tz) {
  const from = nearestWaypoint(bot.x, bot.z);
  const to = nearestWaypoint(tx, tz);
  bot.brain.path = findPath(from, to);
  bot.brain.pathI = 0;
}

function followPath(bot, dt, speed) {
  const brain = bot.brain;
  if (!brain.path.length || brain.pathI >= brain.path.length) return true;
  const node = WAYPOINTS[brain.path[brain.pathI]];
  const dx = node[0] - bot.x, dz = node[1] - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { brain.pathI++; return brain.pathI >= brain.path.length; }
  const vx = dx / d, vz = dz / d;
  const [nx, nz] = moveCircle(bot.x, bot.z, vx * speed * dt, vz * speed * dt, 0.4, 1.62);
  bot.x = nx; bot.z = nz;
  bot.yaw = Math.atan2(-vx, -vz);
  bot.moving = true; bot.speed = speed;
  return false;
}

// Bot shooting: reaction delay, then bursts with aim error scaled by distance,
// target motion and the shooter's own motion. Never an aimbot.
function botShoot(state, bot, target, dist, dt, raycaster, events) {
  const brain = bot.brain;
  if (brain.reactT > 0) { brain.reactT -= dt; return; }
  if (brain.burstLeft <= 0) {
    if (brain.burstT > 0) { brain.burstT -= dt; return; }
    brain.burstLeft = 2 + Math.floor(Math.random() * 3);
    brain.burstT = 0.55 + Math.random() * 0.5;
  }
  if (!canFire(bot, state.time)) return;
  // Aim at the target's chest with error.
  const def = WEAPONS[bot.loadout.current];
  const errScale = 0.012 + dist * 0.0011 + (target.moving ? 0.014 : 0) + (bot.moving ? 0.02 : 0);
  const aimErr = errScale * (bot.blindT > 0 ? 4 : 1);
  eyePos(bot, _eye);
  const tx = target.x + (Math.random() - 0.5) * 2 * aimErr * dist;
  const ty = target.y + eyeHeight(target) * (0.75 + (Math.random() - 0.5) * 0.4) + (Math.random() - 0.5) * 2 * aimErr * dist;
  const tz = target.z + (Math.random() - 0.5) * 2 * aimErr * dist;
  _dir.set(tx - _eye.x, ty - _eye.y, tz - _eye.z).normalize();
  const before = target.hp;
  const evs = fireHitscan(state, bot, _dir, state.time, raycaster);
  events.push(...evs);
  brain.burstLeft--;
  // If the shot actually hit, the target "hears" it and may react.
  if (target.hp < before) {
    brain.lastSeenX = target.x; brain.lastSeenZ = target.z; brain.lastSeenT = state.time;
  }
}

function botReload(bot) {
  if (bot.reloadT > 0) { return; }
  const ammo = bot.loadout.weapons[bot.loadout.current];
  const def = WEAPONS[bot.loadout.current];
  if (ammo && ammo.mag < def.mag * 0.4 && ammo.reserve > 0) startReload(bot);
}

// One fixed-step tick for one bot.
export function updateBot(state, bot, dt, raycaster, events, sound) {
  if (!bot.alive) {
    if (bot.mesh) bot.mesh.visible = false;
    return;
  }
  const brain = bot.brain;
  brain.thinkT -= dt;
  if (bot.blindT > 0) bot.blindT -= dt;
  if (bot.reloadT > 0) {
    bot.reloadT -= dt;
    if (bot.reloadT <= 0) finishReload(bot);
  }
  bot.spreadBloom = Math.max(0, bot.spreadBloom - dt * 0.09);
  bot.recoilPitch = Math.max(0, bot.recoilPitch - dt * 0.12);
  bot.moving = false;

  // --- bomb duties ---
  if (state.bomb.state === 'planted' && bot.team === 'defend') {
    // Defenders converge on the planted site and defuse when close.
    const site = bombSitePos(state.bomb.site);
    const d = Math.hypot(bot.x - site.x, bot.z - site.z);
    if (d < 2.2) {
      if (!brain.channelKind) { brain.channelKind = 'defuse'; brain.channelT = 0; }
      const done = updateChannel(state, bot, dt, events);
      if (done === 'defused') return;
      return; // stand still while defusing
    }
    if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(bot, site.x, site.z);
    followPath(bot, dt, 4.6);
    return;
  }
  if (state.bomb.state === 'dropped' && bot.team === 'attack') {
    const d = Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z);
    if (d < 1.4) {
      state.bomb.state = 'carried'; state.bomb.carrierId = bot.id;
      events.push({ type: 'bombPickup', by: bot });
    } else if (bot.brain.state !== 'engage') {
      if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(bot, state.bomb.x, state.bomb.z);
      followPath(bot, dt, 4.6);
      return;
    }
  }

  // --- combat: see an enemy? ---
  const seen = visibleEnemy(state, bot);
  if (seen) {
    brain.enemyId = seen.enemy.id;
    brain.lastSeenX = seen.enemy.x; brain.lastSeenZ = seen.enemy.z; brain.lastSeenT = state.time;
    if (brain.state !== 'engage') { brain.state = 'engage'; brain.reactT = 0.35 + Math.random() * 0.45; }
  } else if (brain.state === 'engage' && state.time - brain.lastSeenT > 2.5) {
    brain.state = 'push'; brain.enemyId = null;
  }

  if (brain.state === 'engage' && brain.enemyId) {
    const all = [state.player, ...state.bots];
    const target = all.find((c) => c.id === brain.enemyId);
    if (!target || !target.alive) { brain.state = 'push'; brain.enemyId = null; }
    else {
      const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
      // Face the target; strafe sideways to be a harder target.
      brain.strafeT -= dt;
      if (brain.strafeT <= 0) { brain.strafeDir = Math.random() < 0.5 ? -1 : 1; brain.strafeT = 0.7 + Math.random() * 0.8; }
      const fx = target.x - bot.x, fz = target.z - bot.z;
      const fl = Math.hypot(fx, fz) || 1;
      bot.yaw = Math.atan2(-fx / fl, -fz / fl);
      const sx = -fz / fl * brain.strafeDir, sz = fx / fl * brain.strafeDir;
      const [nx, nz] = moveCircle(bot.x, bot.z, sx * 1.4 * dt, sz * 1.4 * dt, 0.4, 1.62);
      bot.x = nx; bot.z = nz; bot.moving = true; bot.speed = 1.4;
      // Crouch sometimes when holding a long angle.
      bot.crouched = dist > 22 && Math.random() < 0.01;
      botShoot(state, bot, target, dist, dt, raycaster, events);
      botReload(bot);
      return;
    }
  }

  // --- objective movement ---
  if (bot.team === 'attack') {
    // The carrier (or a bot near the carrier) pushes its site; others spread out.
    const isCarrier = state.bomb.carrierId === bot.id && state.bomb.state === 'carried';
    const site = brain.targetSite === 'A' ? SITE_A : SITE_B;
    const dSite = Math.hypot(bot.x - site.x, bot.z - site.z);
    if (isCarrier && dSite < SITE_A.r) {
      // Plant!
      if (!brain.channelKind) { brain.channelKind = 'plant'; brain.channelT = 0; }
      const done = updateChannel(state, bot, dt, events);
      if (done === 'planted') { brain.state = 'hold'; }
      return;
    }
    if (brain.state === 'hold') {
      // After planting, hold a defensive angle near the site.
      brain.holdT -= dt;
      if (brain.holdT <= 0) {
        const hx = site.x + (Math.random() - 0.5) * 10;
        const hz = site.z + (Math.random() - 0.5) * 10;
        setPathTo(bot, hx, hz);
        brain.holdT = 4 + Math.random() * 4;
      }
      if (followPath(bot, dt, 3.2)) { /* arrived, wait */ }
      return;
    }
    if (!brain.path.length || brain.pathI >= brain.path.length) {
      // New leg: push toward the site, sometimes via mid for variety.
      const viaMid = Math.random() < 0.35;
      const tx = viaMid ? (site.x + bot.x) / 2 : site.x + (Math.random() - 0.5) * 6;
      const tz = viaMid ? 0 : site.z + (Math.random() - 0.5) * 6;
      setPathTo(bot, tx, tz);
    }
    followPath(bot, dt, isCarrier ? 4.4 : 4.8);
  } else {
    // Defenders: hold near their assigned site or mid, rotating on noise.
    const site = brain.targetSite === 'A' ? SITE_A : SITE_B;
    const dSite = Math.hypot(bot.x - site.x, bot.z - site.z);
    if (dSite > 9) {
      if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(bot, site.x, site.z);
      followPath(bot, dt, 4.6);
    } else {
      // Hold: small repositioning, face the likely approach.
      brain.holdT -= dt;
      if (brain.holdT <= 0) {
        const hx = site.x + (Math.random() - 0.5) * 12;
        const hz = site.z + (Math.random() - 0.5) * 12;
        setPathTo(bot, hx, hz);
        brain.holdT = 5 + Math.random() * 5;
      }
      if (brain.path.length && brain.pathI < brain.path.length) followPath(bot, dt, 2.6);
      else {
        // Look toward mid / the west approach.
        const want = Math.atan2(1, 0.3);
        bot.yaw += (want - bot.yaw) * dt * 0.5;
      }
    }
  }
  botReload(bot);
}

// Sync a bot's three.js mesh to its simulated position.
export function syncBotMesh(bot) {
  if (!bot.mesh) return;
  bot.mesh.visible = bot.alive;
  if (!bot.alive) return;
  bot.mesh.position.set(bot.x, bot.y, bot.z);
  bot.mesh.rotation.y = bot.yaw + Math.PI;
  // Walk bob.
  const bob = bot.moving ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.03 : 0;
  bot.mesh.position.y = bot.y + bob;
  // Crouch: squash the group.
  bot.mesh.scale.y = bot.crouched ? 0.78 : 1;
}
