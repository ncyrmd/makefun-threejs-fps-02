// weapons.js — weapon definitions, spray, economy and the buy catalogue
// for RIPTIDE. All names, stats and prices are original.
//
// Gunplay model: every automatic weapon carries a deterministic spray
// pattern — a fixed sequence of recoil offsets, one per shot in the
// magazine, produced by a seeded generator so the pattern is identical
// on every load. The first shots climb almost straight up, then the
// pattern pulls sideways; a player who drags the mouse against the
// pattern keeps the group tight. Semi-automatic weapons have no pattern:
// their kick is a single impulse. Spray is what separates a rifle you
// have learned from one you have not.
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  lossStreakBonus: 500, // extra per consecutive loss, capped at +1000
  plantReward: 300, // to the planter's team on a successful plant
};

// damage: per bullet at point blank. falloff: multiplier at max range.
// spread: base radians standing still; moveSpread: added while moving.
// recoil: pitch kick per shot (radians); auto: hold-to-fire; zoom: ADS fov.
// pen: wall-penetration power — a bullet keeps going through cover up to
// this many metres thick, losing half its damage on the way through.
// pellets: shotgun fires this many pellets per trigger pull.
export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 SIDEARM', price: 0, kind: 'pistol',
    damage: 26, headMult: 3.4, rpm: 420, auto: false, mag: 12, reserve: 48,
    reload: 1.5, spread: 0.011, moveSpread: 0.03, recoil: 0.011, range: 55,
    falloff: 0.55, pen: 0.3, tracer: 0xffd24d, sound: 'pistol',
  },
  duelist: {
    id: 'duelist', slot: 1, name: 'DUELIST .44', price: 300, kind: 'pistol',
    damage: 44, headMult: 3.0, rpm: 150, auto: false, mag: 8, reserve: 24,
    reload: 1.8, spread: 0.008, moveSpread: 0.028, recoil: 0.02, range: 50,
    falloff: 0.6, pen: 0.6, tracer: 0xffc46b, sound: 'pistol',
  },
  smg: {
    id: 'smg', slot: 2, name: 'VIPER SMG', price: 1100, kind: 'smg',
    damage: 21, headMult: 3.2, rpm: 780, auto: true, mag: 28, reserve: 84,
    reload: 2.0, spread: 0.016, moveSpread: 0.034, recoil: 0.008, range: 42,
    falloff: 0.5, pen: 0.5, tracer: 0xffc46b, sound: 'smg',
  },
  shotgun: {
    id: 'shotgun', slot: 2, name: 'MULE SHOTGUN', price: 1700, kind: 'shotgun',
    damage: 9, pellets: 8, headMult: 2.6, rpm: 75, auto: false, mag: 6, reserve: 24,
    reload: 2.8, spread: 0.052, moveSpread: 0.045, recoil: 0.055, range: 22,
    falloff: 0.25, pen: 0.2, tracer: 0xffb36b, sound: 'shotgun',
  },
  rifle: {
    id: 'rifle', slot: 2, name: 'VK-47 RIFLE', price: 2700, kind: 'rifle',
    damage: 34, headMult: 3.8, rpm: 600, auto: true, mag: 30, reserve: 90,
    reload: 2.4, spread: 0.008, moveSpread: 0.028, recoil: 0.014, range: 70,
    falloff: 0.7, pen: 1.2, tracer: 0xffe08a, sound: 'rifle',
  },
  lmg: {
    id: 'lmg', slot: 2, name: 'MAUL LMG', price: 3400, kind: 'lmg',
    damage: 27, headMult: 3.0, rpm: 660, auto: true, mag: 60, reserve: 120,
    reload: 3.6, spread: 0.02, moveSpread: 0.042, recoil: 0.011, range: 65,
    falloff: 0.6, pen: 1.2, tracer: 0xff9a5a, sound: 'lmg',
  },
  dmr: {
    id: 'dmr', slot: 3, name: 'LONGBOW DMR', price: 4200, kind: 'dmr',
    damage: 88, headMult: 3.0, rpm: 55, auto: false, mag: 5, reserve: 15,
    reload: 3.0, spread: 0.002, moveSpread: 0.05, recoil: 0.05, range: 95,
    falloff: 0.9, pen: 1.6, tracer: 0x9fd8ff, sound: 'dmr', zoom: 0.45,
  },
};

