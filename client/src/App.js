import React, { useCallback, useEffect, useState } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import Table from './components/Table';

const SESSION_KEY = 'hokm-session';

const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
};

export default function App() {
  const [conn, setConn] = useState(socket.connected ? 'connected' : 'connecting');
  const [session, setSession] = useState(loadSession());
  const [state, setState] = useState(null);
  const [toast, setToast] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    let toastTimer;
    let flashTimer;
    const showToast = (msg) => {
      setToast(msg);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setToast(null), 2800);
    };

    let firstConnect = true;
    const onConnect = () => {
      setConn('connected');
      if (!firstConnect) {
        setFlash('Reconnected');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => setFlash(null), 1600);
      }
      firstConnect = false;
      const s = loadSession();
      if (s?.code && s?.playerId && s?.token) {
        socket.emit('rejoin', s, (res) => {
          if (!res?.ok) {
            localStorage.removeItem(SESSION_KEY);
            setSession(null);
            setState(null);
            if (res?.error) showToast(res.error);
          }
        });
      }
    };
    const onDisconnect = () => setConn('reconnecting');
    const onState = (s) => setState(s);
    const onError = (e) => showToast(e?.error || 'Something went wrong');
    const onEvents = (events) => {
      const err = events.find((ev) => ev.type === 'RULE_VIOLATION');
      if (err) showToast(err.message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('gameState', onState);
    socket.on('gameError', onError);
    socket.on('gameEvents', onEvents);
    if (socket.connected) onConnect();
    else setConn(socket.connected ? 'connected' : 'connecting');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('gameState', onState);
      socket.off('gameError', onError);
      socket.off('gameEvents', onEvents);
      clearTimeout(toastTimer);
      clearTimeout(flashTimer);
    };
  }, []);

  const onError = useCallback((msg) => setToast(msg), []);
  const onSession = useCallback((s) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  }, []);
  const leave = useCallback(() => {
    socket.emit('leaveRoom', () => {});
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setState(null);
  }, []);

  const inGame = session && state && state.phase !== 'lobby';

  return (
    <div className="app">
      <div key={state?.phase || 'lobby'} className="phase-fade">
        {!inGame ? (
          <Lobby state={state} session={session} onSession={onSession} onError={onError} onLeave={leave} />
        ) : (
          <>
            <Table state={state} myId={session.playerId} onError={onError} onLeave={leave} />
            <button className="leave" onClick={leave}>Leave</button>
          </>
        )}
      </div>
      {conn !== 'connected' && (
        <div className="conn-banner">{conn === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</div>
      )}
      {conn === 'connected' && flash && <div className="conn-flash">{flash}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
