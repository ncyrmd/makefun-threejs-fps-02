// bots.js — bot brains for both crews. Bots navigate the waypoint graph,
// hold angles, react to what they see and hear, plant the charge and defuse
// it. They are deliberately fair: reaction delays, aim error that grows with
// distance and target speed, and burst fire with pauses.
//
// What makes this squad more than nine lone wolves:
//  * Roles. Each bot has a job: entry (first through the door, flashes),
//    awp (DMR, holds the long lane), lurk (rotates to the far site and
//    flanks), support (carries the smoke for the execute), anchor and
//    rotator (defenders who hold a site or chase gunfire).
//  * Coordinated executes. When the round is ripe, the entry bot calls an
//    execute on the squad's site: support smokes the entrance, entry flashes
//    over it, and the whole squad pushes together instead of trickling in.
//  * An economy. Bots buy what their money allows: rifles and armor after a
//    win, a save round after a loss streak, a defuse kit for defenders.
//  * Ears. Gunfire is noise; defenders who hear it rotate toward the sound
//    instead of standing on an empty site.
//  * Fire sense. No bot walks into a burning incendiary zone on purpose.
import * as THREE from 'three';
import { WEAPONS, giveWeapon } from './weapons.js';
import {
  WAYPOINTS, nearestWaypoint, findPath, hasLineOfSight, moveCircle, SITE_A, SITE_B,
} from './map.js';
import {
  eyePos, eyeHeight, canFire, startReload, finishReload, fireHitscan,
  siteAt, updateChannel, bombSitePos, throwGrenade, resolveFlash,
} from './combat.js';

const _eye = new THREE.Vector3();
const _tEye = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Where the support bot drops its execute smoke for each site: the main
// entrance the defenders watch.
const EXECUTE_SMOKE = { A: { x: 18, z: -15 }, B: { x: 19, z: 13 } };
// Where the entry bot lobs its execute flash: just inside the site.
const EXECUTE_FLASH = { A: { x: 22, z: -16 }, B: { x: 22, z: 16 } };

// Role -> preferred guns, in order. The economy picks the first it affords.
const ROLE_GUNS = {
  entry: ['rifle', 'smg', 'shotgun'],
  awp: ['dmr', 'rifle'],
  lurk: ['smg', 'rifle'],
  support: ['rifle', 'smg'],
  anchor: ['rifle', 'lmg', 'shotgun'],
  rotator: ['smg', 'rifle'],
};

// Buy what the bot can afford, by role. A win round means rifles and armor;
// a broke bot saves with the pistol and waits for the team bonus.
export function equipBot(bot, round) {
  const money = bot.loadout.money;
  const prefs = ROLE_GUNS[bot.role] || ROLE_GUNS.entry;
  for (const gun of prefs) {
    if (money >= WEAPONS[gun].price) {
      giveWeapon(bot.loadout, gun);
      bot.loadout.money -= WEAPONS[gun].price;
      break;
    }
  }
  if (bot.loadout.armor < 50 && bot.loadout.money >= 650 && Math.random() < 0.7) {
    bot.loadout.armor = 50;
    bot.loadout.money -= 650;
  }
  if (!bot.loadout.helmet && bot.loadout.money >= 350 && Math.random() < 0.4) {
    bot.loadout.helmet = true;
    bot.loadout.money -= 350;
  }
  // Defenders buy the kit; attackers buy utility for the execute.
  if (bot.role === 'anchor' || bot.role === 'rotator') {
    if (bot.loadout.money >= 400 && Math.random() < 0.45) {
      bot.loadout.defuseKit = true;
      bot.loadout.money -= 400;
    }
  }
  if (bot.role === 'support' && bot.loadout.money >= 300) {
    bot.loadout.smoke = 1;
    bot.loadout.money -= 300;
  }
  if ((bot.role === 'entry' || bot.role === 'lurk') && bot.loadout.money >= 200) {
    bot.loadout.flash = 1;
    bot.loadout.money -= 200;
  }
}

