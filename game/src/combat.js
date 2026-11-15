// combat.js — hitscan shooting, damage, grenades and the bomb objective.
// Pure simulation: it moves numbers and state, and returns visual/audio
// events for main.js to render. It never touches the DOM.
//
// Two ideas carry the gunplay here:
//  * Wall penetration. A bullet that meets a wall first measures the wall's
//    thickness along the ray. Cover thinner than the weapon's `pen` is shot
//    through at half damage (a "wallbang"); anything thicker stops the round.
//    Crates and container walls are thin; warehouse steel is not.
//  * Tagging. A hit slows its victim for a moment, so landing the first shot
//    wins the peek — the way it does in the game this one is styled after.
import * as THREE from 'three';
import { WEAPONS, damageAfterArmor, sprayOffset } from './weapons.js';
import { hasLineOfSight, SITE_A, SITE_B, pointBlocked } from './map.js';
import {
  PLANT_SECONDS, DEFUSE_SECONDS, BOMB_SECONDS, TAG_SECONDS, TAG_FACTOR,
} from './state.js';

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
// jumping and spraying (bloom) punish. Automatic weapons add their spray
// pattern on top: the pattern's pull is a cost of holding the trigger.
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

// March a ray through colliders in 0.25 m steps; returns distance to first wall.
export function rayWallDistance(shooter, dir, maxDist) {
  eyePos(shooter, _eye);
  const step = 0.25;
  for (let d = step; d <= maxDist; d += step) {
    const x = _eye.x + dir.x * d, y = _eye.y + dir.y * d, z = _eye.z + dir.z * d;
    if (y <= 0.02) return d;
    if (y > 5.5) continue;
    if (pointBlocked(x, z, 0.05, y)) return d;
    if (Math.abs(x) > 37 || Math.abs(z) > 29) return d;
  }
  return maxDist;
}

// Thickness of the wall a ray enters at `entryD`, marched in 0.1 m steps
// until the ray comes out the other side. Capped at 3 m so a long march
// through a building never reads as thin cover.
export function wallThickness(shooter, dir, entryD) {
  eyePos(shooter, _eye);
  const step = 0.1;
  for (let d = entryD + step; d <= entryD + 3; d += step) {
    const x = _eye.x + dir.x * d, y = _eye.y + dir.y * d, z = _eye.z + dir.z * d;
    if (y <= 0.02 || y > 5.5) return d - entryD;
    if (!pointBlocked(x, z, 0.05, y)) return d - entryD;
  }
  return 3;
}

// One hitscan shot from `shooter` along `dir` (spread already applied).
// Returns events: {type:'hit'|'kill'|'wall'|'wallbang', ...}. The ray is
// tested against walls (slab march) and every living enemy's body/head.
// A hit through thin cover is a wallbang: half damage, tagged, and the
// hitmarker shows amber instead of white.
export function fireHitscan(state, shooter, dir, now, raycaster) {
  const def = WEAPONS[shooter.loadout.current];
  const ammo = shooter.loadout.weapons[shooter.loadout.current];
  ammo.mag -= 1;
  shooter.lastShotT = now;
  shooter.spreadBloom = Math.min(0.05, shooter.spreadBloom + def.recoil * 0.55);
  shooter.recoilPitch += def.recoil;
  // Spray pattern: consecutive shots pull along the weapon's table.
  const [sx, sy] = sprayOffset(shooter.loadout.current, shooter.sprayN);
  shooter.sprayN = Math.min(shooter.sprayN + 1, 60);
  const events = [];
  const pellets = def.pellets || 1;
  const all = [state.player, ...state.bots];
  for (let p = 0; p < pellets; p++) {
    const d = _dir.copy(dir);
    d.x += sx; d.y += sy;
    if (pellets > 1) {
      d.x += (Math.random() - 0.5) * def.spread * 2.2;
      d.y += (Math.random() - 0.5) * def.spread * 2.2;
      d.z += (Math.random() - 0.5) * def.spread * 2.2;
    }
    d.normalize();
    eyePos(shooter, _eye);
    raycaster.set(_eye, d);
    raycaster.far = def.range;
    const meshes = [];
    for (const c of all) {
      if (!c.alive || c === shooter || !c.mesh) continue;
      meshes.push(c.bodyMesh, c.headMesh);
    }
    const hits = raycaster.intersectObjects(meshes, false);
    const wallDist = rayWallDistance(shooter, d, def.range);
    let hit = null;
    let wallbang = false;
    if (hits.length) {
      const first = hits[0];
      if (first.distance < wallDist) {
        hit = first;
      } else if (wallDist < def.range) {
        // The body is behind a wall: is the wall thin enough to shoot through?
        const thick = wallThickness(shooter, d, wallDist);
        if (thick <= def.pen && first.distance < wallDist + thick + def.range) {
          hit = first;
          wallbang = true;
        }
      }
    }
    const endDist = hit ? hit.distance : wallDist;
    const end = _target.copy(_eye).addScaledVector(d, endDist);
    events.push({ type: 'tracer', from: _eye.clone(), to: end.clone(), color: def.tracer });
    if (!hit) { events.push({ type: 'wall', at: end.clone() }); continue; }
    const victim = hit.object.userData.combatant;
    const isHead = hit.object.userData.part === 'head';
    const dist = hit.distance;
    const fall = 1 - (1 - def.falloff) * Math.min(1, dist / def.range);
    let raw = def.damage * fall * (isHead ? def.headMult : 1);
    if (wallbang) raw *= 0.5;
    const split = damageAfterArmor(raw, victim.loadout.armor, victim.loadout.helmet, isHead);
    applyDamage(state, victim, split.hp, split.armor, shooter, isHead, events, wallbang);
  }
  return events;
}

