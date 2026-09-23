import React, { useState } from 'react';
import socket from '../socket';

export default function Lobby({ state, session, onSession, onError, onLeave }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = (event, body) => {
    setBusy(true);
    socket.emit(event, body, (res) => {
      setBusy(false);
      if (!res?.ok) return onError(res?.error || 'Could not join');
      onSession({ code: res.code, playerId: res.playerId, token: res.token });
    });
  };

  // Avoid presenting create/join controls while App is restoring a saved
  // session after a refresh or temporary connection loss.
  if (session && !state) {
    return (
      <div className="lobby panel">
        <h1 className="logo">HOKM <span className="fa">حکم</span></h1>
        <p className="hint">Restoring your room…</p>
        <button onClick={onLeave}>Leave room</button>
      </div>
    );
  }

  if (session && state) {
    const isHost = state.hostId === session.playerId;
    const slots = Array.from({ length: state.rules?.playersPerGame || 4 });
    return (
      <div className="lobby panel">
        <h1 className="logo">HOKM <span className="fa">حکم</span></h1>
        <div className="room-code">
          Room Code{' '}
          <button className="code" onClick={() => navigator.clipboard?.writeText(session.code)}>
            {session.code}
          </button>
        </div>
        <ul className="player-list">
          {slots.map((_, i) => {
            const p = state.players.find((pl) => pl.seat === i) || state.players[i];
            return (
              <li key={i} className={p ? 'filled' : ''}>
                <span className="seat-n">Seat {i + 1}</span>
                {p ? (
                  <>
                    {p.name}
                    {!p.connected && ' · away'}
                    {p.isHost && ' · host'}
                    <span className="team">Team {p.team}</span>
                  </>
                ) : (
                  'Waiting…'
                )}
              </li>
            );
          })}
        </ul>
        {isHost ? (
          <button
            className="primary"
            onClick={() => socket.emit('startGame', (res) => !res.ok && onError(res.error))}
            disabled={state.players.length < 4}
          >
            Start Game
          </button>
        ) : (
          <p className="hint">Waiting for the host to start…</p>
        )}
        <button onClick={onLeave}>Leave room</button>
      </div>
    );
  }

  return (
    <div className="lobby panel">
      <h1 className="logo">HOKM <span className="fa">حکم</span></h1>
      <p className="tagline">Four players. Two teams. One trump.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} />
      <button className="primary" onClick={() => run('createRoom', { name: name.trim() })} disabled={busy}>
        Create Room
      </button>
      <div className="divider"><span>or join</span></div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Room code"
        maxLength={6}
      />
      <button onClick={() => run('joinRoom', { code: code.trim(), name: name.trim() })} disabled={busy || code.trim().length < 4}>
        Join Room
      </button>
    </div>
  );
}
