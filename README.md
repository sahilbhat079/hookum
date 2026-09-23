# Hokm — حکم

Multiplayer Hokm card game for 4 players (2 teams). React UI, Node.js + Socket.IO
server-authoritative backend, deployable free on Render.

## Architecture

                ┌─────────────────────┐
                │     React.js        │
                │   Card Game UI      │
                └──────────┬──────────┘
                           │ WebSocket (Socket.IO)
                ┌──────────▼──────────┐
                │   Game Server       │
                │  Node.js + Express  │
                │  HokmEngine (rules) │  ← single source of truth
                └──────────┬──────────┘
             ┌─────────────┼─────────────┐
          Player 1      Player 2      Player 3
          Browser       Browser       Browser
             │             │             │
             └─────────────┼─────────────┘
                           │
                       Player 4

- **Rule engine** (`server/game/engine.js`): declarative move validation
  (phase → turn → ownership → follow-suit) and a phase state machine
  `lobby → trump → playing → roundOver → gameOver`. Rules are data (`DEFAULT_RULES`).
  The client never decides legality — the server re-validates every move.
- **Transitions** (`client/src/styles.css` + `Table.js`): cards fly from each
  seat into the trick, the finished trick sweeps toward the winner, whole
  phases fade/slide in, modals and turn badges animate. Driven by server
  `gameEvents` (PHASE / CARD_PLAYED / TRICK_WON / ROUND_WON / TURN).

## Game rules implemented

- 4 players, teams 1 & 2 (partners opposite each other)
- 5 cards dealt, hakem picks trump, remaining 8 dealt (13 each)
- Must follow suit when able; trump beats all; highest of led suit wins otherwise
- 7 tricks wins the round (1 point); remaining cards are not played
- A 7–0 sweep (kot) scores 3
- Hakem stays if their team won; otherwise hakem passes clockwise
- First team to 7 match points wins
- Reconnection via `hokm-session` (playerId + token) in localStorage

## Rules and events

- `docs/HOKM_RULES.md` — partnership Hokm as implemented
- `docs/SOCKET_EVENTS.md` — Socket.IO contract

## Run locally

From this folder (`hokm/`):

```bash
npm install
```

```bash
# terminal 1 — server on :3001
npm run dev:server

# terminal 2 — client on :3000 (proxies API/WS to :3001)
npm run dev:client
```

Or:

```bash
cd server && npm install && npm start
cd client && npm install && npm start
```

Open http://localhost:3000 in 4 browser tabs, create a room, join with the code.

```bash
npm test
```

## Push to GitHub

```bash
git init
git add .
git commit -m "Hokm multiplayer card game: engine, transitions, lobby"
git branch -M main
git remote add origin https://github.com/<your-username>/hokm.git
git push -u origin main
```

## Deploy on Render (free tier)

1. Push the repo to GitHub (above).
2. Render Dashboard → **New → Web Service** → connect the `hokm` repo.
3. Render reads `render.yaml`, but if configuring manually:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Environment:** `NODE_VERSION=20`, `NODE_ENV=production`
4. Deploy. You get an `https://hokm-xxxx.onrender.com` URL — share it with 3 friends.

Free-tier notes (matches the plan from our chat):
- Inbound WebSockets are supported on Render free web services. ✅
- The service spins down after ~15 min idle and takes ~1 min to wake.
- The filesystem is ephemeral and game state lives in memory — a restart
  clears active rooms. Version 1 constraint, by design.
- No database, no paid anything. Add free PostgreSQL later for accounts/history.

## Roadmap

- [ ] Sound effects on events
- [ ] Spectators
- [ ] Persian / Urdu / English i18n
- [ ] Alternate scoring variants (rules already configurable via `DEFAULT_RULES`)
- [ ] Persistent accounts + game history (PostgreSQL)
