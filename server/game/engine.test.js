const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SUITS, RANKS, createDeck, shuffle, createCard } = require('./deck');
const HokmEngine = require('./engine');

function fillRoom(engine, n = 4) {
  for (let i = 0; i < n; i++) {
    const res = engine.addPlayer(`p${i}`, `P${i}`, { token: `tok${i}xxxxxxxxxxxxxxx` });
    assert.equal(res.ok, true);
  }
}

function stackedDeck() {
  return createDeck();
}

function legalId(engine, player) {
  if (!engine.ledSuit || engine.trick.length === 0) return player.hand[0].id;
  const follow = player.hand.find((c) => c.suit === engine.ledSuit);
  return (follow || player.hand[0]).id;
}

function hakemId(engine) {
  return engine.hakemId;
}

function play(engine, playerId, cardId) {
  const res = engine.playCard(playerId, cardId);
  if (res.ok && engine.phase === 'trickComplete') {
    const adv = engine.advanceAfterTrick();
    assert.equal(adv.ok, true);
    res.events = [...res.events, ...adv.events];
  }
  return res;
}

function playTurn(engine) {
  const id = engine.currentPlayerId;
  return play(engine, id, legalId(engine, engine.playerById(id)));
}

describe('deck', () => {
  it('has 52 unique valid cards', () => {
    const deck = createDeck();
    assert.equal(deck.length, 52);
    const ids = deck.map((c) => c.id);
    assert.equal(new Set(ids).size, 52);
    for (const c of deck) {
      assert.ok(SUITS.includes(c.suit));
      assert.ok(RANKS.includes(c.rank));
    }
  });

  it('shuffle preserves membership', () => {
    const a = createDeck();
    const b = shuffle(a);
    assert.equal(b.length, 52);
    assert.deepEqual([...b.map((c) => c.id)].sort(), [...a.map((c) => c.id)].sort());
    assert.equal(a[0].id, createDeck()[0].id);
  });
});

describe('lobby and dealing', () => {
  it('rejects a fifth player and assigns opposite teams', () => {
    const e = new HokmEngine();
    fillRoom(e);
    assert.equal(e.addPlayer('p4', 'X').ok, false);
    assert.equal(e.playerBySeat(0).team, 1);
    assert.equal(e.playerBySeat(2).team, 1);
    assert.equal(e.playerBySeat(1).team, 2);
    assert.equal(e.playerBySeat(3).team, 2);
  });

  it('deals 5 then 13 unique cards', () => {
    const e = new HokmEngine();
    fillRoom(e);
    const start = e.startGame({ deck: stackedDeck() });
    assert.equal(start.ok, true);
    assert.equal(e.phase, 'trump');
    for (const p of e.players) assert.equal(p.hand.length, 5);
    const ids = e.players.flatMap((p) => p.hand.map((c) => c.id));
    assert.equal(new Set(ids).size, 20);

    const trump = e.selectTrump(hakemId(e), 'hearts');
    assert.equal(trump.ok, true);
    for (const p of e.players) assert.equal(p.hand.length, 13);
    assert.equal(e.deck.length, 0);
    const all = e.players.flatMap((p) => p.hand.map((c) => c.id));
    assert.equal(new Set(all).size, 52);
    assert.equal(e.invariantErrors().length, 0);
  });

  it('requires all four players to be connected before starting', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.setConnected('p3', false);

    const result = e.startGame();

    assert.equal(result.ok, false);
    assert.equal(result.error, 'All players must be connected before starting');
    assert.equal(e.phase, 'lobby');
  });
});

describe('trump', () => {
  it('only hakem can select a valid suit once', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.startGame({ deck: stackedDeck() });
    const hakem = hakemId(e);
    const nonHakem = e.players.find((player) => player.id !== hakem).id;
    assert.equal(e.selectTrump(nonHakem, 'hearts').ok, false);
    assert.equal(e.selectTrump(hakem, 'stars').ok, false);
    assert.equal(e.selectTrump(hakem, 'spades').ok, true);
    assert.equal(e.trump, 'spades');
    assert.equal(e.phase, 'playing');
    assert.equal(e.selectTrump(hakem, 'hearts').ok, false);
  });
});

describe('card play', () => {
  it('rejects wrong turn, missing card, follow-suit, and trump-phase play', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.startGame({ deck: stackedDeck() });
    const hakemCard = e.players[0].hand[0].id;
    assert.equal(e.playCard('p0', hakemCard).ok, false);

    e.selectTrump(hakemId(e), 'clubs');
    const p0 = e.playerById('p0');
    const p1 = e.playerById('p1');
    assert.equal(e.playCard('p1', p1.hand[0].id).ok, false);

    p0.hand = [createCard('hearts', 'A'), createCard('hearts', 'K'), createCard('spades', '2')];
    p1.hand = [createCard('hearts', 'Q'), createCard('clubs', '3'), createCard('diamonds', '4')];
    e.playerById('p2').hand = [createCard('hearts', 'J')];
    e.playerById('p3').hand = [createCard('hearts', '10')];
    e.currentPlayerId = 'p0';
    e.phase = 'playing';
    e.trump = 'clubs';
    e.trick = [];
    e.ledSuit = null;

    assert.equal(e.playCard('p0', 'A-diamonds').ok, false);
    assert.equal(play(e, 'p0', 'A-hearts').ok, true);
    assert.equal(e.ledSuit, 'hearts');
    const bad = e.playCard('p1', '3-clubs');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Hearts/);
    assert.equal(e.playCard('p1', 'Q-hearts').ok, true);
  });
});