export function applyDamage(state, victim, hpDmg, armorDmg, attacker, isHead, events, wallbang = false) {
  victim.hp -= hpDmg;
  victim.loadout.armor = Math.max(0, victim.loadout.armor - armorDmg);
  // Tagging: a hit slows the victim briefly.
  victim.tagT = TAG_SECONDS;
  if (attacker) {
    attacker.damageDealt += hpDmg;
    if (attacker === state.player) state.stats.damage += hpDmg;
  }
  events.push({ type: 'hit', victim, hpDmg, isHead, attacker, wallbang });
  if (victim.hp <= 0 && victim.alive) {
    victim.hp = 0; victim.alive = false; victim.deaths++;
    if (attacker) {
      attacker.kills++;
      attacker.loadout.money += 300;
      if (attacker === state.player) state.stats.kills++;
    }
    if (victim === state.player) state.stats.deaths++;
    events.push({ type: 'kill', victim, attacker, isHead, wallbang });
    if (state.bomb.state === 'carried' && state.bomb.carrierId === victim.id) {
      state.bomb.state = 'dropped';
      state.bomb.x = victim.x; state.bomb.z = victim.z;
      events.push({ type: 'bombDropped', x: victim.x, z: victim.z });
    }
  }
}

// --- grenades ---
// Grenades land 14 m out along the throw direction, on the ground.
// Flash blinds, smoke blocks sight for 14 s, incendiary burns a zone.
export function throwGrenade(state, thrower, kind, dir) {
  const loadout = thrower.loadout;
  if (kind === 'flash' && loadout.flash <= 0) return null;
  if (kind === 'smoke' && loadout.smoke <= 0) return null;
  if (kind === 'fire' && loadout.fire <= 0) return null;
  if (kind === 'flash') loadout.flash--;
  if (kind === 'smoke') loadout.smoke--;
  if (kind === 'fire') loadout.fire--;
  eyePos(thrower, _eye);
  const landX = _eye.x + dir.x * 14;
  const landZ = _eye.z + dir.z * 14;
  const lx = Math.max(-35, Math.min(35, landX));
  const lz = Math.max(-27, Math.min(27, landZ));
  if (kind === 'flash') {
    state.flashes.push({ x: lx, y: 1.2, z: lz, ttl: 0.1 });
    return { kind: 'flash', x: lx, y: 1.2, z: lz };
  }
  if (kind === 'fire') {
    state.fires.push({ x: lx, z: lz, r: 3.5, ttl: 8 });
    return { kind: 'fire', x: lx, y: 0.5, z: lz };
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
    const lx = -Math.sin(c.yaw), lz = -Math.cos(c.yaw);
    const dot = (dx * lx + dz * lz) / Math.max(0.01, Math.hypot(dx, dz));
    if (dot > -0.2) {
      c.blindT = Math.max(c.blindT, Math.max(0.6, 2.6 - dist * 0.06));
    }
  }
}

// Fire zones burn anyone standing in them: 12 damage a second, no armor.
// Called once per fixed step from the simulation.
export function burnFires(state, dt, events) {
  for (const f of state.fires) {
    const all = [state.player, ...state.bots];
    for (const c of all) {
      if (!c.alive) continue;
      if (Math.hypot(c.x - f.x, c.z - f.z) < f.r) {
        applyDamage(state, c, 12 * dt, 0, null, false, events);
      }
    }
  }
}

// A gunshot is noise: defenders within earshot rotate toward it.
export function registerNoise(state, x, z) {
  state.noise.push({ x, z, t: state.time });
  if (state.noise.length > 24) state.noise.shift();
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

// Channel progress for planting/defusing. A defuse kit halves the defuse.
// Returns 'planted' | 'defused' | null.
export function updateChannel(state, c, dt, events) {
  const brain = c.brain;
  if (c.id === 'player') return null;
  if (!brain || !brain.channelKind) return null;
  const need = brain.channelKind === 'plant'
    ? PLANT_SECONDS
    : (c.loadout.defuseKit ? DEFUSE_SECONDS / 2 : DEFUSE_SECONDS);
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

// What the player can channel by holding E: planting when carrying the
// charge inside a site, defusing when the charge is planted and the player
// is on the defending crew (second half), picking the charge up when it lies
// at their feet.
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
  if (state.bomb.state === 'planted' && p.team !== state.attackTeam) {
    const site = bombSitePos(state.bomb.site);
    const d = Math.hypot(p.x - site.x, p.z - site.z);
    if (d < 2.2) {
      return {
        kind: 'defuse',
        site: state.bomb.site,
        need: p.loadout.defuseKit ? DEFUSE_SECONDS / 2 : DEFUSE_SECONDS,
      };
    }
  }
  return null;
}