export function makeBotMesh(scene, bot) {
  const g = new THREE.Group();
  const color = bot.team === 'salvage' ? 0x2fd8c8 : 0xff7a3d;
  const dark = bot.team === 'salvage' ? 0x123a3a : 0x4d241d;
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
  const gunLen = bot.role === 'awp' ? 1.1 : bot.role === 'anchor' ? 0.95 : 0.85;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, gunLen), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.28, 1.15, 0.3);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.05),
    new THREE.MeshStandardMaterial({ color: bot.team === 'salvage' ? 0x9fd8ff : 0xffb37a, emissive: bot.team === 'salvage' ? 0x2288aa : 0xaa3311, emissiveIntensity: 0.9 }));
  visor.position.set(0, 1.58, 0.2);
  g.add(body, head, helmet, legs, gun, visor);
  // Support carries a visible pack; the AWP carries a scope glint.
  if (bot.role === 'support') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), darkMat);
    pack.position.set(0, 1.0, -0.26);
    g.add(pack);
  }
  if (bot.role === 'awp') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0.28, 1.28, 0.15);
    g.add(scope);
  }
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

function inFire(state, x, z) {
  for (const f of state.fires) {
    if (Math.hypot(x - f.x, z - f.z) < f.r + 0.5) return f;
  }
  return null;
}

function setPathTo(state, bot, tx, tz) {
  // Never path into a burning zone: nudge the target out of it.
  const f = inFire(state, tx, tz);
  if (f) {
    const dx = tx - f.x, dz = tz - f.z;
    const d = Math.hypot(dx, dz) || 1;
    tx = f.x + (dx / d) * (f.r + 2);
    tz = f.z + (dz / d) * (f.r + 2);
  }
  const from = nearestWaypoint(bot.x, bot.z);
  const to = nearestWaypoint(tx, tz);
  bot.brain.path = findPath(from, to);
  bot.brain.pathI = 0;
}

