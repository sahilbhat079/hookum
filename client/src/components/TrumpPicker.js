import React from 'react';
import socket from '../socket';
import { SUIT_GLYPH, SUIT_COLOR } from '../gameUtils';
import Card from './Card';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

export default function TrumpPicker({ hand = [], onError }) {
  const pick = (suit) => socket.emit('selectTrump', { suit }, (res) => !res.ok && onError(res.error));
  return (
    <div className="overlay">
      <div className="modal trump-picker">
        <p className="first-five-label">Your first five cards</p>
        <div className="first-five">
          {hand.map((c) => <Card key={c.id} card={c} playable={false} className="mini-face" />)}
        </div>
        <h2>Choose Hokm</h2>
        <div className="suits">
          {SUITS.map((s) => (
            <button key={s} className={`suit-btn ${SUIT_COLOR[s]}`} onClick={() => pick(s)}>
              {SUIT_GLYPH[s]}<span>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
