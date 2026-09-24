/**
 * HokmEngine - server-authoritative game engine.
 * Rules: docs/HOKM_RULES.md
 */
const crypto = require('crypto');
const { SUITS, createDeck, shuffle } = require('./deck');

const PHASE = {
  LOBBY: 'lobby',
  TRUMP: 'trump',
  PLAYING: 'playing',
  TRICK_COMPLETE: 'trickComplete',
  ROUND_OVER: 'roundOver',
  GAME_OVER: 'gameOver',
};

const DEFAULT_RULES = {
  playersPerGame: 4,
  cardsForTrumpPick: 5,
  handSize: 13,
  tricksToWinRound: 7,
  pointsPerRound: 1,
  pointsPerKot: 3,
  targetScore: 7,
  followSuit: true,
};

function emptyTeamScore() {
  return { tricks: 0, rounds: 0, matchScore: 0 };
}

class HokmEngine {
  constructor(rules = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.resetMatchState();
    this.players = [];
    this.hostId = null;
  }

  resetMatchState() {
    this.phase = PHASE.LOBBY;
    this.scores = { team1: emptyTeamScore(), team2: emptyTeamScore() };
    this.roundNumber = 0;
    this.hakemId = null;
    this.trump = null;
    this.trick = [];
    this.ledSuit = null;
    this.trickLeaderId = null;
    this.currentPlayerId = null;
    this.lastTrick = null;
    this.completedTricks = [];
    this.deck = [];
    this.history = [];
    this.trumpLocked = false;
  }

  transition(to, events, payload = {}) {
    const from = this.phase;
    this.phase = to;
    events.push({ type: 'PHASE', from, to, ...payload });
  }

  playerById(id) {
    return this.players.find((p) => p.id === id) || null;
  }

  playerBySeat(seat) {
    return this.players.find((p) => p.seat === seat) || null;
  }

  get hakem() {
    return this.playerById(this.hakemId);
  }

  nextClockwise(playerId) {
    const p = this.playerById(playerId);
    if (!p) return null;
    return this.playerBySeat((p.seat + 1) % this.rules.playersPerGame);
  }

  teamTricks(team) {
    return this.players.filter((p) => p.team === team).reduce((s, p) => s + p.tricks, 0);
  }

  addPlayer(id, name, { token } = {}) {
    if (this.phase !== PHASE.LOBBY) return { ok: false, error: 'Game has already started' };
    if (!id || typeof id !== 'string') return { ok: false, error: 'Invalid player' };
    if (this.playerById(id)) return { ok: false, error: 'Player already in the room' };
    if (this.players.length >= this.rules.playersPerGame) return { ok: false, error: 'Room is full' };

    const taken = new Set(this.players.map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat) && seat < this.rules.playersPerGame) seat += 1;
    if (seat >= this.rules.playersPerGame) return { ok: false, error: 'Room is full' };