function followPath(state, bot, dt, speed) {
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

// Bot shooting: reaction delay, then bursts with aim error scaled by
// distance, target motion and the shooter's own motion. Never an aimbot.
// The spray pattern applies through fireHitscan, so a bot that holds the
// trigger walks its shots up the wall like a player does.
function botShoot(state, bot, target, dist, dt, raycaster, events) {
  const brain = bot.brain;
  if (brain.reactT > 0) { brain.reactT -= dt; return; }
  if (brain.burstLeft <= 0) {
    if (brain.burstT > 0) { brain.burstT -= dt; return; }
    brain.burstLeft = 2 + Math.floor(Math.random() * 3);
    brain.burstT = 0.55 + Math.random() * 0.5;
  }
  if (!canFire(bot, state.time)) return;
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
  if (target.hp < before) {
    brain.lastSeenX = target.x; brain.lastSeenZ = target.z; brain.lastSeenT = state.time;
  }
}

function botReload(bot) {
  if (bot.reloadT > 0) return;
  const ammo = bot.loadout.weapons[bot.loadout.current];
  const def = WEAPONS[bot.loadout.current];
  if (ammo && ammo.mag < def.mag * 0.4 && ammo.reserve > 0) startReload(bot);
}

// Throw a grenade at a fixed point: aim the throw direction at it.
function botThrowAt(state, bot, kind, tx, tz, events) {
  eyePos(bot, _eye);
  const dx = tx - bot.x, dz = tz - bot.z;
  const d = Math.hypot(dx, dz) || 1;
  _dir.set(dx / d, 0.25, dz / d).normalize();
  const res = throwGrenade(state, bot, kind, _dir);
  if (!res) return false;
  if (kind === 'flash') resolveFlash(state, res);
  events.push({ type: 'grenade', kind, by: bot, x: res.x, z: res.z });
  return true;
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
  if (bot.tagT > 0) bot.tagT -= dt;
  if (bot.reloadT > 0) {
    bot.reloadT -= dt;
    if (bot.reloadT <= 0) finishReload(bot);
  }
  bot.spreadBloom = Math.max(0, bot.spreadBloom - dt * 0.09);
  bot.recoilPitch = Math.max(0, bot.recoilPitch - dt * 0.12);
  if (brain.state !== 'engage') bot.sprayN = 0;
  bot.moving = false;

  // Step out of fire before anything else.
  const fire = inFire(state, bot.x, bot.z);
  if (fire) {
    const dx = bot.x - fire.x, dz = bot.z - fire.z;
    const d = Math.hypot(dx, dz) || 1;
    const [nx, nz] = moveCircle(bot.x, bot.z, (dx / d) * 4.5 * dt, (dz / d) * 4.5 * dt, 0.4, 1.62);
    bot.x = nx; bot.z = nz;
    bot.yaw = Math.atan2(-dx / d, -dz / d);
    bot.moving = true; bot.speed = 4.5;
    return;
  }

  const attacking = bot.team === state.attackTeam;

  // --- bomb duties ---
  if (state.bomb.state === 'planted' && !attacking) {
    // Defenders converge on the planted site and defuse when close.
    const site = bombSitePos(state.bomb.site);
    const d = Math.hypot(bot.x - site.x, bot.z - site.z);
    if (d < 2.2) {
      if (!brain.channelKind) { brain.channelKind = 'defuse'; brain.channelT = 0; }
      const done = updateChannel(state, bot, dt, events);
      if (done === 'defused') return;
      return; // stand still while defusing
    }
    if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(state, bot, site.x, site.z);
    followPath(state, bot, dt, 4.6);
    return;
  }
  if (state.bomb.state === 'dropped' && attacking) {
    const d = Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z);
    if (d < 1.4) {
      state.bomb.state = 'carried'; state.bomb.carrierId = bot.id;
      events.push({ type: 'bombPickup', by: bot });
    } else if (brain.state !== 'engage') {
      if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(state, bot, state.bomb.x, state.bomb.z);
      followPath(state, bot, dt, 4.6);
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
      brain.strafeT -= dt;
      if (brain.strafeT <= 0) { brain.strafeDir = Math.random() < 0.5 ? -1 : 1; brain.strafeT = 0.7 + Math.random() * 0.8; }
      const fx = target.x - bot.x, fz = target.z - bot.z;
      const fl = Math.hypot(fx, fz) || 1;
      bot.yaw = Math.atan2(-fx / fl, -fz / fl);
      const sx = -fz / fl * brain.strafeDir, sz = fx / fl * brain.strafeDir;
      const [nx, nz] = moveCircle(bot.x, bot.z, sx * 1.4 * dt, sz * 1.4 * dt, 0.4, 1.62);
      bot.x = nx; bot.z = nz; bot.moving = true; bot.speed = 1.4;
      bot.crouched = dist > 22 && Math.random() < 0.01;
      botShoot(state, bot, target, dist, dt, raycaster, events);
      botReload(bot);
      return;
    }
  }

  // --- squad execute (attackers) ---
  if (attacking && state.phase === 'live') {
    const squad = state.squad;
    const aliveAttack = [state.player, ...state.bots].filter((c) => c.team === state.attackTeam && c.alive).length;
    // The shot-caller is the lowest-index alive attacker bot: it calls the
    // execute, whatever its role, so both halves get coordinated pushes.
    const aliveBots = state.bots.filter((c) => c.team === state.attackTeam && c.alive);
    const caller = aliveBots.length
      ? aliveBots.reduce((a, b) => (a.botIndex < b.botIndex ? a : b))
      : null;
    const isCaller = caller === bot;
    if (isCaller && squad.stage === 'spread' && !squad.called
      && aliveAttack >= 3 && state.phaseT < 72) {
      squad.stage = 'execute';
      squad.called = true;
      squad.executeT = state.time;
      events.push({ type: 'callout', text: 'EXECUTE SITE ' + squad.site + ' — smoke out, flash over!' });
    }
    if (squad.stage === 'execute') {
      const site = squad.site === 'A' ? SITE_A : SITE_B;
      // The first bot with a smoke drops it on the entrance; the first with
      // a flash lobs it over the smoke; then the whole squad pushes.
      if (!squad.smoked && bot.loadout.smoke > 0 && state.time - squad.executeT < 3) {
        const t = EXECUTE_SMOKE[squad.site];
        if (botThrowAt(state, bot, 'smoke', t.x, t.z, events)) { squad.smoked = true; sound.smokePop(); }
      }
      if (!squad.flashed && bot.loadout.flash > 0 && state.time - squad.executeT < 4) {
        const t = EXECUTE_FLASH[squad.site];
        if (botThrowAt(state, bot, 'flash', t.x, t.z, events)) { squad.flashed = true; sound.flashPop(); }
      }
      const dSite = Math.hypot(bot.x - site.x, bot.z - site.z);
      const isCarrier = state.bomb.carrierId === bot.id && state.bomb.state === 'carried';
      if (isCarrier && dSite < SITE_A.r) {
        if (!brain.channelKind) { brain.channelKind = 'plant'; brain.channelT = 0; }
        const done = updateChannel(state, bot, dt, events);
        if (done === 'planted') { brain.state = 'hold'; }
        return;
      }
      if (brain.state === 'hold') {
        brain.holdT -= dt;
        if (brain.holdT <= 0) {
          const hx = site.x + (Math.random() - 0.5) * 10;
          const hz = site.z + (Math.random() - 0.5) * 10;
          setPathTo(state, bot, hx, hz);
          brain.holdT = 4 + Math.random() * 4;
        }
        if (followPath(state, bot, dt, 3.2)) { /* arrived, wait */ }
        return;
      }
      if (!brain.path.length || brain.pathI >= brain.path.length) {
        setPathTo(state, bot, site.x + (Math.random() - 0.5) * 6, site.z + (Math.random() - 0.5) * 6);
      }
      followPath(state, bot, dt, isCarrier ? 4.4 : 4.9);
      botReload(bot);
      return;
    }
    // Before the execute: spread out, take map control. The lurk rotates
    // to the far site so the defence cannot stack one side.
    const site = brain.targetSite === 'A' ? SITE_A : SITE_B;
    if (bot.role === 'lurk') {
      const far = squad.site === 'A' ? SITE_B : SITE_A;
      if (!brain.path.length || brain.pathI >= brain.path.length) {
        setPathTo(state, bot, far.x + (Math.random() - 0.5) * 8, far.z + (Math.random() - 0.5) * 8);
      }
      followPath(state, bot, dt, 4.2);
      botReload(bot);
      return;
    }
    if (bot.role === 'awp') {
      // The AWP holds a long lane and waits for a pick.
      if (!brain.path.length || brain.pathI >= brain.path.length) {
        const hold = squad.site === 'A' ? { x: -2, z: -20 } : { x: -2, z: 20 };
        setPathTo(state, bot, hold.x, hold.z);
      }
      if (followPath(state, bot, dt, 3.6)) {
        bot.yaw += (Math.atan2(1, 0.2) - bot.yaw) * dt * 0.4;
      }
      botReload(bot);
      return;
    }
    if (!brain.path.length || brain.pathI >= brain.path.length) {
      const viaMid = Math.random() < 0.35;
      const tx = viaMid ? (site.x + bot.x) / 2 : site.x + (Math.random() - 0.5) * 6;
      const tz = viaMid ? 0 : site.z + (Math.random() - 0.5) * 6;
      setPathTo(state, bot, tx, tz);
    }
    followPath(state, bot, dt, 4.6);
    botReload(bot);
    return;
  }

  // --- defenders: hold, rotate on noise ---
  if (!attacking) {
    // Ears: a rotator who hears fresh gunfire goes to look.
    if (bot.role === 'rotator' && brain.state !== 'engage') {
      for (let i = state.noise.length - 1; i >= 0; i--) {
        const n = state.noise[i];
        if (state.time - n.t > 3) continue;
        const d = Math.hypot(n.x - bot.x, n.z - bot.z);
        if (d < 40 && d > 8) {
          brain.heardX = n.x; brain.heardZ = n.z; brain.heardT = state.time;
          if (!brain.path.length || brain.pathI >= brain.path.length) {
            setPathTo(state, bot, n.x, n.z);
          }
          followPath(state, bot, dt, 4.8);
          botReload(bot);
          return;
        }
      }
    }
    const site = brain.targetSite === 'A' ? SITE_A : SITE_B;
    const dSite = Math.hypot(bot.x - site.x, bot.z - site.z);
    if (dSite > 9) {
      if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(state, bot, site.x, site.z);
      followPath(state, bot, dt, 4.6);
    } else {
      brain.holdT -= dt;
      if (brain.holdT <= 0) {
        const hx = site.x + (Math.random() - 0.5) * 12;
        const hz = site.z + (Math.random() - 0.5) * 12;
        setPathTo(state, bot, hx, hz);
        brain.holdT = 5 + Math.random() * 5;
      }
      if (brain.path.length && brain.pathI < brain.path.length) followPath(state, bot, dt, 2.6);
      else {
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
  const bob = bot.moving ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.03 : 0;
  bot.mesh.position.y = bot.y + bob;
  bot.mesh.scale.y = bot.crouched ? 0.78 : 1;
}
