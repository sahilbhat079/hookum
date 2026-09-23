# Hokm (حکم) — rules implemented in this project

Standard 4-player partnership Hokm. The server is the only authority.

## Players and seats

Exactly 4 players. Seats are `0, 1, 2, 3` in clockwise order.

```
        Seat 2
Seat 3          Seat 1
        Seat 0
```

- **Team 1:** seats 0 and 2 (opposite)
- **Team 2:** seats 1 and 3 (opposite)

Seat 0 is assigned to the room creator. Later joiners take the lowest empty seat. Teams follow the seat, not join order after someone has left the lobby.

The **host** is the creator, or the remaining player with the lowest seat if the host leaves in the lobby.

## Deck

Standard 52 cards. No jokers.

- Suits: `hearts`, `diamonds`, `clubs`, `spades`
- Ranks: `2 3 4 5 6 7 8 9 10 J Q K A`
- Rank order: `A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2`
- Card id: `{rank}-{suit}` e.g. `A-hearts`

A card exists in exactly one place: deck, a hand, the current trick, or a completed trick.

## Deal and hakem

1. First hakem of a match is seat 0.
2. Each player is dealt **5 cards** (round-robin).
3. Hakem chooses trump: hearts, diamonds, clubs, or spades. Trump is then locked for the round.
4. Remaining cards are dealt until each player has **13** and the deck is empty.
5. Hakem leads the first trick of the round.

After a round:

- If the **hakem’s team won**, they remain hakem.
- If the **hakem’s team lost**, hakem passes **clockwise** to the next seat.

## Play

Each trick: four cards, clockwise from the leader.

- Must follow the led suit if the player has that suit.
- Otherwise any card, including trump.

Trick winner:

1. If any trump was played, the highest trump wins.
2. Else the highest card of the led suit wins.
3. Off-suit non-trump never wins.

The winner leads the next trick.

## Round end

A round has at most 13 tricks. It ends as soon as a team has **7 tricks**. Remaining cards stay in hand and are not played.

- Round point: **1** for the winning team.
- **Kot** (7–0): **3** match points instead of 1.

## Match

- **Trick score:** tricks this round (reset each round).
- **Round score:** rounds won (count of rounds, not points).
- **Match score:** cumulative points (1 or 3 per round).

First team to **7 match points** wins the match. The room stays alive for rematch.

## Disconnect / leave

- Refresh: same `playerId` + reconnect `token` restores seat and private hand.
- Temporary disconnect: game is preserved; that player cannot play until they reconnect.
- Leave in lobby: seat is freed.
- Leave during a match: seat is kept; they may rejoin with the token. No fifth player. The game does not auto-play their cards.

## Phases

`lobby` → `trump` → `playing` → `trickComplete` → `playing` … → `roundOver` → `trump` … → `gameOver` → `lobby` (rematch)