describe('trick winner', () => {
  function winner(trick, led, trump) {
    const e = new HokmEngine();
    return e.trickWinner(trick, led, trump).playerId;
  }

  const C = createCard;
  it('highest led suit when no trump', () => {
    const trick = [
      { playerId: 'a', card: C('hearts', '10') },
      { playerId: 'b', card: C('hearts', 'K') },
      { playerId: 'c', card: C('hearts', '2') },
      { playerId: 'd', card: C('diamonds', 'A') },
    ];
    assert.equal(winner(trick, 'hearts', 'spades'), 'b');
  });

  it('trump beats led ace', () => {
    const trick = [
      { playerId: 'a', card: C('hearts', 'A') },
      { playerId: 'b', card: C('spades', '2') },
      { playerId: 'c', card: C('hearts', 'K') },
      { playerId: 'd', card: C('diamonds', 'A') },
    ];
    assert.equal(winner(trick, 'hearts', 'spades'), 'b');
  });

  it('highest of multiple trumps', () => {
    const trick = [
      { playerId: 'a', card: C('hearts', 'A') },
      { playerId: 'b', card: C('spades', '2') },
      { playerId: 'c', card: C('spades', 'J') },
      { playerId: 'd', card: C('clubs', 'A') },
    ];
    assert.equal(winner(trick, 'hearts', 'spades'), 'c');
  });
});

describe('round and match', () => {
  it('ends the round at 7 tricks and awards kot on 7-0', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.startGame({ deck: stackedDeck() });
    e.selectTrump(hakemId(e), 'hearts');

    const cards = createDeck();
    for (const p of e.players) p.hand = [];
    for (let i = 0; i < 13; i++) {
      e.players[0].hand.push(cards.pop());
      e.players[1].hand.push(cards.pop());
      e.players[2].hand.push(cards.pop());
      e.players[3].hand.push(cards.pop());
    }
    e.trump = 'hearts';
    e.currentPlayerId = 'p0';
    e.phase = 'playing';
    e.trick = [];

    for (let t = 0; t < 7; t++) {
      assert.equal(e.phase, 'playing');
      for (let k = 0; k < 4; k++) {
        const r = playTurn(e);
        assert.equal(r.ok, true, r.error);
      }
    }

    assert.ok(e.phase === 'roundOver' || e.phase === 'gameOver');
    const tricks = e.teamTricks(1) + e.teamTricks(2);
    assert.equal(tricks, 7);
    const last = e.history[0];
    assert.ok(last.points === 1 || last.points === 3);
  });

  it('awards 3 points for a 7-0 kot', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.hakemId = 'p0';
    e.players[0].tricks = 4;
    e.players[2].tricks = 3;
    const events = [];
    e.resolveRound(events);
    assert.equal(e.scores.team1.matchScore, 3);
    assert.equal(e.history[0].kot, true);
  });

  it('reaches gameOver at 7 match points', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.phase = 'roundOver';
    e.hakemId = 'p0';
    e.scores.team1.matchScore = 6;
    e.scores.team1.tricks = 7;
    e.scores.team2.tricks = 3;
    e.players[0].tricks = 4;
    e.players[2].tricks = 3;
    e.players[1].tricks = 2;
    e.players[3].tricks = 1;
    const events = [];
    e.resolveRound(events);
    assert.equal(e.phase, 'gameOver');
    assert.equal(e.scores.team1.matchScore, 7);
  });

  it('passes hakem clockwise when hakem team loses', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.phase = 'playing';
    e.hakemId = 'p0';
    e.players[1].tricks = 4;
    e.players[3].tricks = 3;
    e.players[0].tricks = 2;
    e.players[2].tricks = 1;
    e.scores.team1.tricks = 3;
    e.scores.team2.tricks = 7;
    const events = [];
    e.resolveRound(events);
    assert.equal(e.hakemId, 'p1');
  });

  it('keeps hakem when hakem team wins', () => {
    const e = new HokmEngine();
    fillRoom(e);
    e.hakemId = 'p0';
    e.players[0].tricks = 4;
    e.players[2].tricks = 3;
    e.players[1].tricks = 2;
    e.players[3].tricks = 1;
    const events = [];
    e.resolveRound(events);
    assert.equal(e.hakemId, 'p0');
  });
});

describe('identity', () => {
  it('verifies reconnect token and frees lobby seats', () => {
    const e = new HokmEngine();
    e.addPlayer('p0', 'A', { token: 'aaaaaaaaaaaaaaaaaaaa' });
    e.addPlayer('p1', 'B', { token: 'bbbbbbbbbbbbbbbbbbbb' });
    assert.equal(e.verifyToken('p0', 'aaaaaaaaaaaaaaaaaaaa'), true);
    assert.equal(e.verifyToken('p0', 'bbbbbbbbbbbbbbbbbbbb'), false);
    e.removePlayer('p1');
    assert.equal(e.players.length, 1);
    const res = e.addPlayer('p2', 'C', { token: 'cccccccccccccccccccc' });
    assert.equal(res.ok, true);
    assert.equal(res.seat, 1);
  });
});
