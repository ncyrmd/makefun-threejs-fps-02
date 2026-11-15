// weapons.js — weapon definitions, spray patterns, economy and the buy
// catalogue for BLACKTIDE. All names, stats and prices are original.
//
// Gunplay model: every automatic weapon carries a deterministic spray
// pattern — a table of (x, y) recoil offsets, one per shot in the magazine.
// The first shots climb almost straight up, then the pattern pulls sideways;
// a player who drags the mouse against the pattern keeps the group tight.
// Semi-automatic weapons have no pattern: their kick is a single impulse.
// Spray is what separates a rifle you have learned from one you have not.
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
export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 SIDEARM', price: 0, kind: 'pistol',
    damage: 26, headMult: 3.4, rpm: 420, auto: false, mag: 12, reserve: 48,
    reload: 1.5, spread: 0.011, moveSpread: 0.030, recoil: 0.011, range: 55,
    falloff: 0.55, pen: 0.3, tracer: 0xffd24d, sound: 'pistol',
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

// Spray patterns: [x, y] recoil offsets in radians, one entry per shot.
// The pattern is applied on top of the base spread; the first eight shots
// of the rifle climb, the next eight drift right, then it settles left.
// The SMG climbs fast and wanders; the LMG climbs slow and wide.
export const SPRAY = {
  rifle: [
    [0, 0.011], [0, 0.013], [0, 0.014], [0.001, 0.015], [0.002, 0.015],
    [0.003, 0.014], [0.004, 0.013], [0.005, 0.012], [0.007, 0.011],
    [0.009, 0.010], [0.011, 0.009], [0.012, 0.008], [0.012, 0.007],
    [0.010, 0.006], [0.007, 0.006], [0.004, 0.005], [0.001, 0.005],
    [-0.002, 0.005], [-0.005, 0.004], [-0.007, 0.004], [-0.009, 0.004],
    [-0.010, 0.003], [-0.010, 0.003], [-0.009, 0.003], [-0.007, 0.003],
    [-0.004, 0.003], [-0.001, 0.003], [0.002, 0.003], [0.004, 0.003],
    [0.005, 0.003],
  ],
  smg: [
    [0, 0.009], [0.001, 0.010], [0.002, 0.011], [0.004, 0.011],
    [0.006, 0.010], [0.008, 0.009], [0.009, 0.008], [0.009, 0.007],
    [0.008, 0.006], [0.005, 0.006], [0.002, 0.005], [-0.002, 0.005],
    [-0.005, 0.005], [-0.008, 0.004], [-0.009, 0.004], [-0.009, 0.004],
    [-0.007, 0.003], [-0.004, 0.003], [0, 0.003], [0.004, 0.003],
    [0.007, 0.003], [0.009, 0.003], [0.010, 0.002], [0.009, 0.002],
    [0.007, 0.002], [0.004, 0.002], [0.001, 0.002], [-0.002, 0.002],
  ],
  lmg: [
    [0, 0.008], [0, 0.009], [0.001, 0.010], [0.002, 0.011], [0.003, 0.011],
    [0.005, 0.011], [0.007, 0.010], [0.009, 0.010], [0.011, 0.009],
    [0.013, 0.009], [0.014, 0.008], [0.014, 0.007], [0.013, 0.007],
    [0.011, 0.006], [0.008, 0.006], [0.005, 0.005], [0.002, 0.005],
    [-0.002, 0.005], [-0.005, 0.005], [-0.008, 0.004], [-0.011, 0.004],
    [-0.013, 0.004], [-0.014, 0.003], [-0.014, 0.003], [-0.012, 0.003],
    [-0.010, 0.003], [-0.007, 0.003], [-0.004, 0.002], [-0.001, 0.002],
    [0.002, 0.002], [0.005, 0.002], [0.008, 0.002], [0.010, 0.002],
    [0.011, 0.002], [0.011, 0.002], [0.010, 0.001], [0.008, 0.001],
    [0.005, 0.001], [0.002, 0.001], [-0.001, 0.001], [-0.004, 0.001],
    [-0.006, 0.001], [-0.008, 0.001], [-0.009, 0.001], [-0.009, 0.001],
    [-0.008, 0.001], [-0.006, 0.001], [-0.003, 0.001], [0, 0.001],
    [0.003, 0.001], [0.005, 0.001], [0.007, 0.001], [0.008, 0.001],
    [0.008, 0.001], [0.007, 0.001], [0.005, 0.001], [0.002, 0.001],
    [-0.001, 0.001], [-0.003, 0.001], [-0.005, 0.001],
  ],
};

// Spray offset for shot `n` (0-based) of an automatic weapon. Semi-auto
// weapons return no offset; their kick is a single impulse.
export function sprayOffset(weaponId, n) {
  const table = SPRAY[weaponId];
  if (!table) return [0, 0];
  const e = table[Math.min(n, table.length - 1)];
  return e;
}

export const BUY_ITEMS = [
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

// Fresh loadout state for one combatant. Kept plain so bots and the player
// share it. `sprayN` counts consecutive shots for the spray pattern and
// resets when the trigger is released or the weapon is switched.
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

// Damage after range falloff and armor. Returns {hp, armor} damage split.
export function damageAfterArmor(raw, armor, helmet, isHead) {
  let dmg = raw;
  if (isHead && helmet) dmg *= 0.5; // helmet halves headshot damage
  if (armor > 0) {
    const absorbed = Math.min(armor, dmg * 0.5);
    return { hp: dmg - absorbed, armor: absorbed };
  }
  return { hp: dmg, armor: 0 };
}
