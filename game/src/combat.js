// combat.js — hitscan shooting, damage, grenades and the bomb objective.
// Pure simulation: it moves numbers and state, and returns visual/audio events
// for main.js to render. It never touches the DOM.
import * as THREE from 'three';
import { WEAPONS, damageAfterArmor } from './weapons.js';
import { hasLineOfSight, SITE_A, SITE_B, pointBlocked } from './map.js';
import { PLANT_SECONDS, DEFUSE_SECONDS, BOMB_SECONDS } from './state.js';

const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();

// Eye height: 1.62 standing, 1.15 crouched.
export function eyeHeight(c) { return c.crouched ? 1.15 : 1.62; }
export function eyePos(c, out) {
  out.set(c.x, c.y + eyeHeight(c), c.z);
  return out;
}

// Spread for one shot, in radians. Standing still and aiming pays; moving,
// jumping and spraying (bloom) punish.
export function currentSpread(c) {
  const def = WEAPONS[c.loadout.current];
  let s = def.spread;
  if (c.moving) s += def.moveSpread;
  if (!c.onGround) s += 0.05;
  if (c.crouched) s *= 0.75;
  s += c.spreadBloom;
  return s;
}

export function canFire(c, now) {
  if (!c.alive) return false;
  if (c.reloadT > 0) return false;
  const def = WEAPONS[c.loadout.current];
  const ammo = c.loadout.weapons[c.loadout.current];
  if (!ammo || ammo.mag <= 0) return false;
  return now - c.lastShotT >= 60 / def.rpm;
}

export function startReload(c) {
  const def = WEAPONS[c.loadout.current];
  const ammo = c.loadout.weapons[c.loadout.current];
  if (!ammo || c.reloadT > 0) return false;
  if (ammo.mag >= def.mag || ammo.reserve <= 0) return false;
  c.reloadT = def.reload;
  return true;
}

export function finishReload(c) {
  const def = WEAPONS[c.loadout.current];
  const ammo = c.loadout.weapons[c.loadout.current];
  const need = def.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take; ammo.reserve -= take;
}

// One hitscan shot from `shooter` along `dir` (already spread-applied).
// Returns a list of events: {type:'hit'|'kill'|'wall', ...}. The ray is tested
// against walls (slab march) and every living enemy's body/head capsules.
export function fireHitscan(state, shooter, dir, now, raycaster) {
  const def = WEAPONS[shooter.loadout.current];
  const ammo = shooter.loadout.weapons[shooter.loadout.current];
  ammo.mag -= 1;
  shooter.lastShotT = now;
  shooter.spreadBloom = Math.min(0.05, shooter.spreadBloom + def.recoil * 0.55);
  shooter.recoilPitch += def.recoil;
  const events = [];
  const pellets = def.pellets || 1;
  const all = [state.player, ...state.bots];
  for (let p = 0; p < pellets; p++) {
    const d = _dir.copy(dir);
    if (pellets > 1) {
      d.x += (Math.random() - 0.5) * def.spread * 2.2;
      d.y += (Math.random() - 0.5) * def.spread * 2.2;
      d.z += (Math.random() - 0.5) * def.spread * 2.2;
      d.normalize();
    }
    eyePos(shooter, _eye);
    raycaster.set(_eye, d);
    raycaster.far = def.range;
    // Intersect bot hit meshes first.
    const meshes = [];
    for (const c of all) {
      if (!c.alive || c === shooter || !c.mesh) continue;
      meshes.push(c.bodyMesh, c.headMesh);
    }
    const hits = raycaster.intersectObjects(meshes, false);
    const wallDist = rayWallDistance(shooter, d, def.range);
    let hit = null;
    if (hits.length && hits[0].distance < wallDist) hit = hits[0];
    const end = _target.copy(_eye).addScaledVector(d, hit ? hit.distance : wallDist);
    events.push({ type: 'tracer', from: _eye.clone(), to: end.clone(), color: def.tracer });
    if (!hit) { events.push({ type: 'wall', at: end.clone() }); continue; }
    const victim = hit.object.userData.combatant;
    const isHead = hit.object.userData.part === 'head';
    const dist = hit.distance;
    const fall = 1 - (1 - def.falloff) * Math.min(1, dist / def.range);
    const raw = def.damage * fall * (isHead ? def.headMult : 1);
    const split = damageAfterArmor(raw, victim.loadout.armor, victim.loadout.helmet, isHead);
    applyDamage(state, victim, split.hp, split.armor, shooter, isHead, events);
  }
  return events;
}

export function applyDamage(state, victim, hpDmg, armorDmg, attacker, isHead, events) {
  victim.hp -= hpDmg;
  victim.loadout.armor = Math.max(0, victim.loadout.armor - armorDmg);
  if (attacker) {
    attacker.damageDealt += hpDmg;
    if (attacker === state.player) state.stats.damage += hpDmg;
  }
  events.push({ type: 'hit', victim, hpDmg, isHead, attacker });
  if (victim.hp <= 0 && victim.alive) {
    victim.hp = 0; victim.alive = false; victim.deaths++;
    if (attacker) {
      attacker.kills++;
      attacker.loadout.money += 300;
      if (attacker === state.player) { state.stats.kills++; }
    }
    if (victim === state.player) state.stats.deaths++;
    events.push({ type: 'kill', victim, attacker, isHead });
    // Drop the bomb where its carrier died.
    if (state.bomb.state === 'carried' && state.bomb.carrierId === victim.id) {
      state.bomb.state = 'dropped';
      state.bomb.x = victim.x; state.bomb.z = victim.z;
      events.push({ type: 'bombDropped', x: victim.x, z: victim.z });
    }
  }
}

