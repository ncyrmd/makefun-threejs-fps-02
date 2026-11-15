// bots.js — unit brains for both crews. Units navigate the waypoint
// graph, hold angles, react to what they see and hear, plant the charge
// and defuse it. They are deliberately fair: reaction delays, aim error
// that grows with distance and target speed, and burst fire with pauses.
//
// What makes this squad more than nine lone wolves:
//  * Roles. Each unit has a job: entry (first through the door, flashes),
//    awp (DMR, holds the long lane), lurk (rotates to the far site and
//    flanks), support (carries the smoke for the execute), anchor and
//    rotator (defenders who hold a site or chase gunfire).
//  * Coordinated executes. When the round is ripe, the entry unit calls an
//    execute on the squad's site: support smokes the entrance, entry
//    flashes over it, and the whole squad pushes together instead of
//    trickling in.
//  * An economy. Units buy what their money allows — rifles and armor
//    after a win, a save round after a loss streak, a defuse kit for
//    defenders — and never pay twice for gear they already own.
//  * Ears. Gunfire is noise; defenders who hear it rotate toward the
//    sound instead of standing on an empty site.
//  * Fire sense. No unit walks into a burning incendiary zone on purpose.
//  * Angles. A unit holding a lane faces the lane it watches — a real
//    direction computed from the map, not a fixed compass bearing.
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

// Where the support unit drops its execute smoke for each site: the main
// entrance the defenders watch.
const EXECUTE_SMOKE = { A: { x: 18, z: -15 }, B: { x: 19, z: 13 } };
// Where the entry unit lobs its execute flash: just inside the site.
const EXECUTE_FLASH = { A: { x: 22, z: -16 }, B: { x: 22, z: 16 } };
// Where the AWP posts up to watch the long lane for each site.
const AWP_POST = { A: { x: -2, z: -20 }, B: { x: -2, z: 20 } };

// Role -> preferred guns, in order. The economy picks the first it affords.
const ROLE_GUNS = {
  entry: ['rifle', 'smg', 'shotgun'],
  awp: ['dmr', 'rifle'],
  lurk: ['smg', 'rifle'],
  support: ['rifle', 'smg'],
  anchor: ['rifle', 'lmg', 'shotgun'],
  rotator: ['smg', 'rifle'],
};

// Yaw that faces from (x,z) toward (tx,tz). Yaw 0 looks along -Z.
function yawTo(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}

// Buy what the unit can afford, by role. A win round means rifles and
// armor; a broke unit saves with the pistol and waits for the team bonus.
// Gear is only bought when the unit does not already have it — paying
// twice for the same kit is a bug, not a strategy.
export function equipBot(unit, round) {
  const money = unit.loadout.money;
  const prefs = ROLE_GUNS[unit.role] || ROLE_GUNS.entry;
  for (const gun of prefs) {
    if (money >= WEAPONS[gun].price) {
      giveWeapon(unit.loadout, gun);
      unit.loadout.money -= WEAPONS[gun].price;
      break;
    }
  }
  if (unit.loadout.armor < 50 && unit.loadout.money >= 650 && Math.random() < 0.7) {
    unit.loadout.armor = 50;
    unit.loadout.money -= 650;
  }
  if (!unit.loadout.helmet && unit.loadout.money >= 350 && Math.random() < 0.4) {
    unit.loadout.helmet = true;
    unit.loadout.money -= 350;
  }
  // Defenders buy the kit once; attackers buy utility for the execute.
  if ((unit.role === 'anchor' || unit.role === 'rotator')
    && !unit.loadout.defuseKit && unit.loadout.money >= 400 && Math.random() < 0.45) {
    unit.loadout.defuseKit = true;
    unit.loadout.money -= 400;
  }
  if (unit.role === 'support' && unit.loadout.smoke < 1 && unit.loadout.money >= 300) {
    unit.loadout.smoke = 1;
    unit.loadout.money -= 300;
  }
  if ((unit.role === 'entry' || unit.role === 'lurk')
    && unit.loadout.flash < 1 && unit.loadout.money >= 200) {
    unit.loadout.flash = 1;
    unit.loadout.money -= 200;
  }
}

