// hud.js — every DOM surface of RIPTIDE: the HUD, the minimap, the buy
// menu, the kill feed, banners and the match-end table. It reads the match
// data and writes the DOM; it never runs the simulation. All lookups go
// through $ so a missing element fails loudly in development instead of
// silently.
import { WEAPONS, BUY_ITEMS } from './weapons.js';
import { SITE_A, SITE_B, MAP } from './map.js';
import { PHASE, MAX_ROUNDS } from './state.js';

export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error('hud: missing element #' + id);
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- buy menu ---
export function renderBuy(sim, onBuyClick) {
  const p = sim.player;
  const list = $('buy-list');
  const items = BUY_ITEMS.map((item) => {
    const owned = item.kind === 'weapon' && p.loadout.weapons[item.id];
    const afford = p.loadout.money >= item.price;
    const cls = owned ? 'owned' : afford ? '' : 'poor';
    const tag = owned ? 'OWNED' : '$' + item.price;
    return `<button class="buy-item ${cls}" data-id="${item.id}">
      <span class="buy-name">${item.name}</span>
      <span class="buy-desc">${item.desc}</span>
      <span class="buy-price">${tag}</span>
    </button>`;
  }).join('');
  list.innerHTML = items;
  $('buy-money').textContent = '$' + p.loadout.money;
  for (const btn of list.querySelectorAll('.buy-item')) {
    btn.addEventListener('click', () => onBuyClick(BUY_ITEMS.find((i) => i.id === btn.dataset.id)));
  }
}

// Buy one item for the player. Returns true when the purchase went
// through; false (and no money spent) when it cannot.
export function applyBuy(sim, item) {
  const p = sim.player;
  if (!item) return false;
  if (p.loadout.money < item.price) return false;
  if (item.kind === 'weapon') {
    if (p.loadout.weapons[item.id]) return false;
    p.loadout.money -= item.price;
    p.loadout.weapons[item.id] = { mag: WEAPONS[item.id].mag, reserve: WEAPONS[item.id].reserve };
    p.loadout.current = item.id;
    p.sprayN = 0;
    return true;
  }
  switch (item.id) {
    case 'armor':
      if (p.loadout.armor >= 50) return false;
      p.loadout.money -= item.price; p.loadout.armor = 50; return true;
    case 'helmet':
      if (p.loadout.helmet) return false;
      p.loadout.money -= item.price; p.loadout.helmet = true; return true;
    case 'defuse':
      if (p.loadout.defuseKit) return false;
      p.loadout.money -= item.price; p.loadout.defuseKit = true; return true;
    case 'flash':
      p.loadout.money -= item.price; p.loadout.flash++; return true;
    case 'smoke':
      p.loadout.money -= item.price; p.loadout.smoke++; return true;
    case 'fire':
      p.loadout.money -= item.price; p.loadout.fire++; return true;
    case 'ammo':
      p.loadout.money -= item.price;
      for (const id of Object.keys(p.loadout.weapons)) {
        p.loadout.weapons[id].reserve = WEAPONS[id].reserve;
      }
      return true;
    default:
      return false;
  }
}

// --- banners / hints ---
let bannerTimer = 0;
export function showBanner(title, sub, kind) {
  const b = $('banner');
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub || '';
  b.className = 'show ' + (kind || 'info');
  clearTimeout(bannerTimer);
}
export function clearBanner() {
  $('banner').className = '';
}
function showTimed(id, text, ms) {
  const el = $(id);
  el.textContent = text;
  el.className = 'show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, ms);
}
export function showHint(text) { showTimed('hint', text, 4000); }
export function showCallout(text) { showTimed('callout', text, 3500); }

// --- kill feed / hitmarkers / damage ---
export function addFeed(sim, attacker, victim, weaponName, isHead) {
  const feed = $('feed');
  const teamClass = (c) => (c.team === 'salvage' ? 'teal' : 'orange');
  const a = attacker ? `<span class="${teamClass(attacker)}">${escapeHtml(attacker.name)}</span>` : '';
  const v = `<span class="${teamClass(victim)}">${escapeHtml(victim.name)}</span>`;
  const div = document.createElement('div');
  div.innerHTML = `${a} <span class="feed-weapon">[${escapeHtml(weaponName)}${isHead ? ' ☠' : ''}]</span> ${v}`;
  feed.prepend(div);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
}

