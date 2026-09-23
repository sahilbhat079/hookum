// Client-side helpers mirroring the server rule engine.
// These are ONLY for UI hints (highlighting legal cards) — the server re-validates everything.

export const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
export const SUIT_COLOR = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };

/** Rotate the player list so the viewer is bottom; turn flows left -> top -> right. */
export function seatOf(players, myId) {
  const i = players.findIndex(p => p.id === myId);
  const safe = i === -1 ? 0 : i;
  const rot = [...players.slice(safe), ...players.slice(0, safe)];
  return { bottom: rot[0], left: rot[1], top: rot[2], right: rot[3] };
}

/** Follow-suit legality, exactly like HokmEngine.validatePlay */
export function isLegalCard(state, card, hand) {
  if (state.phase !== 'playing') return false;
  if (!state.trick || state.trick.length === 0) return true;
  const led = state.trick[0].card.suit;
  if (card.suit === led) return true;
  return !hand.some(c => c.suit === led);
}

const SUIT_ORDER = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };

/** Sort hand for display; trump cards sit at the right end, slightly raised by CSS. */
export function sortHand(hand, trump) {
  return [...hand].sort((a, b) => {
    const aT = a.suit === trump, bT = b.suit === trump;
    if (aT !== bT) return aT ? 1 : -1;
    if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return a.value - b.value;
  });
}
