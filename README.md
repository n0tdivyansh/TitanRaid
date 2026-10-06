# Titan Raid - 3D Crowd Runner

A fast-paced, browser-native 3D crowd-runner: steer a growing army of runners through math gates, dodge hazards, smash through enemy squads, defeat the boss at the finish line, then stack the crew into a pyramid and launch it up the rainbow multiplier stairs.

Built with **Three.js + Vite** and fully integrated with the **CrazyGames SDK v3**. Almost everything is generated in code - geometry, textures, UI and procedural WebAudio sound effects. The one exception is the bosses: ten animated CC0 monster models (see [Credits](#credits)).

## Run & Build

```bash
npm install
npm run dev        # local dev server with CrazyGames SDK fallback
npm run build      # production bundle in dist/ (with relative base ./ for iframes)
npm run preview    # preview production build locally
npm run package    # builds dist/ and packages titan-raid.zip
```

### CrazyGames Developer Portal Submission
1. Run `npm run package`.
2. Upload `titan-raid.zip` to the [CrazyGames Developer Portal](https://developer.crazygames.com/).
3. The bundle includes CrazyGames SDK v3 lifecycle hooks, midgame interstitial ads, rewarded ads (+35% end reward, +250 free shop coins, revive +30 runners), happytime celebrations, and automatic audio/gameplay pause on tab switch.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move the crowd | `A` / `D` or arrow keys, or drag with the mouse | swipe / drag |
| Pause | `Esc` or the pause button | pause button |
| Start | `Space` or PLAY | tap PLAY |

## Game loop

1. **Run** - the crowd auto-runs forward; you only steer left/right.
2. **Gates** - every gate pair applies `+n`, `-n`, `xn` or `/n` to your head-count.
   Green/blue grow the army, red/orange shrink it.
3. **Hazards** - saws, walls, spike rows, swinging hammers and rollers chew through
   the part of the crowd that touches them (damage is proportional to the crowd, and
   a single hazard can never take more than ~half of it).
4. **Enemy squads** - red squads annihilate your runners one for one; a bigger crowd wins.
5. **Boss** - a monster past the finish line has an HP number. Your crowd trades bodies
   for damage, so arrive with more runners than its HP. There are ten bosses (Orc,
   Demon, Yeti, Blue Demon, Mushroom King, Dragon, Dino, Tribal, Alien, Goleling),
   one per level in rotation; each idles, attacks when the fight starts and plays its
   own death animation.
6. **Finale** - the survivors climb the multiplier staircase (x2.0, x2.2, x2.4 ...),
   leaving a cluster on every step. The counter over the lead group ticks down as
   runners stay behind; how far the stack climbs depends on the size of the army, and
   the step it stops on is the coin multiplier.

## Progression

- Levels are procedurally generated from their number with a seeded RNG, so a retry
  replays the identical track. Each level draws one of five archetypes - CLASSIC,
  GAUNTLET, RUSH, SIEGE, TREASURE - over eight environment themes, and difficulty
  climbs every level: speed, track length, hazard count and severity, squad size,
  harsher gate pairs (including both-bad choices from level 5) and boss HP, all
  tracked against a per-level target crowd size so levels stay winnable.
- Coins are earned from pickups plus `crowd * multiplier * 0.35`.
- Clearing a level fills the skin bar by 10%; a full bar unlocks a free skin. More
  skins are buyable with coins in the SKINS shop.
- Progress (level, coins, best crowd, skins, sound) persists in `localStorage`
  and CrazyGames cloud storage under `swarm.slayer.save.v1`.

## Layout

```
src/
  core/      engine (three.js bootstrap + loop), input, audio, save, rng
  world/     stickman instancing + vertex-shader run cycle, crowd, track,
             props (gates/coins/hazards/enemies/stairs + code-built fallback bosses),
             bossModels (glTF boss loader/animation), effects, textures, materials
  game/      level generator, game state machine
  ui/        DOM overlay (HUD, menus, screens), skin catalogue
public/
  models/bosses/   the ten boss .glb files + their licence
```

### Look

Toon-shaded (banded) materials with a soft rim light, gradient sky dome, drifting
clouds, sun shadows and a light bloom/vignette grade. Runners are rounded capsule
characters, ~450 triangles each, instanced, shaded darker at the feet with a rim
highlight so big crowds read as individuals.

Surfaces use textures drawn at startup on a canvas: worn concrete road with rumble-strip
curbs, patchy grass/sand with tufts, glass gates with sign boards, stone-block stairs
with capstones, brushed/scratched metal and hazard stripes on obstacles, two-tier pines
and textured rocks. The glTF bosses use standard (PBR) materials lit by a soft studio
environment map; everything else stays toon-shaded.

On tall phone screens the camera widens and pulls back so the whole crowd stays in frame.

If a boss model fails to load, that level falls back to a code-built boss, so the game
never breaks on a missing file.

### Performance notes

- The whole army is a single `InstancedMesh`; the run cycle (legs, arms, bob) happens
  in the vertex shader via per-instance `aPhase`/`aAnim` attributes, so 1600 runners
  cost no per-frame CPU animation work (~3.6 ms/frame with 1400 runners, ~630k triangles).
- Ragdolls, particles, floating text and coins are pooled instanced meshes.

### Debug hooks

`window.__ccl` exposes `{ engine, game, ui, save, step(frames), setAxis(-1|0|1) }`
for deterministic stepping - handy for automated checks in a headless browser.

## Credits

Boss models: **"Ultimate Monsters" by [Quaternius](https://quaternius.com)**, via
poly.pizza. Licence: CC0 1.0 (public domain) - free for any use, including commercial,
no attribution required. See `public/models/bosses/LICENSE.txt`.