let hitTimer = 0;
export function hitmarker(isKill, isWallbang) {
  const h = $('hitmarker');
  h.className = 'on' + (isKill ? ' kill' : '') + (isWallbang ? ' wallbang' : '');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => { h.className = ''; }, 160);
}

export function damageNumber(toScreen, x, y, z, dmg, isHead) {
  const pos = toScreen(x, y, z);
  if (!pos) return;
  const el = document.createElement('div');
  el.className = 'dmg-num' + (isHead ? ' head' : '');
  el.textContent = Math.round(dmg);
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
  $('dmg-numbers').appendChild(el);
  setTimeout(() => el.remove(), 700);
}

export function flashDamage() {
  const v = $('dmg-vignette');
  v.style.opacity = '1';
  setTimeout(() => { v.style.opacity = '0'; }, 180);
}

export function setHitDir(deg) {
  const h = $('hitdir');
  h.style.transform = `translate(-50%,-50%) rotate(${deg}deg)`;
  h.style.opacity = '1';
  clearTimeout(h._t);
  h._t = setTimeout(() => { h.style.opacity = '0'; }, 600);
}

export function setFlashWhite(amount) {
  $('flash-white').style.opacity = String(amount);
}

export function setPlantBar(show, label, frac) {
  const bar = $('plant-bar');
  if (!show) { bar.className = ''; return; }
  bar.className = 'show';
  $('plant-label').textContent = label;
  $('plant-fill').style.width = Math.round(frac * 100) + '%';
}

// --- HUD refresh (called at 10 Hz and after every phase change) ---
export function updateHud(sim) {
  const p = sim.player;
  if (!p) return;
  $('health').textContent = Math.max(0, Math.ceil(p.hp));
  $('health').className = p.hp <= 30 ? 'low' : '';
  $('armor').textContent = p.loadout.armor > 0
    ? `ARMOR ${Math.ceil(p.loadout.armor)}${p.loadout.helmet ? ' + HELMET' : ''}`
    : (p.loadout.helmet ? 'HELMET' : 'NO ARMOR');
  $('kit').textContent = p.loadout.defuseKit ? 'DEFUSE KIT' : '';
  $('kit').style.display = p.loadout.defuseKit ? 'block' : 'none';
  const def = WEAPONS[p.loadout.current];
  const ammo = p.loadout.weapons[p.loadout.current];
  $('weapon-name').textContent = def.name;
  $('ammo-mag').textContent = ammo ? ammo.mag : 0;
  $('ammo-reserve').textContent = ammo ? ammo.reserve : 0;
  $('money').textContent = '$' + p.loadout.money;
  $('util-flash').textContent = 'FLASH ×' + p.loadout.flash;
  $('util-smoke').textContent = 'SMOKE ×' + p.loadout.smoke;
  $('util-fire').textContent = 'FIRE ×' + p.loadout.fire;
  // Score, timer, round, halftime.
  $('score-salvage').textContent = sim.score.salvage;
  $('score-harbour').textContent = sim.score.harbour;
  $('timer').textContent = sim.phase === PHASE.LIVE || sim.phase === PHASE.BUY
    ? String(Math.max(0, Math.ceil(sim.phaseT)))
    : '—';
  $('round-label').textContent = 'ROUND ' + sim.round + ' / ' + MAX_ROUNDS
    + (sim.half === 2 ? ' · 2ND HALF' : ' · 1ST HALF');
  // Round history dots from the player's side.
  $('round-history').textContent = sim.roundHistory.map((r) => (r === 'W' ? '●' : '○')).join(' ');
  // Alive counts.
  const all = [p, ...sim.bots];
  $('alive-salvage').textContent = all.filter((c) => c.team === 'salvage' && c.alive).length;
  $('alive-harbour').textContent = all.filter((c) => c.team === 'harbour' && c.alive).length;
  // Bomb status line.
  const bomb = sim.bomb;
  let bombText = '';
  if (bomb.state === 'planted') bombText = `CHARGE PLANTED — SITE ${bomb.site} · ${Math.ceil(bomb.timer)}s`;
  else if (bomb.state === 'dropped') bombText = 'CHARGE DROPPED — pick it up';
  else if (bomb.state === 'carried') {
    bombText = bomb.carrierId === 'player' ? 'YOU CARRY THE CHARGE' : 'TEAMMATE CARRIES THE CHARGE';
  }
  $('bomb-status').textContent = bombText;
  drawMinimap(sim);
}

