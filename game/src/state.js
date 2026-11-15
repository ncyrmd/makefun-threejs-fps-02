// state.js — one place for all mutable match state. The simulation
// (main.js, bots.js, combat.js) reads and writes this object; rendering and
// the HUD only read it. No other module keeps its own copy of match facts.
//
// Sides: the two crews are 'salvage' (teal, the Salvagers) and 'harbour'
// (orange, the Harbour Watch). One of them attacks; the other defends.
// At halftime — before round 5 — the sides swap, so the player attacks in
// the first half and defends in the second, like a real half-time switch.
import { freshLoadout, ECONOMY } from './weapons.js';

export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const HALFTIME_ROUND = 5; // sides swap before this round
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const PLANT_SECONDS = 3.0;
export const DEFUSE_SECONDS = 5.0;
export const TAG_SECONDS = 0.45; // being hit slows you this long
export const TAG_FACTOR = 0.7; // ...to this fraction of your speed

export function createState() {
  return {
    phase: PHASE.MENU,
    phaseT: 0, // seconds left in the current phase
    round: 1,
    half: 1, // 1 before the swap, 2 after
    attackTeam: 'salvage', // which crew attacks this half
    score: { salvage: 0, harbour: 0 },
    lossStreak: { salvage: 0, harbour: 0 },
    bomb: {
      state: 'carried', // carried | planted | dropped | exploded | defused
      site: null, // 'A' | 'B'
      x: 0, z: 0,
      timer: BOMB_SECONDS,
      carrierId: 'player',
    },
    time: 0, // total match clock (sim seconds)
    player: null, // filled by main.js (the player combatant)
    bots: [], // bot combatants
    smokes: [], // {x,y,z,r,ttl}
    fires: [], // incendiary zones {x,z,r,ttl}
    flashes: [], // active flash events {x,y,z,ttl}
    noise: [], // gunfire sounds {x,z,t} — defenders rotate toward them
    feed: [], // kill feed entries {text, team}
    stats: { kills: 0, deaths: 0, damage: 0, shots: 0, hits: 0, headshots: 0, plants: 0, defuses: 0, wallbangs: 0 },
    winner: null, // 'salvage' | 'harbour' at match end
    roundWinner: null,
    roundReason: '',
    paused: false,
    muted: false,
    demo: false, // screenshot/demo mode (no pointer lock)
    spectateId: null,
    // Squad plan for the attacking crew: which site they execute, and when.
    // Set by the entry bot each round; the whole squad follows it.
    squad: { site: 'A', stage: 'spread', executeT: 0, called: false, smoked: false, flashed: false },
    roundHistory: [], // 'W' | 'L' from the player's side, per round
  };
}

// A combatant: player or bot. pos is the feet position; yaw faces the look dir.
export function createCombatant(id, name, team, x, z, isBot, role) {
  return {
    id, name, team, isBot,
    role: role || (isBot ? 'rifle' : 'player'),
    x, z, y: 0, vy: 0, yaw: team === 'salvage' ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
    hp: 100, maxHp: 100, alive: true,
    loadout: freshLoadout(),
    speed: 0, moving: false, crouched: false, onGround: true,
    // weapon runtime
    fireCooldown: 0, reloadT: 0, spreadBloom: 0, recoilPitch: 0,
    lastShotT: -10, burstLeft: 0, burstT: 0, sprayN: 0,
    tagT: 0, // tagging: slowed while > 0
    // bot brain (unused for the player)
    brain: isBot ? {
      state: 'push', // push | hold | engage | rotate | retreat | dead
      path: [], pathI: 0,
      targetSite: Math.random() < 0.5 ? 'A' : 'B',
      holdT: 0, reactT: 0, thinkT: 0,
      enemyId: null, lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
      aimErr: 0, strafeDir: 1, strafeT: 0,
      channelT: 0, channelKind: null,
      heardX: 0, heardZ: 0, heardT: -99, // last gunfire heard
      executeRole: null, // 'smoke' | 'flash' | 'entry' | null for this round
      bought: false,
    } : null,
    blindT: 0, // flash blindness remaining
    kills: 0, deaths: 0, damageDealt: 0,
    mesh: null, // three.js group (bots) or null (player)
    headMesh: null, bodyMesh: null,
  };
}

export function aliveOf(state, team) {
  let n = 0;
  const all = state.player ? [state.player, ...state.bots] : state.bots;
  for (const c of all) if (c.team === team && c.alive) n++;
  return n;
}

export function awardMoney(state, team, amount) {
  const all = state.player ? [state.player, ...state.bots] : state.bots;
  for (const c of all) if (c.team === team) c.loadout.money += amount;
}

// Swap the sides at halftime: the attacking crew becomes the defending one
// and vice versa. The crews stay themselves — a Salvager stays a Salvager —
// so the player attacks in the first half and defends in the second. The
// bomb carrier is reassigned by startRound (main.js), since in the second
// half the attackers are all bots.
export function swapSides(state) {
  state.attackTeam = state.attackTeam === 'salvage' ? 'harbour' : 'salvage';
  state.half = 2;
}

export function resetForRound(state) {
  const all = state.player ? [state.player, ...state.bots] : state.bots;
  for (const c of all) {
    c.hp = c.maxHp; c.alive = true;
    c.blindT = 0; c.fireCooldown = 0; c.reloadT = 0; c.spreadBloom = 0;
    c.tagT = 0; c.sprayN = 0;
    if (c.brain) {
      c.brain.state = 'push'; c.brain.path = []; c.brain.pathI = 0;
      c.brain.enemyId = null; c.brain.channelT = 0; c.brain.channelKind = null;
      c.brain.targetSite = Math.random() < 0.5 ? 'A' : 'B';
      c.brain.holdT = 0; c.brain.reactT = 0; c.brain.heardT = -99;
      c.brain.executeRole = null; c.brain.bought = false;
    }
  }
  state.bomb = {
    state: 'carried', site: null, x: 0, z: 0,
    timer: BOMB_SECONDS, carrierId: 'player',
  };
  state.smokes = []; state.fires = []; state.flashes = []; state.noise = [];
  state.roundWinner = null; state.roundReason = '';
  state.spectateId = null;
  state.squad = { site: Math.random() < 0.5 ? 'A' : 'B', stage: 'spread', executeT: 0, called: false, smoked: false, flashed: false };
}

export function economyForRoundEnd(state, winnerTeam) {
  const loser = winnerTeam === 'salvage' ? 'harbour' : 'salvage';
  const streak = state.lossStreak[loser];
  const lossPay = ECONOMY.roundLoss + Math.min(1000, streak * ECONOMY.lossStreakBonus);
  awardMoney(state, winnerTeam, ECONOMY.roundWin);
  awardMoney(state, loser, lossPay);
  state.lossStreak[winnerTeam] = 0;
  state.lossStreak[loser] = streak + 1;
  state.score[winnerTeam]++;
  // Round history from the player's side (for the HUD's W/L dots).
  const playerTeam = state.player ? state.player.team : winnerTeam;
  state.roundHistory.push(winnerTeam === playerTeam ? 'W' : 'L');
}
