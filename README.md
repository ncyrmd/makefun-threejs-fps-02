# BLACKTIDE — Night Harbor Tactical FPS

A round-based, Counter-Strike-style tactical FPS in three.js, built for the
make.fun **threejs-fps-02** competition. Fully original map, art, sounds and
names; runs offline from static files with no build step and no network
request.

## The game

You are a **Salvager** hitting the night harbour with four bot teammates
against five **Harbour Watch** defenders. First crew to **5 rounds** wins the
match (max 9 rounds). At halftime the sides swap: you attack in the first
half and defend in the second.

- **Objective:** plant the charge at **Site A** (warehouse interior) or
  **Site B** (crane dock) and defend it for 35 seconds — or eliminate the
  whole enemy crew. Defenders win by stopping the plant, defusing it (5 s
  channel, 2.5 s with a defuse kit), or running out the clock.
- **Economy:** $800 start, $300 per kill, $3,250 per round win, $1,900 per
  loss (+streak bonus). Spend it in the buy menu (`B`) during the 15 s buy
  phase. Bots buy by the same economy: rifles after a win, a save after a
  loss streak.
- **Weapons:** P9 Sidearm (free), Viper SMG ($1,100), Mule Shotgun ($1,700),
  VK-47 Rifle ($2,700), Maul LMG ($3,400, 60-round belt), Longbow DMR
  ($4,200, scoped). Plus Kevlar vest, helmet, a defuse kit, flashbangs,
  smoke grenades and incendiaries.
- **Gunplay:** hitscan with deterministic spray patterns (the rifle climbs,
  then drifts — drag against it), headshot multipliers, armor + helmet
  damage model, range falloff, tracers, muzzle flash, hitmarkers, damage
  numbers, hit-direction indicator. Thin cover — crates, container walls —
  can be shot through at half damage (wallbang, amber hitmarker); warehouse
  steel stops rounds cold. Getting hit tags you: you move slower for a
  moment, so the first shot wins the peek. Stopping to aim pays: moving,
  jumping and spraying all widen spread.
- **Movement:** acceleration-based WASD, walk (Shift, accurate), crouch
  (Ctrl), jump (Space), AABB collision with the map, ADS zoom on the DMR.
- **Bot AI:** roles (entry, AWP, lurk, support, anchor, rotator), a
  waypoint graph, coordinated site executes (support smokes the entrance,
  entry flashes over it, the squad pushes together), site holds, reaction
  delays, distance-based aim error, burst fire, strafing in fights, planting,
  defusing, retreating to the bomb, smoke/flash/fire awareness, and rotation
  toward gunfire they hear. Fair, not aimbot.
- **HUD:** health/armor, ammo, money, round score + timer + round history,
  alive counts, kill feed, minimap with live positions and bomb status,
  dynamic crosshair, plant/defuse progress bar, death cam (spectate a
  teammate).
- **Presentation:** night container port — cold moonlight, amber
  floodlights, fog, a moored ship on the water, a gantry crane over Site B,
  neon signs, procedural canvas textures (wet asphalt, corrugated steel,
  painted containers), synthesized WebAudio gunfire (no audio files),
  round-win/lose stings, and the crane horn that opens the match.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (pointer lock) |
| Click | Fire (hold for auto weapons) |
| Right-click | Aim / DMR scope |
| R | Reload |
| 1 / 2 / 3 | Weapon slots |
| Shift | Walk (accurate) |
| Ctrl / C | Crouch |
| Space | Jump |
| B | Buy menu (buy phase) |
| 4 / 5 / 6 | Flashbang / smoke / incendiary |
| E | Plant charge / defuse (hold) |
| Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open the page in desktop Chrome, click **DEPLOY**, and play. No network
request is made; three.js 0.187.0 is vendored under
`game/vendor/three/`.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the
output directory and writes `dossier.json` with
`vendor/makefun-threejs.ts`.

## Layout

```text
game/index.html        HUD, menus, import map
game/src/main.js       bootstrap, fixed-step loop, player, round flow
game/src/state.js      central match state, halftime side swap
game/src/map.js        Night Harbor: colliders, waypoints, LOS, scene
game/src/weapons.js    weapon defs, spray patterns, economy, buy catalogue
game/src/combat.js     hitscan, penetration, tagging, grenades, bomb
game/src/bots.js       bot AI: roles, executes, economy, ears, fire sense
game/src/audio.js      synthesized WebAudio sounds
game/src/hud.js        HUD, minimap, buy menu, match-end table
game/src/textures.js   procedural canvas textures
game/vendor/three/     three.js 0.187.0 (vendored, byte-for-byte)
```

## License

MIT — see `LICENSE`.
