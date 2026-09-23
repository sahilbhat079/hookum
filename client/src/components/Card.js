import React from 'react';
import { SUIT_GLYPH, SUIT_COLOR } from '../gameUtils';

export default function Card({ card, faceDown, className = '', style, onClick, playable }) {
  if (faceDown) {
    return <div className={`card back ${className}`} style={style} aria-hidden="true"><span>✦</span></div>;
  }
  const color = SUIT_COLOR[card.suit];
  return (
    <div
      className={`card face ${color} ${playable ? 'playable' : 'disabled'} ${className}`}
      role={onClick ? 'button' : undefined}
      style={style}
      onClick={playable ? onClick : undefined}
    >
      <span className="corner tl"><b>{card.rank}</b><i>{SUIT_GLYPH[card.suit]}</i></span>
      <span className="pip">{SUIT_GLYPH[card.suit]}</span>
      <span className="corner br"><b>{card.rank}</b><i>{SUIT_GLYPH[card.suit]}</i></span>
    </div>
  );
}
