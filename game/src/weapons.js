// weapons.js — weapon definitions, economy constants and the buy catalogue.
// All names, stats and prices are original to EMBERLINE.
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  lossStreakBonus: 500, // extra per consecutive loss, capped at +1000
  plantReward: 300,     // to the planter's team on a successful plant
};

// damage: per bullet at point blank. falloff: damage multiplier at maxRange.
// spread: base radians when standing still and aiming; moveSpread: added while moving.
// recoil: pitch kick per shot (radians); auto: hold-to-fire; zoom: ADS fov multiplier.
export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 SIDEARM', price: 0, kind: 'pistol',
    damage: 26, headMult: 3.4, rpm: 420, auto: false, mag: 12, reserve: 48,
    reload: 1.5, spread: 0.011, moveSpread: 0.030, recoil: 0.011, range: 55,
    falloff: 0.55, tracer: 0xffd24d, sound: 'pistol',
  },
  smg: {
    id: 'smg', slot: 2, name: 'RAPTOR SMG', price: 1200, kind: 'smg',
    damage: 21, headMult: 3.2, rpm: 780, auto: true, mag: 28, reserve: 84,
    reload: 2.0, spread: 0.016, moveSpread: 0.034, recoil: 0.008, range: 42,
    falloff: 0.5, tracer: 0xffc46b, sound: 'smg',
  },
  rifle: {
    id: 'rifle', slot: 2, name: 'VK-47 RIFLE', price: 2700, kind: 'rifle',
    damage: 34, headMult: 3.8, rpm: 600, auto: true, mag: 30, reserve: 90,
    reload: 2.4, spread: 0.008, moveSpread: 0.028, recoil: 0.014, range: 70,
    falloff: 0.7, tracer: 0xffe08a, sound: 'rifle',
  },
  shotgun: {
    id: 'shotgun', slot: 2, name: 'MULE SHOTGUN', price: 1800, kind: 'shotgun',
    damage: 9, pellets: 8, headMult: 2.6, rpm: 75, auto: false, mag: 6, reserve: 24,
    reload: 2.8, spread: 0.052, moveSpread: 0.045, recoil: 0.055, range: 22,
    falloff: 0.25, tracer: 0xffb36b, sound: 'shotgun',
  },
  dmr: {
    id: 'dmr', slot: 3, name: 'LONGBOW DMR', price: 4200, kind: 'dmr',
    damage: 88, headMult: 3.0, rpm: 55, auto: false, mag: 5, reserve: 15,
    reload: 3.0, spread: 0.002, moveSpread: 0.05, recoil: 0.05, range: 95,
    falloff: 0.9, tracer: 0x9fd8ff, sound: 'dmr', zoom: 0.45,
  },
};

export const BUY_ITEMS = [
  { id: 'smg', kind: 'weapon', name: 'RAPTOR SMG', desc: 'Fast, close-range spray', price: 1200 },
  { id: 'shotgun', kind: 'weapon', name: 'MULE SHOTGUN', desc: '8 pellets, brutal up close', price: 1800 },
  { id: 'rifle', kind: 'weapon', name: 'VK-47 RIFLE', desc: 'The all-round workhorse', price: 2700 },
  { id: 'dmr', kind: 'weapon', name: 'LONGBOW DMR', desc: 'One-shot headshot, scoped', price: 4200 },
  { id: 'armor', kind: 'gear', name: 'KEVLAR VEST', desc: 'Absorbs 50% of damage', price: 650 },
  { id: 'helmet', kind: 'gear', name: 'HELMET', desc: 'Headshots no longer one-tap', price: 350 },
  { id: 'flash', kind: 'utility', name: 'FLASHBANG ×1', desc: 'Blinds anyone looking at it', price: 200 },
  { id: 'smoke', kind: 'utility', name: 'SMOKE ×1', desc: 'Blocks sight for 14 seconds', price: 300 },
  { id: 'ammo', kind: 'gear', name: 'RESERVE AMMO', desc: 'Refill reserve for all guns', price: 250 },
];

// Fresh loadout state for one combatant. Kept plain so bots and the player share it.
export function freshLoadout() {
  return {
    weapons: { pistol: { mag: 12, reserve: 48 } },
    current: 'pistol',
    armor: 0, helmet: false, flash: 0, smoke: 0,
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
