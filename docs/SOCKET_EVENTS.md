# Socket.IO contract

Existing names are kept. The server still pushes a per-viewer `gameState` after every successful action.

## Client → server (ack `{ ok, error?, ... }`)

| Event | Body | Success extra |
|---|---|---|
| `createRoom` | `{ name }` | `code`, `playerId`, `token` |
| `joinRoom` | `{ code, name }` | `code`, `playerId`, `token` |
| `rejoin` | `{ code, playerId, token }` | `code`, `playerId`, `name` |
| `leaveRoom` | — | — |
| `startGame` | — | host only, 4 players, phase lobby |
| `selectTrump` | `{ suit }` | hakem only |
| `playCard` | `{ cardId }` | current player, phase playing |
| `nextRound` | — | phase roundOver |
| `playAgain` | — | host, phase gameOver |

`token` is only returned on create/join. It is never included in `gameState`.

## Server → client

| Event | Meaning |
|---|---|
| `gameState` | Full public + private-for-you snapshot |
| `gameEvents` | Animation/log events from the engine |
| `gameError` | `{ error, code }` for the acting client on failed actions |

## `gameEvents` types

`PHASE`, `TURN`, `CARD_PLAYED`, `TRICK_WON`, `ROUND_WON`, `PLAYER_LEFT`, `PLAYER_RECONNECTED`
