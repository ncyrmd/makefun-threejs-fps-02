// state.js — the single home of all mutable match data for RIPTIDE.
// The simulation (main.js, bots.js, combat.js) reads and writes this
// object; rendering and the HUD only read it. Nothing else keeps its own
// copy of a match fact, so a bug in one place cannot quietly fork the
// truth in another.
//
// The match: two crews of five, first to 5 rounds, at most 9 rounds.
// The Salvagers (teal) attack in the first half; at halftime — before
// round 5 — the crews swap, so the player attacks first and defends
// second. A round is won by eliminating the other crew, or by the
// attackers planting the charge and holding it for 35 seconds, or by
// the defenders running the clock out before a plant.
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
export const HALFTIME_ROUND = 5; // crews swap roles before this round
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const PLANT_SECONDS = 3.0;
export const DEFUSE_SECONDS = 5.0;
export const TAG_SECONDS = 0.45; // a hit slows its victim this long
export const TAG_FACTOR = 0.7; // ...down to this fraction of full speed

// A bomb carrier's team always attacks; the other team defends.
export function attackTeamOf(sim) { return sim.attackTeam; }
export function defendTeamOf(sim) {
  return sim.attackTeam === 'salvage' ? 'harbour' : 'salvage';
}

export function createState() {
  return {
    phase: PHASE.MENU,
    phaseT: 0, // seconds left in the current phase
    round: 1,
    half: 1, // 1 before the swap, 2 after
    attackTeam: 'salvage',
    score: { salvage: 0, harbour: 0 },
    lossStreak: { salvage: 0, harbour: 0 },
    bomb: {
      state: 'carried', // carried | planted | dropped | exploded | defused
      site: null, // 'A' | 'B'
      x: 0, z: 0,
      timer: BOMB_SECONDS,
      carrierId: 'player',
    },
    time: 0, // total match clock, in simulation seconds
    player: null, // filled by main.js
    bots: [], // bot combatants
    smokes: [], // {x,y,z,r,ttl} — sight-blocking clouds
    fires: [], // {x,z,r,ttl} — incendiary zones that burn
    flashes: [], // {x,y,z,ttl} — flash pops, resolved on landing
    noise: [], // {x,z,t} — gunfire sounds defenders rotate toward
    feed: [], // kill-feed entries {text, team} (kept for the end screen)
    stats: {
      kills: 0, deaths: 0, damage: 0, shots: 0, hits: 0,
      headshots: 0, plants: 0, defuses: 0, wallbangs: 0,
    },
    winner: null, // 'salvage' | 'harbour' once the match is decided
    roundWinner: null,
    roundReason: '',
    paused: false,
    muted: false,
    demo: false, // screenshot/demo mode (no pointer lock)
    spectateId: null,
    // The attacking squad's plan for this round: which site they hit, and
    // whether the execute has been called yet. The entry bot sets it; the
    // whole squad follows it instead of trickling in one by one.
    squad: { site: 'A', stage: 'spread', executeT: 0, called: false, smoked: false, flashed: false },
    roundHistory: [], // 'W' | 'L' from the player's crew, one per round
  };
}

// A combatant: the player or one bot. Position is the feet; yaw is the
// facing direction; pitch is the look up/down. Velocity is kept here so
// movement has acceleration instead of teleporting between speeds.
export function createCombatant(id, name, team, x, z, isBot, role) {
  return {
    id, name, team, isBot,
    role: role || (isBot ? 'rifle' : 'player'),
    x, z, y: 0, vy: 0, vx: 0, vz: 0,
    yaw: team === 'salvage' ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
    hp: 100, maxHp: 100, alive: true,
    loadout: freshLoadout(),
    speed: 0, moving: false, crouched: false, onGround: true,
    // weapon runtime
    fireCooldown: 0, reloadT: 0, spreadBloom: 0, recoilPitch: 0,
    lastShotT: -10, burstLeft: 0, burstT: 0, sprayN: 0,
    tagT: 0, // tagging: slowed while this is above zero
    // bot brain (null for the player)
    brain: isBot ? {
      state: 'push', // push | hold | engage | rotate | retreat | dead
      path: [], pathI: 0,
      targetSite: Math.random() < 0.5 ? 'A' : 'B',
      holdT: 0, holdYaw: null, // where to look while holding an angle
      reactT: 0, thinkT: 0,
      enemyId: null, lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
      aimErr: 0, strafeDir: 1, strafeT: 0,
      channelT: 0, channelKind: null,
      heardX: 0, heardZ: 0, heardT: -99, // last gunfire heard
      executeRole: null, // 'smoke' | 'flash' | 'entry' | null this round
      bought: false,
      crouchT: 0, // stable crouch decision, not a per-frame coin flip
    } : null,
    blindT: 0, // flash blindness remaining
    kills: 0, deaths: 0, damageDealt: 0,
    // three.js handles. The player gets an invisible hitbox (body + head)
    // so bot gunfire can actually hit them; bots get a visible mesh.
    mesh: null, bodyMesh: null, headMesh: null,
  };
}