// --- minimap: the harbour from above, with live dots and the bomb ---
const MM_W = 168, MM_H = 132;
function drawMinimap(sim) {
  const cv = $('minimap');
  const ctx = cv.getContext('2d');
  if (cv.width !== MM_W) { cv.width = MM_W; cv.height = MM_H; }
  ctx.clearRect(0, 0, MM_W, MM_H);
  const sx = (x) => ((x - MAP.minX) / (MAP.maxX - MAP.minX)) * MM_W;
  const sz = (z) => ((z - MAP.minZ) / (MAP.maxZ - MAP.minZ)) * MM_H;
  // Yard.
  ctx.fillStyle = 'rgba(16,22,32,0.9)';
  ctx.fillRect(0, 0, MM_W, MM_H);
  // Water at the south edge.
  ctx.fillStyle = 'rgba(10,30,55,0.9)';
  ctx.fillRect(0, MM_H - 8, MM_W, 8);
  // Sites.
  for (const [site, color, label] of [[SITE_A, '#2fd8c8', 'A'], [SITE_B, '#ff7a3d', 'B']]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx(site.x), sz(site.z), 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, sx(site.x), sz(site.z));
  }
  // Bomb.
  if (sim.bomb.state === 'planted' || sim.bomb.state === 'dropped') {
    ctx.fillStyle = '#ff2222';
    ctx.beginPath(); ctx.arc(sx(sim.bomb.x), sz(sim.bomb.z), 4, 0, Math.PI * 2); ctx.fill();
  }
  // Smokes and fires.
  for (const s of sim.smokes) {
    ctx.fillStyle = 'rgba(200,200,200,0.35)';
    ctx.beginPath(); ctx.arc(sx(s.x), sz(s.z), 6, 0, Math.PI * 2); ctx.fill();
  }
  for (const f of sim.fires) {
    ctx.fillStyle = 'rgba(255,120,20,0.5)';
    ctx.beginPath(); ctx.arc(sx(f.x), sz(f.z), 5, 0, Math.PI * 2); ctx.fill();
  }
  // Combatants: the player is a white triangle, teammates teal, enemies orange.
  const all = [sim.player, ...sim.bots];
  for (const c of all) {
    if (!c || !c.alive) continue;
    const x = sx(c.x), y = sz(c.z);
    if (c === sim.player) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x - 4, y + 4);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = c.team === sim.player.team ? '#2fd8c8' : '#ff7a3d';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function renderMatchEnd(sim) {
  const playerTeam = sim.player ? sim.player.team : sim.attackTeam;
  const won = sim.winner === playerTeam;
  $('end-title').textContent = won ? 'SALVAGERS TAKE THE HARBOUR' : 'HARBOUR WATCH HOLDS THE LINE';
  $('end-sub').textContent = `Final score ${sim.score.salvage} — ${sim.score.harbour} · ` +
    `You: ${sim.stats.kills} kills, ${sim.stats.deaths} deaths, ` +
    `${Math.round(sim.stats.damage)} damage, ` +
    `${sim.stats.shots ? Math.round(100 * sim.stats.hits / sim.stats.shots) : 0}% accuracy` +
    (sim.stats.wallbangs ? `, ${sim.stats.wallbangs} wallbangs` : '');
  const rows = [['Player', 'K', 'D', 'Damage']];
  const all = [sim.player, ...sim.bots];
  for (const c of all) {
    rows.push([c.name, c.kills, c.deaths, Math.round(c.damageDealt)]);
  }
  const table = $('match-stats');
  table.innerHTML = rows.map((r, i) => {
    const tag = i === 0 ? 'th' : 'td';
    const cls = i > 0 ? (all[i - 1].team === 'salvage' ? ' class="teal"' : ' class="orange"') : '';
    return `<tr>${r.map((v, j) => `<${tag}${j === 0 ? cls : ''}>${j === 0 ? escapeHtml(String(v)) : v}</${tag}>`).join('')}</tr>`;
  }).join('');
}
