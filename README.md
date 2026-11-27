# Bomb Tag Arena

**Pass the bomb. Dodge your friends. Be the last one standing.**

A real-time multiplayer party game for 2-8 players that runs entirely in the
browser. One player holds a ticking bomb; touching another player passes it to
them. When the fuse runs out, the holder explodes. The last player standing
wins the round.

![Release](https://img.shields.io/badge/release-v1.1.0-83f9cf)
![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933)
![Stack](https://img.shields.io/badge/stack-Express%205%20%2B%20ws-11141e)
![License](https://img.shields.io/badge/license-all%20rights%20reserved-lightgrey)

**Play now:** [bomb-tag-arena.onrender.com](https://bomb-tag-arena.onrender.com/)


## Overview

Bomb Tag Arena is a server-authoritative WebSocket game with no accounts, no
database, no API keys and no build step. A player creates a room, shares a
six-character code or invite link, and friends join from any modern browser,
on phones or computers. All game rules (movement, tagging, bomb timers,
eliminations and scoring) are owned by the server, so every player sees the
same authoritative match.

## Features

### Gameplay

- Classic hot-potato bomb tag for 2-8 players per room
- Proximity tagging with a 1-second tag-back shield that stops instant
  returns; passing the bomb never resets the fuse
- Fuse that shortens as players are eliminated, raising the pressure each
  round
- Dash with a 3-second recharge for last-second escapes
- Elimination, spectating for exploded and late-joining players, and instant
  rematches with a persistent round-win scoreboard for the session
- Automatic host migration when the host leaves

### Multiplayer

- Private rooms with six-character codes and copyable invite links
- No sign-up, no downloads: a nickname is all you need
- Host-gated round starts; rooms appear on first join and are deleted when
  empty
- Live match feed over the arena showing joins, leaves, tags, explosions and
  round winners
- Network badge with approximate round-trip time

### Interface and feedback

- Neon arena with an animated grid floor; the border glows green and pulses
  red as the fuse runs low
- Player glow, motion trails, ground shadows, facing direction and a marker
  above your own player
- Dash cooldown ring drawn around your player
- Pulsing bomb with a sparking fuse and a fuse ring showing time left; a red
  heartbeat vignette speeds up under 3 seconds
- Shockwaves, particles, screen shake, flash and floating "TAGGED!" / "BOOM!"
  text, plus confetti for the round winner
- Animated 3-2-1 countdown overlay
- Procedural sound effects (tag, dash, countdown, go, explosion, win, fuse
  ticking) built on the Web Audio API, with a mute toggle saved in the browser
- Vibration feedback on supported phones for tags, explosions and wins
- Touch joystick and dash button for phones, restyled for thumbs; canvas
  renders at up to 2x device pixel ratio with capped particles

### Engineering

- Server-authoritative simulation at 30 ticks per second with 15 state
  broadcasts per second; the client only sends input
- Client-side snapshot interpolation for smooth motion
- Strict input validation and rate limiting on the server
- Security headers (CSP, nosniff, referrer and permissions policy) on every
  response
- Single-process, in-memory room directory; no external services required

## How to play

1. Open the [live game](https://bomb-tag-arena.onrender.com/) and pick a
   nickname.
2. **Create a room**, then tap **Invite** to copy the room link, or read the
   six-character room code to your friends.
3. Once at least two players have joined, the host taps **Start round**.
4. Run from the bomb. Touch another player to pass it. Survive.
5. Tap **Play again** for a rematch. Round wins stay on the scoreboard until
   you leave.

### Controls

| Device          | Move                | Dash        |
| --------------- | ------------------- | ----------- |
| Phone or tablet | On-screen joystick  | DASH button |
| Computer        | WASD or arrow keys  | Space       |

Sound starts after your first tap or key press, as required by browser
autoplay policies. Keep the game tab open while playing; browsers pause
background tabs, and switching away is not a pause for the other players.

## Tech stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Server   | Node.js 22+, Express 5 (static hosting + health)  |
| Realtime | `ws` 8 (WebSocket server, no fallback transport)  |
| Client   | Vanilla ES modules, Canvas 2D, Web Audio API      |
| Styling  | Hand-written CSS, no framework                    |
| Testing  | `node --test` unit tests, Playwright browser test |
| Hosting  | Render Web Service (free plan), `render.yaml`     |

No bundler, transpiler or framework is used on either side; the repository
runs exactly as written.

## Project structure

```text
bomb-tag-arena/
├── public/                    # Static client, served by Express
│   ├── index.html             # Home screen, room shell, accessible controls
│   ├── style.css              # Responsive layout, neon theme, touch controls
│   └── game.js                # Canvas renderer, input, sound, effects,
│                              #   WebSocket client with interpolation
├── src/
│   ├── arena.js               # Server-authoritative room and game rules
│   └── server.js              # HTTP server, WebSocket upgrades, room
│                              #   lifecycle, security headers, rate limits
├── test/
│   └── arena.test.js          # Unit tests for the game rules
├── scripts/
│   └── verify-browser.mjs     # Two-browser end-to-end check (Playwright)
├── render.yaml                # Render Blueprint (free plan configuration)
├── package.json               # Scripts and dependencies
├── package-lock.json          # Locked dependency tree
└── .gitignore
```

## Architecture

### Server-authoritative model

The browser never sends positions or scores. It sends **direction and dash
input only**; the server simulates the world and broadcasts snapshots.

```
Browser                    Server (one process owns all rooms)
  |  input {x, y, dash}       |
  | ------------------------> |  validate, clamp, rate-limit
  |                           |  simulate at 30 ticks/s
  |  state snapshot (15/s)    |  collisions, tags, fuse, eliminations
  | <------------------------ |
  |  interpolate + render     |
```

- The **simulation tick** runs at 30 Hz; every second tick (15 Hz) the room
  state is serialized and broadcast to every socket in the room.
- The client keeps the two most recent snapshots and interpolates positions
  for display, so motion stays smooth at any frame rate.
- A client that sends no message for 45 seconds is disconnected; the client
  sends keepalive pings while its tab is active.
- A reconnect is a fresh join: a new player id is issued and previous wins
  are not carried over.

### Room lifecycle

1. The first upgrade request for a valid room code creates the room in
   memory; the creator becomes the host.
2. `lobby` -> `countdown` (3.5 s) -> `playing` -> `finished`; **Play again**
   returns the room to `countdown`.
3. When the last player leaves, the room and its game timer are destroyed.
4. Hard caps: 8 players per room, 100 rooms per process, 24 sockets per IP.

## Data schema and protocol

All room state lives in server memory. There is no database; the schema below
describes the in-memory structures and the wire protocol between client and
server.

### Connection

```
wss://<host>/room/{CODE}?name={NICKNAME}
```

- `CODE`: six characters, `A-Z` and `2-9` (no ambiguous characters)
- `NICKNAME`: up to 14 characters; letters, numbers, spaces, `_` and `-`
  (sanitized server-side)

Rejected upgrades are answered over HTTP before the socket opens:

| Response | Reason                                  |
| -------- | --------------------------------------- |
| `400`    | Malformed room code                     |
| `429`    | More than 24 open sockets from one IP   |
| `503`    | Room full (8) or server full (100 rooms)|

### Player schema

One entry per connected player, broadcast inside every state snapshot.

| Field       | Type    | Description                                       |
| ----------- | ------- | ------------------------------------------------- |
| `id`        | string  | 8-character id, assigned by the server on join    |
| `name`      | string  | Sanitized nickname (max 14 chars)                 |
| `x`, `y`    | number  | Position in arena units (arena is 960 x 600)      |
| `alive`     | boolean | `false` after exploding; spectates until rematch  |
| `wins`      | number  | Rounds won this session                           |
| `color`     | string  | Player accent color (hex), from an 8-color palette|
| `dashReady` | number  | Epoch ms when the dash recharges                  |
| `dashUntil` | number  | Epoch ms when the active dash burst ends          |

The server additionally keeps private per-player fields (`dx`, `dy`,
`lastSeen`, `joined`, `inputAt`) that are never broadcast.

### Room state schema

Broadcast to every socket in the room 15 times per second.

| Field      | Type           | Description                                        |
| ---------- | -------------- | -------------------------------------------------- |
| `type`     | `"state"`      | Message discriminator                              |
| `now`      | number         | Server clock (epoch ms); clients compute an offset |
| `phase`    | string         | `lobby` \| `countdown` \| `playing` \| `finished`  |
| `round`    | number         | Current round number, starting at 1                |
| `deadline` | number         | Epoch ms of the next phase change or explosion     |
| `holder`   | string \| null | Player id currently holding the bomb               |
| `host`     | string         | Player id allowed to start rounds                  |
| `winner`   | string \| null | Player id of the round winner (`finished` only)    |
| `retag`    | number         | Epoch ms when tagging is allowed again             |
| `event`    | string         | Human-readable feed line for the latest event      |
| `players`  | Player[]       | Every connected player (see player schema)         |

### Client-to-server messages

| Message                              | Purpose                                      |
| ------------------------------------ | -------------------------------------------- |
| `{type:"input", x, y, dash}`         | Direction vector (clamped to [-1,1]) + dash  |
| `{type:"start"}`                     | Start a round (host only, needs 2+ players)  |
| `{type:"ping", t}`                   | Keepalive and latency probe                  |

Messages are JSON, at most 200 bytes, at most one input per 25 ms; anything
malformed is dropped.

### Server-to-client messages

| Message                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `{type:"welcome", id}` | Your assigned player id, sent on join        |
| `{type:"state", ...}`  | Authoritative room snapshot (see schema)     |
| `{type:"pong", t}`     | Reply to `ping`, echoes the client timestamp |

### WebSocket close codes

| Code   | Meaning                                          |
| ------ | ------------------------------------------------ |
| `1000` | Inactive for 45 seconds                          |
| `1008` | Room is full                                     |
| `1012` | Server restarting (deployment or restart)        |

### Game constants

| Constant                        | Value                                   |
| ------------------------------- | --------------------------------------- |
| Arena size                      | 960 x 600 units                         |
| Walk speed / dash speed         | 225 / 680 units per second              |
| Dash duration / cooldown        | 190 ms / 3 s                            |
| Tag radius / tag-back shield    | 47 units / 1 s                          |
| Initial fuse                    | 10 s                                    |
| Fuse after each explosion       | `max(6 s, 10 s − 0.75 s x eliminated)`  |
| Fuse when the holder disconnects| 7 s                                     |
| Countdown                       | 3.5 s                                   |
| Simulation / broadcast rate     | 30 Hz / 15 Hz                           |
| Players per room / rooms total  | 8 / 100                                 |

### Client-side storage

Only two `localStorage` keys are used: `bombtag-name` (nickname convenience)
and `bombtag-mute` (sound preference). Both are cleared by clearing site
data.

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) 22 or newer.

```sh
git clone https://github.com/riteshsah235/bomb-tag-arena.git
cd bomb-tag-arena
npm ci
npm start
```

Open `http://localhost:3000` in two browser windows to play against yourself.
To test on phones over the same Wi-Fi, open your computer's LAN IP on port
3000 (the firewall must allow it).

### npm scripts

| Command              | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `npm start`          | Run the server (`PORT` env var, default 3000)        |
| `npm run dev`        | Run with automatic restart on server file changes    |
| `npm test`           | Run the game-rule unit tests                         |
| `npm run format`     | Format sources with Prettier                         |
| `npm run test:browser` | Two-browser local end-to-end check (Playwright)    |

## Testing

- `npm test` covers room capacity, host-only starts, movement normalization
  and arena boundaries, tagging and the transfer shield, fuse preservation on
  tag, elimination, winner scoring, rematches, late joins, host transfer, and
  malformed input handling.
- `npm run test:browser` needs `npx playwright install chromium` once. It
  starts a local server and drives two isolated browser contexts, including a
  phone-sized touch session. Set `TEST_URL` to an HTTPS deployment to check a
  live instance instead.

Before calling a deployment ready, verify on the live URL with two separate
sessions: create and join by invite, start a round, see movement in both
sessions, pass the bomb, confirm both agree on the winner, rematch, and check
host migration by leaving as host.

## Deployment

The game is deployed on **Render** as a Web Service using the included
`render.yaml` Blueprint:

| Setting       | Value                        |
| ------------- | ---------------------------- |
| Runtime       | Node                         |
| Region        | Singapore                    |
| Plan          | Free                         |
| Build command | `npm ci --omit=dev`          |
| Start command | `npm start`                  |
| Health check  | `GET /health`                |

Notes:

- Deploy as a **Web Service**, not a static site: the game needs a long-lived
  WebSocket server.
- Keep the instance count at **one**. Rooms live in process memory; scaling
  out requires a shared room directory this version does not implement.
- Render's free plan sleeps after 15 minutes without traffic; the next
  visitor waits about a minute while it wakes. A restart or redeploy ends
  active rooms and resets scores.

## Security and privacy

- No accounts, emails or real names; nicknames are sanitized and never
  rendered as HTML.
- Room codes are invitations, **not authentication**: anyone with the code
  can join. There is no chat, camera, microphone or location access.
- Nothing about a match is persisted; all state vanishes when a room empties
  or the process restarts.
- Responses ship a Content Security Policy, `nosniff`, a no-referrer policy
  and a permissions policy disabling camera, microphone and geolocation.
- WebSocket payloads are capped at 256 bytes, sockets per IP at 24, and game
  logic is validated server-side.
- Never commit `.env` files, tokens, cookies or passwords. Keep Node.js and
  dependencies updated.

## Known limitations

- State is per-process: restarts and redeploys end every room and reset
  scores.
- Reconnects are manual and start a fresh player; wins do not survive them.
- Snapshot interpolation is not rollback netcode; distant players may see
  visible delay. The network badge shows approximate latency, not a guarantee.
- No bots, persistent leaderboards, room passwords or spectator-only mode.
- This is a casual prototype, not a hardened service: the built-in limits are
  basic resource guards, not DDoS defense or anti-cheat.

## Roadmap

- Reconnect tokens with a short grace period
- Optional room passwords
- Additional arenas and power-ups
- Accessibility options (reduced motion, high contrast)
- Room state that survives process restarts, for larger audiences

## Releases

| Version | Highlights                                                              |
| ------- | ----------------------------------------------------------------------- |
| v1.1.0  | Neon arena visuals, effects and live feed, procedural sound with saved mute, vibration, restyled touch controls, 2x canvas rendering |
| v1.0.0  | First playable release: rooms, bomb tag rules, dash, mobile controls    |

---

Built by [riteshsah235](https://github.com/riteshsah235). All rights reserved.
