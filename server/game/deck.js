// Deck primitives for Hokm (standard 52-card deck)
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])); // 2..14

function createCard(suit, rank) {
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) {
    throw new Error(`Invalid card ${rank} of ${suit}`);
  }
  return { id: `${rank}-${suit}`, suit, rank, value: RANK_VALUES[rank] };
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(suit, rank));
    }
  }
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function isSameCard(a, b) {
  return a && b && a.id === b.id;
}

module.exports = { SUITS, SUIT_SYMBOLS, RANKS, RANK_VALUES, createCard, createDeck, shuffle, isSameCard };