export function makeBotMesh(scene, unit) {
  const g = new THREE.Group();
  const color = unit.team === 'salvage' ? 0x2fd8c8 : 0xff7a3d;
  const dark = unit.team === 'salvage' ? 0x123a3a : 0x4d241d;
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
  const gunLen = unit.role === 'awp' ? 1.1 : unit.role === 'anchor' ? 0.95 : 0.85;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, gunLen),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.28, 1.15, 0.3);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.08, 0.05),
    new THREE.MeshStandardMaterial({
      color: unit.team === 'salvage' ? 0x9fd8ff : 0xffb37a,
      emissive: unit.team === 'salvage' ? 0x2288aa : 0xaa3311,
      emissiveIntensity: 0.9,
    }),
  );
  visor.position.set(0, 1.58, 0.2);
  g.add(body, head, helmet, legs, gun, visor);
  // Support carries a visible pack; the AWP carries a scope glint.
  if (unit.role === 'support') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), darkMat);
    pack.position.set(0, 1.0, -0.26);
    g.add(pack);
  }
  if (unit.role === 'awp') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0.28, 1.28, 0.15);
    g.add(scope);
  }
  body.userData = { combatant: unit, part: 'body' };
  head.userData = { combatant: unit, part: 'head' };
  helmet.userData = { combatant: unit, part: 'head' };
  unit.mesh = g; unit.bodyMesh = body; unit.headMesh = head;
  scene.add(g);
  return g;
}

function nearestEnemy(sim, unit) {
  const all = [sim.player, ...sim.bots];
  let best = null, bd = Infinity;
  for (const c of all) {
    if (!c.alive || c.team === unit.team) continue;
    const d = Math.hypot(c.x - unit.x, c.z - unit.z);
    if (d < bd) { bd = d; best = c; }
  }
  return { enemy: best, dist: bd };
}

function visibleEnemy(sim, unit) {
  const { enemy, dist } = nearestEnemy(sim, unit);
  if (!enemy || dist > 55) return null;
  if (unit.blindT > 0) return null;
  eyePos(unit, _eye);
  eyePos(enemy, _tEye);
  if (!hasLineOfSight(_eye, _tEye, sim.smokes)) return null;
  return { enemy, dist };
}

function inFire(sim, x, z) {
  for (const f of sim.fires) {
    if (Math.hypot(x - f.x, z - f.z) < f.r + 0.5) return f;
  }
  return null;
}

function setPathTo(sim, unit, tx, tz) {
  // Never path into a burning zone: nudge the target out of it.
  const f = inFire(sim, tx, tz);
  if (f) {
    const dx = tx - f.x, dz = tz - f.z;
    const d = Math.hypot(dx, dz) || 1;
    tx = f.x + (dx / d) * (f.r + 2);
    tz = f.z + (dz / d) * (f.r + 2);
  }
  const from = nearestWaypoint(unit.x, unit.z);
  const to = nearestWaypoint(tx, tz);
  unit.brain.path = findPath(from, to);
  unit.brain.pathI = 0;
}

function followPath(sim, unit, dt, speed) {
  const brain = unit.brain;
  if (!brain.path.length || brain.pathI >= brain.path.length) return true;
  const node = WAYPOINTS[brain.path[brain.pathI]];
  const dx = node[0] - unit.x, dz = node[1] - unit.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { brain.pathI++; return brain.pathI >= brain.path.length; }
  const vx = dx / d, vz = dz / d;
  const [nx, nz] = moveCircle(unit.x, unit.z, vx * speed * dt, vz * speed * dt, 0.4, 1.62);
  unit.x = nx; unit.z = nz;
  unit.yaw = Math.atan2(-vx, -vz);
  unit.moving = true; unit.speed = speed;
  return false;
}

// Unit shooting: reaction delay, then bursts with aim error scaled by
// distance, target motion and the shooter's own motion. Never an aimbot.
// The spray pattern applies through fireHitscan, so a unit that holds the
// trigger walks its shots up the wall like a player does.
function botShoot(sim, unit, target, dist, dt, raycaster, events) {
  const brain = unit.brain;
  if (brain.reactT > 0) { brain.reactT -= dt; return; }
  if (brain.burstLeft <= 0) {
    if (brain.burstT > 0) { brain.burstT -= dt; return; }
    brain.burstLeft = 2 + Math.floor(Math.random() * 3);
    brain.burstT = 0.55 + Math.random() * 0.5;
  }
  if (!canFire(unit, sim.time)) return;
  const errScale = 0.012 + dist * 0.0011 + (target.moving ? 0.014 : 0) + (unit.moving ? 0.02 : 0);
  const aimErr = errScale * (unit.blindT > 0 ? 4 : 1);
  eyePos(unit, _eye);
  const tx = target.x + (Math.random() - 0.5) * 2 * aimErr * dist;
  const ty = target.y + eyeHeight(target) * (0.75 + (Math.random() - 0.5) * 0.4) + (Math.random() - 0.5) * 2 * aimErr * dist;
  const tz = target.z + (Math.random() - 0.5) * 2 * aimErr * dist;
  _dir.set(tx - _eye.x, ty - _eye.y, tz - _eye.z).normalize();
  const before = target.hp;
  const evs = fireHitscan(sim, unit, _dir, sim.time, raycaster);
  events.push(...evs);
  brain.burstLeft--;
  if (target.hp < before) {
    brain.lastSeenX = target.x; brain.lastSeenZ = target.z; brain.lastSeenT = sim.time;
  }
}

