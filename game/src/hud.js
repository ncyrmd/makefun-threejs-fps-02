// hud.js — every DOM update: health/ammo/money, score, timer, minimap,
// kill feed, banners, buy menu and the match-end table. The simulation never
// touches the DOM directly; main.js calls these after each fixed step.
import { WEAPONS, BUY_ITEMS, giveWeapon } from './weapons.js';
import { MAP, SITE_A, SITE_B } from './map.js';

const $ = (id) => document.getElementById(id);

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function updateHud(state) {
  const p = state.player;
  if (!p) return;
  const def = WEAPONS[p.loadout.current];
  const ammo = p.loadout.weapons[p.loadout.current];
  $('health').textContent = Math.max(0, Math.ceil(p.hp));
  $('health').classList.toggle('low', p.hp <= 30);
  $('armor-val').textContent = Math.round(p.loadout.armor);
  $('helmet-val').textContent = p.loadout.helmet ? 'YES' : '—';
  $('weapon-name').textContent = def.name + (p.reloadT > 0 ? ' — RELOADING' : '');
  $('ammo').textContent = ammo ? ammo.mag : 0;
  $('ammo').classList.toggle('empty', !ammo || ammo.mag === 0);
  $('ammo-reserve').textContent = '/ ' + (ammo ? ammo.reserve : 0);
  $('money').textContent = '$' + p.loadout.money;
  $('score-blue').textContent = state.score.attack;
  $('score-red').textContent = state.score.defend;
  $('timer').textContent = fmtTime(state.phaseT);
  $('round-label').textContent = `ROUND ${Math.min(state.round, 9)}/9`;
  // alive pips
  const all = [p, ...state.bots];
  const aAlive = all.filter((c) => c.team === 'attack' && c.alive).length;
  const dAlive = all.filter((c) => c.team === 'defend' && c.alive).length;
  $('alive-blue').textContent = '●'.repeat(aAlive) + '○'.repeat(5 - aAlive);
  $('alive-red').textContent = '●'.repeat(dAlive) + '○'.repeat(5 - dAlive);
  const bomb = state.bomb;
  $('bomb-status').textContent =
    bomb.state === 'planted' ? `💣 PLANTED ${Math.ceil(bomb.timer)}s — ${bomb.site}` :
    bomb.state === 'dropped' ? '💣 CHARGE DROPPED — pick it up' :
    bomb.state === 'carried' && bomb.carrierId === 'player' ? '💣 YOU CARRY THE CHARGE' : '';
  drawMinimap(state);
}

export function drawMinimap(state) {
  const cv = $('minimap');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const sx = (x) => (x - MAP.minX) / (MAP.maxX - MAP.minX) * W;
  const sz = (z) => (z - MAP.minZ) / (MAP.maxZ - MAP.minZ) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(60,44,26,0.9)';
  ctx.fillRect(0, 0, W, H);
  // sites
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb02a'; ctx.fillText('A', sx(SITE_A.x), sz(SITE_A.z) + 4);
  ctx.fillStyle = '#ff5a2a'; ctx.fillText('B', sx(SITE_B.x), sz(SITE_B.z) + 4);
  // bomb
  if (state.bomb.state === 'planted') {
    const s = state.bomb.site === 'A' ? SITE_A : SITE_B;
    ctx.fillStyle = '#ff2222';
    ctx.beginPath(); ctx.arc(sx(s.x), sz(s.z), 5, 0, 7); ctx.fill();
  } else if (state.bomb.state === 'dropped') {
    ctx.fillStyle = '#ff2222';
    ctx.beginPath(); ctx.arc(sx(state.bomb.x), sz(state.bomb.z), 4, 0, 7); ctx.fill();
  }
  // smokes
  for (const s of state.smokes) {
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    ctx.beginPath(); ctx.arc(sx(s.x), sz(s.z), 7, 0, 7); ctx.fill();
  }
  // combatants
  const all = state.player ? [state.player, ...state.bots] : state.bots;
  for (const c of all) {
    if (!c.alive) continue;
    ctx.fillStyle = c.team === 'attack' ? '#4db2ff' : '#ff5a4d';
    ctx.beginPath(); ctx.arc(sx(c.x), sz(c.z), c.id === 'player' ? 4.5 : 3, 0, 7); ctx.fill();
    if (c.id === 'player') {
      // view cone
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx(c.x), sz(c.z));
      ctx.lineTo(sx(c.x) + Math.sin(-c.yaw) * 12 * -1, sz(c.z) + Math.cos(-c.yaw) * 12 * -1);
      ctx.stroke();
    }
  }
}

export function addFeed(state, killer, victim, weaponName, headshot) {
  const feed = $('feed');
  if (!feed) return;
  const div = document.createElement('div');
  const kc = killer.team === 'attack' ? 'blue' : 'red';
  const vc = victim.team === 'attack' ? 'blue' : 'red';
  div.innerHTML = `<span class="${kc}">${escapeHtml(killer.name)}</span> <span class="w">[${escapeHtml(weaponName)}${headshot ? ' ☠' : ''}]</span> <span class="${vc}">${escapeHtml(victim.name)}</span>`;
  feed.prepend(div);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

export function showBanner(title, sub, cls) {
  const t = $('banner-title'), s = $('banner-sub');
  t.textContent = title; t.className = cls || '';
  s.textContent = sub || '';
}
export function clearBanner() { showBanner('', '', ''); }

export function showHint(text, ms = 3500) {
  const h = $('hint');
  if (!h) return;
  h.textContent = text; h.hidden = false;
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => { h.hidden = true; }, ms);
}

