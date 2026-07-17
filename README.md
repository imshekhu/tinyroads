# Tiny Roads

A cozy arcade driving adventure on a living little planet. Drift around a
procedural spherical world, collect golden bolts, and chase your fastest lap.

Tiny Roads is an original clean-room project inspired by the broad idea of
small-world exploration games. It does not copy source code or assets from its
references.

## Play

| Input | Action |
| --- | --- |
| W / Arrow Up | Accelerate |
| S / Arrow Down | Brake and reverse |
| A/D or Left/Right | Steer |
| Space | Handbrake drift |
| Shift | Boost |
| R | Return to the nearest road |
| M | Toggle sound |

Touch controls and standard gamepads are supported.

## Features

- Quaternion-based driving around a complete spherical planet
- Deterministic terrain, ocean, villages, forests, and a three-route track network
- Original low-poly procedural car with selectable paint
- Coast circuit, highland loop, and coloured connector shortcut
- Track arches, guard rails, boost strips, billboards, signal towers, and AI traffic
- Arcade grip, off-road drag, handbrake drifting, boost, and drift scoring
- Smooth radial chase camera with speed-sensitive FOV and shake
- Twenty-four collectible golden bolts spread across every route
- Eight-checkpoint timed island race with persistent personal best
- Gradient day, sunset, and night skies with twinkling stars, shooting stars,
  celestial bodies, atmosphere, and moving clouds
- Procedural Web Audio engine and event sounds—no bundled audio assets
- Responsive desktop, touch, and gamepad controls
- Reduced-motion and keyboard-accessible UI

## Architecture

```text
src/
├── audio/       Procedural Web Audio
├── camera/      Radial chase camera
├── core/        Game lifecycle and update loop
├── gameplay/    Collectibles and race state
├── input/       Keyboard, touch, and gamepad controls
├── math/        Spherical movement and tangent frames
├── ui/          Start screen, HUD, and accessibility
├── vehicle/     Car physics, mesh, and drift smoke
└── world/       Terrain, roads, props, sky, and seeded noise
```

The player position is a unit surface normal. Movement advances that normal
along a great-circle arc while the local forward vector is parallel transported
into the new tangent plane. This avoids pole singularities and keeps the car,
camera, and road aligned anywhere on the planet.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Production verification:

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

## Current scope

This first milestone is intentionally single-player. Gameplay systems are
separated from rendering and input so a later multiplayer version can introduce
server-authoritative input simulation without replacing the world or UI.

## Deployment

The included GitHub Actions workflow builds and deploys `main` to:

`https://imshekhu.github.io/tinyroads/`

In repository settings, select **GitHub Actions** as the Pages source. Each push
to `main` then publishes the verified production bundle automatically.
