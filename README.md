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

- Three modes: Open Planet exploration, online Planet Prix, and Stunt Planet
- Socket.io multiplayer rooms with server-ticked car inputs and snapshots
- Client prediction, lightweight reconciliation, reconnect, and remote cars
- Quaternion-based driving around a complete spherical planet
- Large deterministic planet with an approximately 80-second circuit
- One wide four-lane track with continuous containment barriers
- Small modern procedural sports car with selectable paint
- Track arches, boost strips, ramps, billboards, and signal towers
- Boundary-safe grip, handbrake drifting, boost, airtime, and scoring
- Smooth radial chase camera with speed-sensitive FOV and shake
- Twenty-four collectible golden bolts distributed around the circuit
- Eight-checkpoint timed island race with persistent personal best
- Clean daytime sky and night skies with twinkling stars, shooting stars,
  celestial bodies, and atmosphere
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
server/           Socket.io rooms and authoritative simulation
shared/           Versioned runtime-validated network protocol
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

Run the browser client and multiplayer server together:

```sh
npm run dev:full
```

The client runs on port 5173 and the multiplayer server on port 3001.

Production verification:

```sh
npm run typecheck
npm run typecheck:server
npm run test:unit
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

## Current scope

The multiplayer vertical slice supports real-time rooms, server simulation,
race countdowns, score events, shared exploration collectibles, snapshots,
remote cars, and reconnect handling. Production hosting still needs a
persistent Node.js service and should add durable identity, matchmaking,
results storage, moderation, and horizontally scalable room coordination.

## Deployment

The included GitHub Actions workflow builds and deploys `main` to:

`https://imshekhu.github.io/tinyroads/`

In repository settings, select **GitHub Actions** as the Pages source. Each push
to `main` then publishes the verified production bundle automatically.

GitHub Pages hosts only the static client. Set `VITE_MULTIPLAYER_URL` to a
separately deployed persistent server; see `.env.example`.