export function hitmarker(kill) {
  const el = $('hitmarker');
  el.classList.add('on');
  el.classList.toggle('kill', !!kill);
  clearTimeout(hitmarker._t);
  hitmarker._t = setTimeout(() => el.classList.remove('on'), 110);
}

export function damageNumber(worldToScreen, x, y, z, amount, headshot) {
  const p = worldToScreen(x, y, z);
  if (!p) return;
  const span = document.createElement('span');
  span.textContent = Math.round(amount);
  if (headshot) span.classList.add('head');
  span.style.left = (p.x + (Math.random() - 0.5) * 30) + 'px';
  span.style.top = (p.y - 10) + 'px';
  $('dmgnums').appendChild(span);
  setTimeout(() => span.remove(), 750);
}

export function flashDamage() {
  const v = $('dmg-vignette');
  v.style.opacity = '1';
  setTimeout(() => { v.style.opacity = '0'; }, 130);
}

export function setFlashWhite(level) { $('flash-white').style.opacity = String(level); }

export function setPlantBar(show, label, frac) {
  const bar = $('plantbar');
  bar.style.display = show ? 'block' : 'none';
  if (show) {
    $('plant-label').textContent = label;
    $('plant-fill').style.width = Math.round(frac * 100) + '%';
  }
}

export function setHitDir(angleDeg) {
  const el = $('hitdir');
  el.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
  el.style.opacity = '1';
  clearTimeout(setHitDir._t);
  setHitDir._t = setTimeout(() => { el.style.opacity = '0'; }, 600);
}

// --- buy menu ---
export function renderBuy(state, onBuy) {
  const grid = $('buy-grid');
  grid.innerHTML = '';
  const p = state.player;
  $('buy-money').textContent = '$' + p.loadout.money;
  const slots = $('buy-slots');
  slots.innerHTML = '';
  const owned = Object.keys(p.loadout.weapons).map((id) => WEAPONS[id].name);
  for (const name of owned) {
    const d = document.createElement('div');
    d.className = 'slot' + (WEAPONS[p.loadout.current].name === name ? ' active' : '');
    d.innerHTML = `<b>${escapeHtml(name)}</b>owned`;
    slots.appendChild(d);
  }
  for (const item of BUY_ITEMS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buy-item';
    let ownedAlready = false;
    if (item.kind === 'weapon') ownedAlready = !!p.loadout.weapons[item.id];
    if (item.kind === 'gear' && item.id === 'armor') ownedAlready = p.loadout.armor >= 50;
    if (item.kind === 'gear' && item.id === 'helmet') ownedAlready = p.loadout.helmet;
    const cant = !ownedAlready && p.loadout.money < item.price;
    if (ownedAlready) btn.classList.add('owned');
    if (cant) btn.classList.add('cant');
    btn.innerHTML = `<span><span class="nm">${escapeHtml(item.name)}</span><br><span class="ds">${escapeHtml(item.desc)}</span></span><span class="pr">${ownedAlready ? 'OWNED' : '$' + item.price}</span>`;
    btn.addEventListener('click', () => onBuy(item));
    grid.appendChild(btn);
  }
}

export function applyBuy(state, item) {
  const p = state.player;
  if (!p) return false;
  if (item.kind === 'weapon') {
    if (p.loadout.weapons[item.id]) return false;
    if (p.loadout.money < item.price) return false;
    p.loadout.money -= item.price;
    giveWeapon(p.loadout, item.id);
    return true;
  }
  if (item.id === 'armor') {
    if (p.loadout.armor >= 50 || p.loadout.money < item.price) return false;
    p.loadout.money -= item.price; p.loadout.armor = 50; return true;
  }
  if (item.id === 'helmet') {
    if (p.loadout.helmet || p.loadout.money < item.price) return false;
    p.loadout.money -= item.price; p.loadout.helmet = true; return true;
  }
  if (item.id === 'flash') {
    if (p.loadout.money < item.price) return false;
    p.loadout.money -= item.price; p.loadout.flash++; return true;
  }
  if (item.id === 'smoke') {
    if (p.loadout.money < item.price) return false;
    p.loadout.money -= item.price; p.loadout.smoke++; return true;
  }
  if (item.id === 'ammo') {
    if (p.loadout.money < item.price) return false;
    p.loadout.money -= item.price;
    for (const id of Object.keys(p.loadout.weapons)) {
      p.loadout.weapons[id].reserve = WEAPONS[id].reserve;
    }
    return true;
  }
  return false;
}

export function renderMatchEnd(state) {
  $('end-title').textContent = state.winner === 'attack' ? 'WARDENS WIN THE MATCH' : 'EMBERJACKS WIN THE MATCH';
  $('end-sub').textContent = `Final score ${state.score.attack} — ${state.score.defend} · ` +
    `You: ${state.stats.kills} kills, ${state.stats.deaths} deaths, ` +
    `${Math.round(state.stats.damage)} damage, ` +
    `${state.stats.shots ? Math.round(100 * state.stats.hits / state.stats.shots) : 0}% accuracy`;
  const rows = [['Player', 'K', 'D', 'Damage']];
  const all = [state.player, ...state.bots];
  for (const c of all) {
    rows.push([c.name, c.kills, c.deaths, Math.round(c.damageDealt)]);
  }
  const table = $('match-stats');
  table.innerHTML = rows.map((r, i) => {
    const tag = i === 0 ? 'th' : 'td';
    const cls = i > 0 ? (all[i - 1].team === 'attack' ? ' class="blue"' : ' class="red"') : '';
    return `<tr>${r.map((v, j) => `<${tag}${j === 0 ? cls : ''}>${j === 0 ? escapeHtml(String(v)) : v}</${tag}>`).join('')}</tr>`;
  }).join('');
}
