# Bomb Tag

A small real-time browser party game for **2-8 friends**. One player has a ticking bomb. Touch someone else to pass it before it explodes. The last player standing wins.

No game accounts, downloads, database, API keys, paid services, or build pipeline are required to run the code.

## Play with friends

1. Open the deployed game and choose a nickname.
2. Select **Create a room**.
3. Select **Invite** to copy the room link and send it to your friends. They can also enter the six-character room code on the homepage.
4. Once at least two players have joined, the host selects **Start round**.
5. Stay away from the bomb, pass it by touching another player, and try to survive.
6. Select **Play again** for a rematch. Round wins stay on the scoreboard until you leave.

### Controls

| Device          | Move               | Dash        |
| --------------- | ------------------ | ----------- |
| Phone or tablet | Left thumbstick    | DASH button |
| Computer        | WASD or arrow keys | Space       |

Dashes recharge every three seconds. Tagging has a one-second transfer shield to stop instant tag-backs. Passing the bomb does **not** reset the fuse. When someone explodes, a random survivor gets the next bomb. The fuse becomes shorter as the field shrinks.

Players joining during a round spectate until the next round. If the host leaves, the next connected player becomes the host. Keep the game tab open and your phone awake; background tabs may be disconnected.

## Run locally

Install [Node.js](https://nodejs.org/) 22 or newer, then run:

```sh
npm ci
npm start
```

Open `http://localhost:3000` in two browser windows to play. To test on phones connected to the same Wi-Fi, open your computer's local-network IP on port 3000. Your firewall must allow that port. For friends on different networks, deploy the server as described below.

Useful commands:

```sh
npm run dev             # Restart the server automatically when server files change
npm test                # Run the game-rule unit tests
npm run format          # Format the source files
npm run test:browser    # Run the two-browser local check (see below)
```

The server listens on `0.0.0.0` and uses the hosting platform's `PORT` environment variable, falling back to `3000`.

## Deploy on Render, free plan

This app uses a long-lived WebSocket server. Deploy it as a **Web Service**, not a static site. Vercel Functions are not a drop-in host for this server.

1. Push this repository to your GitHub account.
2. Sign in to [Render](https://dashboard.render.com/) and select **New > Web Service**.
3. Connect only this repository, or choose it from your existing connection.
4. Choose these settings:

   | Setting       | Value                                                      |
   | ------------- | ---------------------------------------------------------- |
   | Runtime       | Node                                                       |
   | Branch        | main                                                       |
   | Region        | Singapore, or the closest available region to your players |
   | Build command | `npm ci --omit=dev`                                        |
   | Start command | `npm start`                                                |
   | Health check  | `/health`                                                  |
   | Instance type | **Free**                                                   |

5. Deploy and wait for the service to become live.
6. Open the HTTPS address Render gives you. Create a room and test with a friend before sharing more widely.

A `render.yaml` Blueprint is included with the same settings. No environment secrets are needed. Keep the instance count at one: rooms live in that process's memory. Horizontal scaling requires a shared room directory and state architecture that this first version does not implement.

### Free hosting limits

Render's free service sleeps after 15 minutes without inbound requests or WebSocket messages. The next visitor may wait about a minute for it to wake. Free instances share 750 instance hours per workspace per month. Outbound traffic and build minutes also have quotas. Without a payment method, exhausting relevant quotas can suspend the service or stop new builds. Do not attach a card or select a paid plan unless you intend to pay for usage.

Render may restart free instances. **A restart or deployment ends active rooms and resets scores.** This is a casual prototype, not an always-on competitive service. Check current hosting limits before relying on the service for an event:

- [Render free services](https://render.com/docs/free)
- [WebSockets on Render](https://render.com/docs/websocket)

## Project layout

```text
public/
  index.html          Homepage, room shell, and accessible controls
  style.css           Responsive layout and visual design
  game.js             Canvas drawing, keyboard/touch input, and WebSocket client
src/
  arena.js            Server-authoritative room and game rules
  server.js           Express static hosting, WebSocket upgrades, room lifecycle
test/
  arena.test.js       Unit tests for the core rules
render.yaml           Free Render deployment settings
```

## How it works

- The browser sends **direction and dash input**, not positions or scores.
- The server simulates movement at 30 ticks per second and broadcasts a room snapshot at 15 updates per second.
- The browser smooths snapshots for display. The server owns collisions, tag transfers, bomb timers, eliminations, and scores.
- Each room has at most eight connected players. Empty rooms are deleted immediately. The server limits itself to 100 simultaneous rooms as a basic resource guard, not a tested capacity claim.
- Nicknames are limited to 14 letters, numbers, spaces, underscores, or hyphens. They are drawn as canvas text or inserted with `textContent`, never interpreted as HTML.
- Input values, message size, move rate, arena boundaries, and dash cooldowns are checked on the server.
- A player who stops sending messages for 45 seconds is removed. The client sends keepalives while its tab is active.

## Privacy and security

Players do not need real names or email addresses. The game keeps nicknames, positions, wins, and room membership in server memory while a room is active. It does not save a player database or game history. The nickname is saved locally in the player's browser for convenience and can be cleared by clearing site data.

Room codes are invitations, **not authentication**. Anyone with a code or link can join that room. Do not use this prototype for sensitive conversations or personal information. There is no chat, camera, microphone, or location access. The hosting provider may keep its own infrastructure logs, including network addresses. Fonts currently load from Google Fonts; system fonts are used if that request fails.

The server includes message size limits, a local socket cap, basic security headers, and server-owned game logic. This is not a complete anti-cheat or DDoS defense. Keep Node and dependencies updated. Never commit `.env` files, account tokens, cookies, passwords, or private account exports.

## Testing

For the browser test, first install the optional test browser with `npx playwright install chromium`. `npm run test:browser` starts a local server and checks two isolated browser contexts, including phone-sized touch controls. To test an existing deployment, set `TEST_URL` to its HTTPS address before running that command.

`npm test` checks room capacity, host-only starts, movement normalization and boundaries, tagging and transfer shields, unchanged fuse on tag, elimination, winner scoring, rematches, late joins, host transfer, and malformed input.

Before calling a deployment ready, also test two separate browser sessions against the live HTTPS address:

- Create a room in one session and join with the invite in the other.
- Start a round and verify both players appear in both sessions.
- Move each player and check the other session sees the motion.
- Touch to pass the bomb, wait for an explosion, and confirm both sessions agree on the winner.
- Play a rematch, leave as host, and verify host transfer.
- Check a phone-width viewport and use the touch controls.

## Known tradeoffs

- Mobile networks and distant players can introduce visible delay. The network badge shows approximate round-trip time, not a guarantee.
- This version interpolates server snapshots. It does not implement competitive-grade rollback or lag compensation.
- A reconnect is manual and creates a fresh player entry. Wins do not survive reconnects.
- There are no bots, accounts, persistent leaderboards, room passwords, or sound yet.
- Browsers can pause background tabs. Switching away mid-round is not a pause for the other players.

## Sensible next steps

Add a room password, reconnect tokens with a brief grace period, more arenas, sound with a mute switch, and accessibility options. For a bigger audience, measure real CPU/bandwidth usage first, add abuse protection, and move room state to a design that survives process restarts.