    const trimmed = String(name || '').trim().slice(0, 20);
    this.players.push({
      id,
      token: token || null,
      name: trimmed || `Player ${seat + 1}`,
      team: seat % 2 === 0 ? 1 : 2,
      seat,
      hand: [],
      tricks: 0,
      connected: true,
    });
    this.players.sort((a, b) => a.seat - b.seat);
    if (!this.hostId) this.hostId = id;
    return { ok: true, seat };
  }

  removePlayer(playerId) {
    if (this.phase !== PHASE.LOBBY) {
      this.setConnected(playerId, false);
      return { ok: true, removed: false };
    }
    const before = this.players.length;
    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.hostId === playerId) this.hostId = this.players[0] ? this.players[0].id : null;
    return { ok: true, removed: this.players.length < before };
  }

  verifyToken(playerId, token) {
    const p = this.playerById(playerId);
    if (!p || !p.token || !token) return false;
    if (p.token.length !== token.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(p.token), Buffer.from(token));
    } catch {
      return false;
    }
  }

  startGame({ deck } = {}) {
    if (this.phase !== PHASE.LOBBY) return { ok: false, error: 'Game has already started' };
    if (this.players.length !== this.rules.playersPerGame) {
      return { ok: false, error: `Need ${this.rules.playersPerGame} players` };
    }
    if (this.players.some((player) => !player.connected)) {
      return { ok: false, error: 'All players must be connected before starting' };
    }
    const events = [];
    // The first hakem belongs to a random seated player, not necessarily the
    // room host. `randomInt` avoids modulo bias when selecting a seat.
    this.hakemId = this.players[crypto.randomInt(this.players.length)].id;
    const dealt = this.startRound(events, { deck });
    if (dealt && dealt.ok === false) return dealt;
    return { ok: true, events };
  }

  startRound(events, { deck } = {}) {
    this.roundNumber += 1;
    this.deck = deck ? deck.map((c) => ({ ...c })) : shuffle(createDeck());
    for (const p of this.players) {
      p.hand = [];
      p.tricks = 0;
    }
    this.scores.team1.tricks = 0;
    this.scores.team2.tricks = 0;
    this.trump = null;
    this.trumpLocked = false;
    this.trick = [];
    this.ledSuit = null;
    this.lastTrick = null;
    this.completedTricks = [];
    this.trickLeaderId = this.hakemId;

    for (let i = 0; i < this.rules.cardsForTrumpPick; i++) {
      for (const p of this.players) {
        if (!this.deck.length) return { ok: false, error: 'Deck exhausted while dealing' };
        p.hand.push(this.deck.pop());
      }
    }
    this.currentPlayerId = this.hakemId;
    this.transition(PHASE.TRUMP, events, { round: this.roundNumber, hakemId: this.hakemId });
    return { ok: true };
  }

  selectTrump(playerId, suit) {
    const events = [];
    if (this.phase !== PHASE.TRUMP) return { ok: false, error: 'It is not time to choose Hokm', events };
    if (!this.hakem || this.hakem.id !== playerId) {
      return { ok: false, error: 'You are not the Hakem', events };
    }
    if (!SUITS.includes(suit)) return { ok: false, error: 'Invalid suit', events };
    if (this.trumpLocked) return { ok: false, error: 'Trump is already chosen', events };

    this.trump = suit;
    this.trumpLocked = true;

    while (this.deck.length) {
      for (const p of this.players) {
        if (this.deck.length) p.hand.push(this.deck.pop());
      }
    }

    for (const p of this.players) {
      if (p.hand.length !== this.rules.handSize) {
        return { ok: false, error: 'Deal failed: hands must have 13 cards', events };
      }
    }

    this.currentPlayerId = this.hakemId;
    this.trickLeaderId = this.hakemId;
    this.transition(PHASE.PLAYING, events, { trump: suit });

    const inv = this.invariantErrors();
    if (inv.length) return { ok: false, error: inv[0], events };

    events.push({ type: 'TURN', playerId: this.currentPlayerId });
    return { ok: true, events };
  }

  validatePlay(playerId, cardId) {
    if (this.phase === PHASE.TRICK_COMPLETE) {
      return { ok: false, code: 'trick-complete', error: 'Wait for the trick to finish' };
    }
    if (this.phase === PHASE.TRUMP) {
      return { ok: false, code: 'phase', error: 'Cards cannot be played during trump selection' };
    }
    if (this.phase === PHASE.ROUND_OVER) {
      return { ok: false, code: 'phase', error: 'The round is over' };
    }
    if (this.phase === PHASE.GAME_OVER) {
      return { ok: false, code: 'phase', error: 'The game is over' };
    }
    if (this.phase !== PHASE.PLAYING) {
      return { ok: false, code: 'phase', error: 'Cards can only be played during the round' };
    }
    const player = this.playerById(playerId);
    if (!player) return { ok: false, code: 'player', error: 'Unknown player' };
    if (!player.connected) return { ok: false, code: 'disconnected', error: 'Please reconnect to continue' };
    if (player.id !== this.currentPlayerId) return { ok: false, code: 'turn', error: 'It is not your turn' };
    if (typeof cardId !== 'string') return { ok: false, code: 'card', error: 'Invalid card' };
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return { ok: false, code: 'hand', error: 'That card is no longer in your hand' };
    if (this.rules.followSuit && this.ledSuit && card.suit !== this.ledSuit) {
      const canFollow = player.hand.some((c) => c.suit === this.ledSuit);
      if (canFollow) {
        const label = this.ledSuit.charAt(0).toUpperCase() + this.ledSuit.slice(1);
        return { ok: false, code: 'follow-suit', error: `You must follow ${label}` };
      }
    }
    return { ok: true, player, card };
  }

  playCard(playerId, cardId) {
    const events = [];
    const v = this.validatePlay(playerId, cardId);
    if (!v.ok) return { ok: false, error: v.error, code: v.code, events };
    const { player, card } = v;
    player.hand = player.hand.filter((c) => c.id !== cardId);
    if (this.trick.length === 0) {
      this.ledSuit = card.suit;
      this.trickLeaderId = playerId;
    }
    this.trick.push({ playerId, card });
    events.push({ type: 'CARD_PLAYED', playerId, card, trickSize: this.trick.length });

    if (this.trick.length < this.rules.playersPerGame) {
      const next = this.nextClockwise(playerId);
      this.currentPlayerId = next.id;
      events.push({ type: 'TURN', playerId: this.currentPlayerId });
    } else {
      this.currentPlayerId = null;
      this.resolveTrick(events);
    }
    return { ok: true, events };
  }

  trickWinner(trick = this.trick, ledSuit = this.ledSuit, trump = this.trump) {
    const beats = (a, b) => {
      const aT = a.card.suit === trump;
      const bT = b.card.suit === trump;
      if (aT && !bT) return true;
      if (!aT && bT) return false;
      if (aT && bT) return a.card.value > b.card.value;
      const aL = a.card.suit === ledSuit;
      const bL = b.card.suit === ledSuit;
      if (aL && !bL) return true;
      if (!aL && bL) return false;
      if (aL && bL) return a.card.value > b.card.value;
      return false;
    };
    let best = trick[0];
    for (const t of trick.slice(1)) if (beats(t, best)) best = t;
    return best;
  }

  resolveTrick(events) {
    const winnerEntry = this.trickWinner();
    const winner = this.playerById(winnerEntry.playerId);
    winner.tricks += 1;
    this.scores[`team${winner.team}`].tricks = this.teamTricks(winner.team);
    const other = winner.team === 1 ? 2 : 1;
    this.scores[`team${other}`].tricks = this.teamTricks(other);
    this.lastTrick = { winnerId: winner.id, team: winner.team, cards: this.trick.map((t) => ({ ...t })) };
    events.push({ type: 'TRICK_WON', playerId: winner.id, team: winner.team, card: winnerEntry.card });
    this.currentPlayerId = winner.id;
    this.trickLeaderId = winner.id;
    this.transition(PHASE.TRICK_COMPLETE, events, { winnerId: winner.id });
  }

  advanceAfterTrick() {
    if (this.phase !== PHASE.TRICK_COMPLETE) {
      return { ok: false, error: 'No completed trick to advance' };
    }
    const events = [];
    if (this.lastTrick) this.completedTricks.push(this.lastTrick);
    this.trick = [];
    this.ledSuit = null;

    const t1 = this.teamTricks(1);
    const t2 = this.teamTricks(2);
    const roundWon = t1 >= this.rules.tricksToWinRound || t2 >= this.rules.tricksToWinRound;
    const cardsLeft = this.players.some((p) => p.hand.length > 0);

    if (roundWon || !cardsLeft) {
      this.resolveRound(events);
    } else {
      this.transition(PHASE.PLAYING, events, {});
      events.push({ type: 'TURN', playerId: this.currentPlayerId });
    }
    return { ok: true, events };
  }

  resolveRound(events) {
    const t1 = this.teamTricks(1);
    const t2 = this.teamTricks(2);
    const winnerTeam = t1 >= this.rules.tricksToWinRound || t1 > t2 ? 1 : 2;
    const loserTricks = winnerTeam === 1 ? t2 : t1;
    const kot = loserTricks === 0;
    const points = kot ? this.rules.pointsPerKot : this.rules.pointsPerRound;
    const key = `team${winnerTeam}`;
    this.scores[key].matchScore += points;
    this.scores[key].rounds += 1;

    const record = {
      round: this.roundNumber,
      team: winnerTeam,
      points,
      kot,
      trickCounts: { team1: t1, team2: t2 },
      scores: {
        team1: this.scores.team1.matchScore,
        team2: this.scores.team2.matchScore,
      },
    };
    this.history.push(record);
    events.push({ type: 'ROUND_WON', ...record });

    const hakemPlayer = this.hakem;
    if (!hakemPlayer || hakemPlayer.team !== winnerTeam) {
      const next = this.nextClockwise(this.hakemId);
      if (next) this.hakemId = next.id;
    }

    if (this.scores[key].matchScore >= this.rules.targetScore) {
      this.currentPlayerId = null;
      this.transition(PHASE.GAME_OVER, events, { winnerTeam });
    } else {
      this.currentPlayerId = null;
      this.transition(PHASE.ROUND_OVER, events, {});
    }
  }

  nextRound() {
    if (this.phase !== PHASE.ROUND_OVER) return { ok: false, error: 'No finished round to continue from' };
    const events = [];
    this.startRound(events);
    return { ok: true, events };
  }

  playAgain(requesterId) {
    if (this.phase !== PHASE.GAME_OVER) return { ok: false, error: 'The game is not over' };
    if (this.hostId !== requesterId) return { ok: false, error: 'Only the host can restart' };
    const events = [];
    for (const p of this.players) {
      p.hand = [];
      p.tricks = 0;
    }
    const keptPlayers = this.players;
    const hostId = this.hostId;
    this.resetMatchState();
    this.players = keptPlayers;
    this.hostId = hostId;
    this.transition(PHASE.LOBBY, events, {});
    return { ok: true, events };
  }

  setConnected(playerId, connected) {
    const p = this.playerById(playerId);
    if (p) p.connected = connected;
  }

  invariantErrors() {
    const errors = [];
    const seen = new Map();
    const add = (card, loc) => {
      if (!card || !card.id) {
        errors.push(`Invalid card in ${loc}`);
        return;
      }
      if (seen.has(card.id)) errors.push(`Card ${card.id} in both ${seen.get(card.id)} and ${loc}`);
      else seen.set(card.id, loc);
    };

    for (const c of this.deck) add(c, 'deck');
    for (const p of this.players) {
      const ids = p.hand.map((c) => c.id);
      if (new Set(ids).size !== ids.length) errors.push(`Duplicate cards in ${p.id} hand`);
      for (const c of p.hand) add(c, `hand:${p.id}`);
    }
    for (const t of this.trick) add(t.card, 'trick');
    for (const tr of this.completedTricks) {
      for (const t of tr.cards) add(t.card, 'won');
    }

    const total = seen.size;
    if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.TRUMP && this.roundNumber > 0) {
      if (this.phase === PHASE.PLAYING || this.phase === PHASE.TRICK_COMPLETE) {
        if (total !== 52) errors.push(`Expected 52 located cards, found ${total}`);
      }
    }

    if (this.phase === PHASE.PLAYING) {
      if (!this.currentPlayerId) errors.push('PLAYING requires a current player');
    }
    if (this.phase === PHASE.TRUMP && this.trumpLocked) errors.push('Trump locked while still in trump phase');
    return errors;
  }

  getState(viewerId) {
    return {
      phase: this.phase,
      round: this.roundNumber,
      trump: this.trump,
      ledSuit: this.ledSuit,
      trick: this.trick,
      lastTrick: this.lastTrick
        ? { winnerId: this.lastTrick.winnerId, team: this.lastTrick.team }
        : null,
      currentPlayerId: this.currentPlayerId,
      trickLeaderId: this.trickLeaderId,
      hakemId: this.hakemId,
      hostId: this.hostId,
      scores: {
        team1: { ...this.scores.team1 },
        team2: { ...this.scores.team2 },
      },
      history: this.history,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        seat: p.seat,
        tricks: p.tricks,
        connected: p.connected,
        cardCount: p.hand.length,
        isHost: p.id === this.hostId,
        isHakem: p.id === this.hakemId,
        hand: p.id === viewerId ? p.hand : undefined,
      })),
      rules: this.rules,
    };
  }
}

module.exports = HokmEngine;
module.exports.PHASE = PHASE;
module.exports.DEFAULT_RULES = DEFAULT_RULES;
