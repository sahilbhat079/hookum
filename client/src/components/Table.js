import React, { useEffect, useMemo, useRef, useState } from 'react';
import socket from '../socket';
import Card from './Card';
import TrumpPicker from './TrumpPicker';
import { GameOverOverlay, RoundOverOverlay } from './Overlays';
import { seatOf, isLegalCard, sortHand, SUIT_GLYPH } from '../gameUtils';

const OPP_SEATS = ['top', 'left', 'right'];

export default function Table({ state, myId, onError, onLeave }) {
  const seats = useMemo(() => seatOf(state.players, myId), [state.players, myId]);
  const seatNameById = useMemo(() => ({
    [seats.bottom?.id]: 'bottom',
    [seats.left?.id]: 'left',
    [seats.top?.id]: 'top',
    [seats.right?.id]: 'right',
  }), [seats]);

  const [displayTrick, setDisplayTrick] = useState([]);
  const [sweepTo, setSweepTo] = useState(null);
  const pendingTimer = useRef(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    clearTimeout(pendingTimer.current);
    if (state.trick.length > 0) {
      setDisplayTrick(state.trick);
      setSweepTo(null);
    } else if (state.lastTrick && displayTrick.length === 4) {
      setSweepTo(state.lastTrick.winnerId);
      pendingTimer.current = setTimeout(() => { setDisplayTrick([]); setSweepTo(null); }, 1100);
      return () => clearTimeout(pendingTimer.current);
    } else if (state.trick.length === 0 && displayTrick.length > 0 && displayTrick.length < 4) {
      setDisplayTrick([]);
      setSweepTo(null);
    }
    return () => clearTimeout(pendingTimer.current);
  }, [state.trick, state.lastTrick, displayTrick.length]);

  useEffect(() => { setSelectedId(null); }, [state.currentPlayerId, state.phase, state.round]);

  const myHand = seats.bottom?.hand || [];
  const sortedHand = useMemo(() => sortHand(myHand, state.trump), [myHand, state.trump]);
  const myTurn = state.phase === 'playing' && state.currentPlayerId === myId;
  const winnerId = state.phase === 'trickComplete' ? state.lastTrick?.winnerId : sweepTo;
  const winnerSeat = winnerId ? seatNameById[winnerId] : null;

  const playCard = (card) => {
    socket.emit('playCard', { cardId: card.id }, (res) => !res.ok && onError(res.error));
    setSelectedId(null);
  };

  const onCardClick = (card, legal) => {
    if (!legal) {
      onError(state.ledSuit ? `You must follow ${state.ledSuit.charAt(0).toUpperCase()}${state.ledSuit.slice(1)}` : 'That card cannot be played');
      return;
    }
    if (selectedId === card.id) playCard(card);
    else setSelectedId(card.id);
  };

  const match1 = state.scores.team1.matchScore ?? state.scores.team1;
  const match2 = state.scores.team2.matchScore ?? state.scores.team2;
  const tricks1 = state.scores.team1.tricks ?? 0;
  const tricks2 = state.scores.team2.tricks ?? 0;

  return (
    <div className={`table phase-${state.phase}`}>
      <header className="hud">
        <div className="brand">HOKM <span className="fa">حکم</span></div>
        <div className={`trump-badge ${state.trump ? 'set' : ''}`}>
          {state.trump ? (
            <>Trump <b className={state.trump === 'hearts' || state.trump === 'diamonds' ? 'red' : 'black'}>{SUIT_GLYPH[state.trump]}</b></>
          ) : 'Trump: —'}
        </div>
        <div className="score">
          <span className="t1">Team 1 <b>{match1}</b></span>
          <span className="sep">·</span>
          <span className="t2">Team 2 <b>{match2}</b></span>
          <span className="tricks-hud">tricks {tricks1}–{tricks2}</span>
          <span className="target">first to {state.rules.targetScore}</span>
        </div>
      </header>

      {OPP_SEATS.map((seat) => {
        const p = seats[seat];
        if (!p) return null;
        const isTurn = state.currentPlayerId === p.id && state.phase === 'playing';
        return (
          <div key={seat} className={`seat ${seat} ${isTurn ? 'turn' : ''} ${p.connected ? '' : 'away'}`}>
            <div className="name">
              {p.name}{!p.connected && ' (away)'}
              {p.isHakem && ' ★'}
              <span className="trick-count">{p.tricks}</span>
            </div>
            <div className="backs">
              {Array.from({ length: Math.min(p.cardCount, 8) }).map((_, i) => (
                <Card key={i} faceDown className="mini" style={{ marginLeft: i === 0 ? 0 : -22 }} />
              ))}
              {p.cardCount > 8 && <span className="card-count">×{p.cardCount}</span>}
            </div>
          </div>
        );
      })}

      <div className={`trick-area ${sweepTo ? `sweep-${seatNameById[sweepTo]}` : ''} ${state.phase === 'trickComplete' ? 'paused' : ''}`}>
        {displayTrick.map((t) => {
          const seat = seatNameById[t.playerId] || 'bottom';
          const win = t.playerId === winnerId;
          return (
            <div key={`${t.card.id}-${seat}`} className={`trick-slot ${seat}`}>
              <Card card={t.card} className={`played fly-from-${seat} ${win ? 'winner-card' : ''}`} />
            </div>
          );
        })}
      </div>

      <div className={`status ${myTurn ? 'me' : ''}`}>
        {state.phase === 'trump' && (state.hakemId === myId
          ? 'Pick the trump suit'
          : `Hakem is choosing Hokm…`)}
        {state.phase === 'playing' && (myTurn
          ? 'Your turn'
          : `Waiting for ${state.players.find((p) => p.id === state.currentPlayerId)?.name || 'player'}…`)}
        {state.phase === 'trickComplete' && 'Trick complete'}
        {state.phase === 'playing' && state.players.find((p) => p.id === state.currentPlayerId)?.connected === false && (
          <span> (waiting to reconnect)</span>
        )}
      </div>

      <div className={`seat bottom ${myTurn ? 'turn' : ''}`}>
        {state.phase === 'trump' && (
          <p className="first-five-label inline">Your first five cards</p>
        )}
        <div className="name">{seats.bottom?.name} <span className="trick-count">{seats.bottom?.tricks}</span></div>
        <div className="hand">
          {sortedHand.map((c, i) => {
            const n = sortedHand.length;
            const mid = (n - 1) / 2;
            const rot = n > 1 ? (i - mid) * Math.min(8, 52 / n) : 0;
            const lift = Math.abs(i - mid) * 3;
            const isTrump = c.suit === state.trump;
            const legal = myTurn && isLegalCard(state, c, myHand);
            const selected = selectedId === c.id;
            return (
              <Card
                key={c.id}
                card={c}
                playable={legal}
                className={`in-hand ${isTrump ? 'trump-card' : ''} ${selected ? 'selected' : ''}`}
                style={{ transform: `rotate(${rot}deg) translateY(${selected ? lift - 18 : lift}px)` }}
                onClick={() => onCardClick(c, legal)}
              />
            );
          })}
        </div>
        {myTurn && selectedId && (
          <button
            className="primary play-btn"
            onClick={() => {
              const card = myHand.find((c) => c.id === selectedId);
              if (card) playCard(card);
            }}
          >
            Play card
          </button>
        )}
      </div>

      {state.phase === 'trump' && state.hakemId === myId && (
        <TrumpPicker hand={myHand} onError={onError} />
      )}
      {state.phase === 'roundOver' && <RoundOverOverlay state={state} onError={onError} />}
      {state.phase === 'gameOver' && (
        <GameOverOverlay state={state} myId={myId} onError={onError} onLeave={onLeave} />
      )}
    </div>
  );
}