function botReload(unit) {
  if (unit.reloadT > 0) return;
  const ammo = unit.loadout.weapons[unit.loadout.current];
  const def = WEAPONS[unit.loadout.current];
  if (ammo && ammo.mag < def.mag * 0.4 && ammo.reserve > 0) startReload(unit);
}

// Throw a grenade at a fixed point: aim the throw direction at it.
function botThrowAt(sim, unit, kind, tx, tz, events) {
  eyePos(unit, _eye);
  const dx = tx - unit.x, dz = tz - unit.z;
  const d = Math.hypot(dx, dz) || 1;
  _dir.set(dx / d, 0.25, dz / d).normalize();
  const res = throwGrenade(sim, unit, kind, _dir);
  if (!res) return false;
  if (kind === 'flash') resolveFlash(sim, res);
  events.push({ type: 'grenade', kind, by: unit, x: res.x, z: res.z });
  return true;
}

// Turn toward a yaw at most `rate` radians per second (smooth, not a snap).
function turnToward(unit, wantYaw, dt, rate = 6) {
  let diff = wantYaw - unit.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  unit.yaw += step;
}

// One fixed-step tick for one unit.
export function updateBot(sim, unit, dt, raycaster, events, sound) {
  if (!unit.alive) {
    if (unit.mesh) unit.mesh.visible = false;
    return;
  }
  const brain = unit.brain;
  brain.thinkT -= dt;
  if (unit.blindT > 0) unit.blindT -= dt;
  if (unit.tagT > 0) unit.tagT -= dt;
  if (unit.reloadT > 0) {
    unit.reloadT -= dt;
    if (unit.reloadT <= 0) finishReload(unit);
  }
  unit.spreadBloom = Math.max(0, unit.spreadBloom - dt * 0.09);
  unit.recoilPitch = Math.max(0, unit.recoilPitch - dt * 0.12);
  if (brain.state !== 'engage') unit.sprayN = 0;
  unit.moving = false;

  // Step out of fire before anything else.
  const fire = inFire(sim, unit.x, unit.z);
  if (fire) {
    const dx = unit.x - fire.x, dz = unit.z - fire.z;
    const d = Math.hypot(dx, dz) || 1;
    const [nx, nz] = moveCircle(unit.x, unit.z, (dx / d) * 4.5 * dt, (dz / d) * 4.5 * dt, 0.4, 1.62);
    unit.x = nx; unit.z = nz;
    unit.yaw = Math.atan2(-dx / d, -dz / d);
    unit.moving = true; unit.speed = 4.5;
    return;
  }

  const attacking = unit.team === sim.attackTeam;

  // --- bomb duties ---
  if (sim.bomb.state === 'planted' && !attacking) {
    // Defenders converge on the planted site and defuse when close.
    const site = bombSitePos(sim.bomb.site);
    const d = Math.hypot(unit.x - site.x, unit.z - site.z);
    if (d < 2.2) {
      if (!brain.channelKind) { brain.channelKind = 'defuse'; brain.channelT = 0; }
      const done = updateChannel(sim, unit, dt, events);
      if (done === 'defused') return;
      return; // stand still while defusing
    }
    if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(sim, unit, site.x, site.z);
    followPath(sim, unit, dt, 4.6);
    return;
  }
  if (sim.bomb.state === 'dropped' && attacking) {
    const d = Math.hypot(unit.x - sim.bomb.x, unit.z - sim.bomb.z);
    if (d < 1.4) {
      sim.bomb.state = 'carried'; sim.bomb.carrierId = unit.id;
      events.push({ type: 'bombPickup', by: unit });
    } else if (brain.state !== 'engage') {
      if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(sim, unit, sim.bomb.x, sim.bomb.z);
      followPath(sim, unit, dt, 4.6);
      return;
    }
  }

  // --- combat: see an enemy? ---
  const seen = visibleEnemy(sim, unit);
  if (seen) {
    brain.enemyId = seen.enemy.id;
    brain.lastSeenX = seen.enemy.x; brain.lastSeenZ = seen.enemy.z; brain.lastSeenT = sim.time;
    if (brain.state !== 'engage') {
      brain.state = 'engage';
      brain.reactT = 0.35 + Math.random() * 0.45;
      brain.crouchT = 0;
    }
  } else if (brain.state === 'engage' && sim.time - brain.lastSeenT > 2.5) {
    brain.state = 'push'; brain.enemyId = null;
  }

  if (brain.state === 'engage' && brain.enemyId) {
    const all = [sim.player, ...sim.bots];
    const target = all.find((c) => c.id === brain.enemyId);
    if (!target || !target.alive) { brain.state = 'push'; brain.enemyId = null; }
    else {
      const dist = Math.hypot(target.x - unit.x, target.z - unit.z);
      brain.strafeT -= dt;
      if (brain.strafeT <= 0) {
        brain.strafeDir = Math.random() < 0.5 ? -1 : 1;
        brain.strafeT = 0.7 + Math.random() * 0.8;
      }
      // Crouch is a stable decision for the whole engagement, decided
      // once when the fight starts — not a coin flip every frame.
      if (brain.crouchT <= 0) {
        unit.crouched = dist > 22 && Math.random() < 0.4;
        brain.crouchT = 2 + Math.random() * 2;
      } else brain.crouchT -= dt;
      const fx = target.x - unit.x, fz = target.z - unit.z;
      const fl = Math.hypot(fx, fz) || 1;
      turnToward(unit, Math.atan2(-fx / fl, -fz / fl), dt, 10);
      const sx = -fz / fl * brain.strafeDir, sz = fx / fl * brain.strafeDir;
      const [nx, nz] = moveCircle(unit.x, unit.z, sx * 1.4 * dt, sz * 1.4 * dt, 0.4, 1.62);
      unit.x = nx; unit.z = nz; unit.moving = true; unit.speed = 1.4;
      botShoot(sim, unit, target, dist, dt, raycaster, events);
      botReload(unit);
      return;
    }
  }

  // --- squad execute (attackers) ---
  if (attacking && sim.phase === 'live') {
    const squad = sim.squad;
    const aliveAttack = [sim.player, ...sim.bots].filter((c) => c.team === sim.attackTeam && c.alive).length;
    // The shot-caller is the lowest-index alive attacker unit: it calls
    // the execute, whatever its role, so both halves get coordinated pushes.
    const aliveBots = sim.bots.filter((c) => c.team === sim.attackTeam && c.alive);
    const caller = aliveBots.length
      ? aliveBots.reduce((a, b) => (a.botIndex < b.botIndex ? a : b))
      : null;
    const isCaller = caller === unit;
    if (isCaller && squad.stage === 'spread' && !squad.called
      && aliveAttack >= 3 && sim.phaseT < 72) {
      squad.stage = 'execute';
      squad.called = true;
      squad.executeT = sim.time;
      events.push({ type: 'callout', text: 'EXECUTE SITE ' + squad.site + ' — smoke out, flash over!' });
    }
    if (squad.stage === 'execute') {
      const site = squad.site === 'A' ? SITE_A : SITE_B;
      // The first unit with a smoke drops it on the entrance; the first
      // with a flash lobs it over the smoke; then the squad pushes.
      if (!squad.smoked && unit.loadout.smoke > 0 && sim.time - squad.executeT < 3) {
        const t = EXECUTE_SMOKE[squad.site];
        if (botThrowAt(sim, unit, 'smoke', t.x, t.z, events)) { squad.smoked = true; sound.smokePop(); }
      }
      if (!squad.flashed && unit.loadout.flash > 0 && sim.time - squad.executeT < 4) {
        const t = EXECUTE_FLASH[squad.site];
        if (botThrowAt(sim, unit, 'flash', t.x, t.z, events)) { squad.flashed = true; sound.flashPop(); }
      }
      const dSite = Math.hypot(unit.x - site.x, unit.z - site.z);
      const isCarrier = sim.bomb.carrierId === unit.id && sim.bomb.state === 'carried';
      if (isCarrier && dSite < SITE_A.r) {
        if (!brain.channelKind) { brain.channelKind = 'plant'; brain.channelT = 0; }
        const done = updateChannel(sim, unit, dt, events);
        if (done === 'planted') { brain.state = 'hold'; }
        return;
      }
      if (brain.state === 'hold') {
        brain.holdT -= dt;
        if (brain.holdT <= 0) {
          const hx = site.x + (Math.random() - 0.5) * 10;
          const hz = site.z + (Math.random() - 0.5) * 10;
          setPathTo(sim, unit, hx, hz);
          brain.holdT = 4 + Math.random() * 4;
        }
        if (followPath(sim, unit, dt, 3.2)) {
          // Arrived: hold the angle on the site entrance.
          turnToward(unit, yawTo(unit.x, unit.z, site.x, site.z), dt);
        }
        return;
      }
      if (!brain.path.length || brain.pathI >= brain.path.length) {
        setPathTo(sim, unit, site.x + (Math.random() - 0.5) * 6, site.z + (Math.random() - 0.5) * 6);
      }
      followPath(sim, unit, dt, isCarrier ? 4.4 : 4.9);
      botReload(unit);
      return;
    }
    // Before the execute: spread out, take map control. The lurk rotates
    // to the far site so the defence cannot stack one side.
    if (unit.role === 'lurk') {
      const far = squad.site === 'A' ? SITE_B : SITE_A;
      if (!brain.path.length || brain.pathI >= brain.path.length) {
        setPathTo(sim, unit, far.x + (Math.random() - 0.5) * 8, far.z + (Math.random() - 0.5) * 8);
      }
      followPath(sim, unit, dt, 4.2);
      botReload(unit);
      return;
    }
    if (unit.role === 'awp') {
      // The AWP holds a long lane: post up at the lane mouth, then face
      // down the lane toward the enemy spawn.
      const post = AWP_POST[squad.site];
      if (!brain.path.length || brain.pathI >= brain.path.length) {
        setPathTo(sim, unit, post.x, post.z);
      }
      if (followPath(sim, unit, dt, 3.6)) {
        // Posted up: face down the lane toward the site.
        turnToward(unit, yawTo(unit.x, unit.z, 14, squad.site === 'A' ? -17 : 17), dt, 3);
      }
      botReload(unit);
      return;
    }
    const site = brain.targetSite === 'A' ? SITE_A : SITE_B;
    if (!brain.path.length || brain.pathI >= brain.path.length) {
      const viaMid = Math.random() < 0.35;
      const tx = viaMid ? (site.x + unit.x) / 2 : site.x + (Math.random() - 0.5) * 6;
      const tz = viaMid ? 0 : site.z + (Math.random() - 0.5) * 6;
      setPathTo(sim, unit, tx, tz);
    }
    followPath(sim, unit, dt, 4.6);
    botReload(unit);
    return;
  }

  // --- defenders: hold, rotate on noise ---
  if (!attacking) {
    // Ears: a rotator who hears fresh gunfire goes to look.
    if (unit.role === 'rotator' && brain.state !== 'engage') {
      for (let i = sim.noise.length - 1; i >= 0; i--) {
        const n = sim.noise[i];
        if (sim.time - n.t > 3) continue;
        const d = Math.hypot(n.x - unit.x, n.z - unit.z);
        if (d < 40 && d > 8) {
          brain.heardX = n.x; brain.heardZ = n.z; brain.heardT = sim.time;
          if (!brain.path.length || brain.pathI >= brain.path.length) {
            setPathTo(sim, unit, n.x, n.z);
          }
          followPath(sim, unit, dt, 4.8);
          botReload(unit);
          return;
        }
      }
    }
    const site = brain.targetSite === 'A' ? SITE_A : SITE_B;
    const dSite = Math.hypot(unit.x - site.x, unit.z - site.z);
    if (dSite > 9) {
      if (!brain.path.length || brain.pathI >= brain.path.length) setPathTo(sim, unit, site.x, site.z);
      followPath(sim, unit, dt, 4.6);
    } else {
      brain.holdT -= dt;
      if (brain.holdT <= 0) {
        const hx = site.x + (Math.random() - 0.5) * 12;
        const hz = site.z + (Math.random() - 0.5) * 12;
        setPathTo(sim, unit, hx, hz);
        brain.holdT = 5 + Math.random() * 5;
        // Remember where to look while holding: the approach from the
        // west the attackers come through, not a fixed compass bearing.
        brain.holdYaw = yawTo(hx, hz, 14, site.z);
      }
      if (brain.path.length && brain.pathI < brain.path.length) {
        followPath(sim, unit, dt, 2.6);
      } else if (brain.holdYaw !== null) {
        turnToward(unit, brain.holdYaw, dt, 2);
      }
    }
  }
  botReload(unit);
}

// Sync a unit's three.js mesh to its simulated position.
export function syncBotMesh(unit) {
  if (!unit.mesh) return;
  unit.mesh.visible = unit.alive;
  if (!unit.alive) return;
  unit.mesh.position.set(unit.x, unit.y, unit.z);
  unit.mesh.rotation.y = unit.yaw + Math.PI;
  const bob = unit.moving ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.03 : 0;
  unit.mesh.position.y = unit.y + bob;
  unit.mesh.scale.y = unit.crouched ? 0.78 : 1;
}