// March a ray through colliders in 0.25 m steps; returns distance to first wall.
export function rayWallDistance(shooter, dir, maxDist) {
  eyePos(shooter, _eye);
  const step = 0.25;
  for (let d = step; d <= maxDist; d += step) {
    const x = _eye.x + dir.x * d, y = _eye.y + dir.y * d, z = _eye.z + dir.z * d;
    if (y <= 0.02) return d;
    if (y > 5.5) continue;
    if (pointBlocked(x, z, 0.05, y)) return d;
    if (Math.abs(x) > 33 || Math.abs(z) > 25) return d;
  }
  return maxDist;
}

// --- grenades ---
export function throwGrenade(state, thrower, kind, dir) {
  const loadout = thrower.loadout;
  if (kind === 'flash' && loadout.flash <= 0) return null;
  if (kind === 'smoke' && loadout.smoke <= 0) return null;
  if (kind === 'flash') loadout.flash--;
  if (kind === 'smoke') loadout.smoke--;
  eyePos(thrower, _eye);
  // Simple ballistic landing: 14 m out along the throw direction, on the ground.
  const landX = _eye.x + dir.x * 14;
  const landZ = _eye.z + dir.z * 14;
  const lx = Math.max(-31, Math.min(31, landX));
  const lz = Math.max(-23, Math.min(23, landZ));
  if (kind === 'flash') {
    state.flashes.push({ x: lx, y: 1.2, z: lz, ttl: 0.1 });
    return { kind: 'flash', x: lx, y: 1.2, z: lz };
  }
  state.smokes.push({ x: lx, y: 1.0, z: lz, r: 4.5, ttl: 14 });
  return { kind: 'smoke', x: lx, y: 1.0, z: lz };
}

// Apply a flash pop: anyone with line of sight to the pop and facing it is blind.
export function resolveFlash(state, pop) {
  const all = [state.player, ...state.bots];
  for (const c of all) {
    if (!c.alive) continue;
    eyePos(c, _eye);
    const dx = pop.x - c.x, dy = pop.y - _eye.y, dz = pop.z - c.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 34) continue;
    if (!hasLineOfSight(_eye, { x: pop.x, y: pop.y, z: pop.z }, state.smokes)) continue;
    // Facing check: dot of look dir with direction to pop.
    const lx = -Math.sin(c.yaw), lz = -Math.cos(c.yaw);
    const dot = (dx * lx + dz * lz) / Math.max(0.01, Math.hypot(dx, dz));
    if (dot > -0.2) {
      c.blindT = Math.max(c.blindT, Math.max(0.6, 2.6 - dist * 0.06));
    }
  }
}

// --- bomb objective ---
export function siteAt(x, z) {
  if (Math.hypot(x - SITE_A.x, z - SITE_A.z) < SITE_A.r) return 'A';
  if (Math.hypot(x - SITE_B.x, z - SITE_B.z) < SITE_B.r) return 'B';
  return null;
}

export function bombSitePos(site) {
  return site === 'A' ? SITE_A : SITE_B;
}

// Channel progress for planting/defusing. Returns 'planted' | 'defused' | null.
export function updateChannel(state, c, dt, events) {
  const brain = c.brain;
  if (c.id === 'player') return null;
  if (!brain || !brain.channelKind) return null;
  const need = brain.channelKind === 'plant' ? PLANT_SECONDS : DEFUSE_SECONDS;
  brain.channelT += dt;
  if (brain.channelT >= need) {
    if (brain.channelKind === 'plant') {
      state.bomb.state = 'planted';
      state.bomb.site = siteAt(c.x, c.z);
      state.bomb.x = c.x; state.bomb.z = c.z;
      state.bomb.timer = BOMB_SECONDS;
      brain.channelKind = null; brain.channelT = 0;
      events.push({ type: 'planted', by: c, site: state.bomb.site });
      return 'planted';
    }
    state.bomb.state = 'defused';
    brain.channelKind = null; brain.channelT = 0;
    events.push({ type: 'defused', by: c });
    return 'defused';
  }
  return null;
}

// Player channel (plant/defuse) — same rules, driven by holding E in main.js.
export function playerChannelTarget(state) {
  const p = state.player;
  if (!p || !p.alive) return null;
  if (state.bomb.state === 'carried' && state.bomb.carrierId === 'player') {
    const site = siteAt(p.x, p.z);
    if (site) return { kind: 'plant', site, need: PLANT_SECONDS };
  }
  if (state.bomb.state === 'dropped') {
    const d = Math.hypot(p.x - state.bomb.x, p.z - state.bomb.z);
    if (d < 1.6) return { kind: 'pickup' };
  }
  if (state.bomb.state === 'planted' && p.team === 'defend') return null; // player is attacker
  return null;
}