// Spray shape per automatic weapon: how far the pattern climbs (rise),
// how far it wanders sideways (drift), and how quickly it settles.
// The pattern is built by a seeded walk, so it is the same on every
// load and every machine — a player can learn it like a real recoil
// pattern. Semi-auto weapons have no entry here: their kick is one
// impulse, not a pattern.
const SPRAY_SHAPE = {
  rifle: { seed: 11, rise: 0.014, drift: 0.011, settle: 0.35 },
  smg: { seed: 23, rise: 0.010, drift: 0.009, settle: 0.5 },
  lmg: { seed: 37, rise: 0.010, drift: 0.013, settle: 0.3 },
};

// A tiny deterministic generator: a linear congruential walk in [0,1).
// Seeded per weapon, so each gun's pattern is fixed and learnable.
function sprayRand(seed, n) {
  let s = (seed * 2654435761 + n * 40503) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  return ((s >>> 8) & 0xffffff) / 0x1000000;
}

// Spray offset [x, y] in radians for shot `n` (0-based) of an automatic
// weapon. The first shots climb, then the pattern wanders sideways and
// settles toward a slow drift. Semi-auto weapons return no offset.
export function sprayOffset(weaponId, n) {
  const shape = SPRAY_SHAPE[weaponId];
  if (!shape) return [0, 0];
  const climb = shape.rise * Math.min(1, n / 8); // ramps over the first 8 shots
  const wobble = (sprayRand(shape.seed, n) - 0.5) * 2 * shape.drift;
  const settle = 1 - shape.settle * Math.min(1, n / 20);
  const y = climb * (0.7 + 0.3 * sprayRand(shape.seed + 5, n)) * settle + 0.002;
  const x = wobble * (0.4 + 0.6 * Math.min(1, n / 10));
  return [x, y];
}

export const BUY_ITEMS = [
  { id: 'duelist', kind: 'weapon', name: 'DUELIST .44', desc: 'Heavy sidearm, two-tap at close range', price: 300 },
  { id: 'smg', kind: 'weapon', name: 'VIPER SMG', desc: 'Fast, close-range spray', price: 1100 },
  { id: 'shotgun', kind: 'weapon', name: 'MULE SHOTGUN', desc: '8 pellets, brutal up close', price: 1700 },
  { id: 'rifle', kind: 'weapon', name: 'VK-47 RIFLE', desc: 'The all-round workhorse', price: 2700 },
  { id: 'lmg', kind: 'weapon', name: 'MAUL LMG', desc: '60-round belt, hold the lane', price: 3400 },
  { id: 'dmr', kind: 'weapon', name: 'LONGBOW DMR', desc: 'One-shot headshot, scoped', price: 4200 },
  { id: 'armor', kind: 'gear', name: 'KEVLAR VEST', desc: 'Absorbs half of damage', price: 650 },
  { id: 'helmet', kind: 'gear', name: 'HELMET', desc: 'Headshots no longer one-tap', price: 350 },
  { id: 'defuse', kind: 'gear', name: 'DEFUSE KIT', desc: 'Defuse in half the time', price: 400 },
  { id: 'flash', kind: 'utility', name: 'FLASHBANG ×1', desc: 'Blinds anyone looking at it', price: 200 },
  { id: 'smoke', kind: 'utility', name: 'SMOKE ×1', desc: 'Blocks sight for 14 seconds', price: 300 },
  { id: 'fire', kind: 'utility', name: 'INCENDIARY ×1', desc: 'Fire zone, 8 s area denial', price: 400 },
  { id: 'ammo', kind: 'gear', name: 'RESERVE AMMO', desc: 'Refill reserve for all guns', price: 250 },
];

// Fresh loadout state for one combatant. Kept plain so bots and the
// player share it. `sprayN` counts consecutive shots for the spray
// pattern and resets when the trigger is released or the weapon changes.
export function freshLoadout() {
  return {
    weapons: { pistol: { mag: 12, reserve: 48 } },
    current: 'pistol',
    armor: 0, helmet: false, defuseKit: false, flash: 0, smoke: 0, fire: 0,
    money: ECONOMY.startMoney,
  };
}

export function giveWeapon(loadout, id) {
  const def = WEAPONS[id];
  if (!def || loadout.weapons[id]) return false;
  loadout.weapons[id] = { mag: def.mag, reserve: def.reserve };
  loadout.current = id;
  return true;
}

// Damage after range falloff and armor. Returns the {hp, armor} split:
// the helmet halves headshot damage, and armor absorbs half of what
// remains, up to what the vest has left.
export function damageAfterArmor(raw, armor, helmet, isHead) {
  let dmg = raw;
  if (isHead && helmet) dmg *= 0.5;
  if (armor > 0) {
    const absorbed = Math.min(armor, dmg * 0.5);
    return { hp: dmg - absorbed, armor: absorbed };
  }
  return { hp: dmg, armor: 0 };
}