export function allCombatants(sim) {
  return sim.player ? [sim.player, ...sim.bots] : sim.bots;
}

export function aliveOf(sim, team) {
  let n = 0;
  for (const c of allCombatants(sim)) if (c.team === team && c.alive) n++;
  return n;
}

export function awardMoney(sim, team, amount) {
  for (const c of allCombatants(sim)) if (c.team === team) c.loadout.money += amount;
}

// Halftime: the attacking crew becomes the defending one and vice versa.
// The crews stay themselves — a Salvager stays a Salvager — so the
// player attacks in the first half and defends in the second. The charge
// carrier is reassigned by startRound (main.js), since in the second
// half the attackers are all bots.
export function swapSides(sim) {
  sim.attackTeam = sim.attackTeam === 'salvage' ? 'harbour' : 'salvage';
  sim.half = 2;
}

export function resetForRound(sim) {
  for (const c of allCombatants(sim)) {
    c.hp = c.maxHp; c.alive = true;
    c.blindT = 0; c.fireCooldown = 0; c.reloadT = 0; c.spreadBloom = 0;
    c.tagT = 0; c.sprayN = 0; c.vx = 0; c.vz = 0;
    if (c.brain) {
      c.brain.state = 'push'; c.brain.path = []; c.brain.pathI = 0;
      c.brain.enemyId = null; c.brain.channelT = 0; c.brain.channelKind = null;
      c.brain.targetSite = Math.random() < 0.5 ? 'A' : 'B';
      c.brain.holdT = 0; c.brain.holdYaw = null;
      c.brain.reactT = 0; c.brain.heardT = -99;
      c.brain.executeRole = null; c.brain.bought = false;
      c.brain.crouchT = 0;
    }
  }
  sim.bomb = {
    state: 'carried', site: null, x: 0, z: 0,
    timer: BOMB_SECONDS, carrierId: 'player',
  };
  sim.smokes = []; sim.fires = []; sim.flashes = []; sim.noise = [];
  sim.roundWinner = null; sim.roundReason = '';
  sim.spectateId = null;
  sim.squad = {
    site: Math.random() < 0.5 ? 'A' : 'B',
    stage: 'spread', executeT: 0, called: false, smoked: false, flashed: false,
  };
}

// Round-end economy: the winners bank a win bonus, the losers a loss
// bonus that grows with their losing streak (capped), and the score and
// the player's W/L history advance.
export function economyForRoundEnd(sim, winnerTeam) {
  const loser = winnerTeam === 'salvage' ? 'harbour' : 'salvage';
  const streak = sim.lossStreak[loser];
  const lossPay = ECONOMY.roundLoss + Math.min(1000, streak * ECONOMY.lossStreakBonus);
  awardMoney(sim, winnerTeam, ECONOMY.roundWin);
  awardMoney(sim, loser, lossPay);
  sim.lossStreak[winnerTeam] = 0;
  sim.lossStreak[loser] = streak + 1;
  sim.score[winnerTeam]++;
  const playerTeam = sim.player ? sim.player.team : winnerTeam;
  sim.roundHistory.push(winnerTeam === playerTeam ? 'W' : 'L');
}
