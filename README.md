# EMBERLINE — Dusk Outpost Tactical FPS

A round-based, Counter-Strike-style tactical FPS in three.js, built for the
make.fun **threejs-fps-02** competition. Fully original map, art, sounds and
names; runs offline from static files with no build step and no network
request.

## The game

You are a **Warden** attacking the Dusk Outpost with four bot teammates
against five **Emberjack** defenders. First team to **5 rounds** wins the
match (max 9 rounds).

- **Objective:** plant the charge at **Site A** or **Site B** and defend it
  for 35 seconds — or eliminate the whole enemy team. Defenders win by
  stopping the plant, defusing it (5 s channel), or running out the clock.
- **Economy:** $800 start, $300 per kill, $3,250 per round win, $1,900 per
  loss (+streak bonus). Spend it in the buy menu (`B`) during the 15 s buy
  phase.
- **Weapons:** P9 Sidearm (free), Raptor SMG ($1,200), Mule Shotgun
  ($1,800), VK-47 Rifle ($2,700), Longbow DMR ($4,200, scoped). Plus Kevlar
  vest, helmet, flashbangs and smoke grenades.
- **Gunplay:** hitscan with spread/recoil/bloom, headshot multipliers,
  armor + helmet damage model, range falloff, tracers, muzzle flash,
  hitmarkers, damage numbers, hit-direction indicator. Stopping to aim pays:
  moving, jumping and spraying all widen spread.
- **Movement:** acceleration-based WASD, walk (Shift, accurate), crouch
  (Ctrl), jump (Space), AABB collision with the map, ADS zoom on the DMR.
- **Bot AI:** waypoint-graph navigation, site pushes, angle holds, reaction
  delays, distance-based aim error, burst fire, strafing in fights, planting,
  defusing, retreating to the bomb, and smoke/flash awareness. Fair, not
  aimbot.
- **HUD:** health/armor, ammo, money, round score + timer, alive counts,
  kill feed, minimap with live positions and bomb status, dynamic crosshair,
  plant/defuse progress bar, death cam (spectate a teammate).
- **Presentation:** dusk desert outpost — amber sun, long shadows, procedural
  canvas textures (cracked earth, weathered walls, crates), synthesized
  WebAudio gunfire (no audio files), round-win/lose stings.

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
| 4 / 5 | Flashbang / smoke |
| E | Plant charge / pick it up (hold) |
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

```
game/index.html        HUD, menus, import map
game/src/main.js       bootstrap, fixed-step loop, player, round flow
game/src/state.js      central match state
game/src/map.js        Dusk Outpost: colliders, waypoints, LOS, scene
game/src/bots.js       bot AI + bot meshes
game/src/combat.js     hitscan, damage, grenades, bomb objective
game/src/weapons.js    weapon defs + economy + buy catalogue
game/src/audio.js      synthesized WebAudio sounds
game/src/hud.js        HUD, minimap, buy menu, match-end table
game/src/textures.js   procedural canvas textures
game/vendor/three/     three.js 0.187.0 (vendored, byte-for-byte)
```

## License

MIT — see `LICENSE`.
