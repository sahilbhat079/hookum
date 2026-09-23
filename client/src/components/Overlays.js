import React from 'react';
import socket from '../socket';

export function RoundOverOverlay({ state, onError }) {
  const round = state.history?.[state.history.length - 1];
  if (!round) return null;
  return (
    <div className="overlay">
      <div className="modal">
        <h2 className="gold">
          Team {round.team} takes the round{round.kot || round.points > 1 ? ' — KOT!' : ''}
        </h2>
        <p className="final-score">Tricks {round.trickCounts.team1} — {round.trickCounts.team2}</p>
        <p className="final-score small">
          Match {state.scores.team1.matchScore} — {state.scores.team2.matchScore}
        </p>
        <button className="primary" onClick={() => socket.emit('nextRound', (res) => !res.ok && onError(res.error))}>
          Next Round
        </button>
      </div>
    </div>
  );
}

export function GameOverOverlay({ state, myId, onError, onLeave }) {
  const isHost = state.hostId === myId;
  const winner = state.scores.team1.matchScore >= state.rules.targetScore ? 1 : 2;
  return (
    <div className="overlay">
      <div className="modal">
        <h2 className="gold">Team {winner} wins the game!</h2>
        <p className="final-score">{state.scores.team1.matchScore} — {state.scores.team2.matchScore}</p>
        <ul className="history">
          {state.history.map((h) => (
            <li key={h.round}>
              Round {h.round}: Team {h.team} {h.trickCounts.team1}–{h.trickCounts.team2}
              {h.kot ? ' (kot)' : ''} +{h.points}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          {isHost ? (
            <button className="primary" onClick={() => socket.emit('playAgain', (res) => !res.ok && onError(res.error))}>
              Play Again
            </button>
          ) : (
            <p className="hint">Waiting for host…</p>
          )}
          <button onClick={onLeave}>Leave Room</button>
        </div>
      </div>
    </div>
  );
}
