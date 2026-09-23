const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const RoomManager = require('./game/rooms');
const { PHASE } = require('./game/engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const rooms = new RoomManager();
const PORT = process.env.PORT || 3001;
const TRICK_PAUSE_MS = 1400;
const trickTimers = new Map();

app.get('/api/health', (req, res) => res.json({ ok: true, rooms: rooms.count }));

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

function log(event, extra = {}) {
  const { cards, hand, ...safe } = extra;
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...safe }));
}

function newIdentity() {
  return {
    playerId: crypto.randomUUID(),
    token: crypto.randomBytes(24).toString('hex'),
  };
}

function getCtx(socket) {
  const { code, playerId } = socket.data || {};
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.engine.playerById(playerId);
  if (!player) return null;
  // A rejoin may replace an older tab/socket for the same player. Only the
  // currently attached socket may issue actions for that player identity.
  if (room.sockets[playerId] !== socket.id) return null;
  return { room, player };
}

function fail(socket, cb, res) {
  const payload = { ok: false, error: res.error || 'Request failed', code: res.code };
  socket.emit('gameError', { error: payload.error, code: payload.code });
  cb(payload);
}

function broadcast(code, events = []) {
  const room = rooms.get(code);
  if (!room) return;
  rooms.touch(room);
  if (events.length) io.to(code).emit('gameEvents', events);
  for (const p of room.engine.players) {
    const socketId = room.sockets[p.id];
    const sock = socketId && io.sockets.sockets.get(socketId);
    if (sock) sock.emit('gameState', room.engine.getState(p.id));
  }
}

function attach(socket, room, player) {
  socket.join(room.code);
  socket.data = { code: room.code, playerId: player.id };
  room.sockets[player.id] = socket.id;
  room.engine.setConnected(player.id, true);
}

function clearTrickTimer(code) {
  const t = trickTimers.get(code);
  if (t) clearTimeout(t);
  trickTimers.delete(code);
}

function scheduleTrickAdvance(code) {
  clearTrickTimer(code);
  const t = setTimeout(() => {
    trickTimers.delete(code);
    const room = rooms.get(code);
    if (!room || room.engine.phase !== PHASE.TRICK_COMPLETE) return;
    const res = room.engine.advanceAfterTrick();
    if (!res.ok) return;
    log('trickAdvance', { code, phase: room.engine.phase });
    broadcast(code, res.events);
  }, TRICK_PAUSE_MS);
  trickTimers.set(code, t);
}

function str(v, max = 40) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name } = {}, cb = () => {}) => {
    const room = rooms.createRoom();
    const { playerId, token } = newIdentity();
    const res = room.engine.addPlayer(playerId, str(name, 20), { token });
    if (!res.ok) return fail(socket, cb, res);
    attach(socket, room, room.engine.playerById(playerId));
    log('roomCreated', { code: room.code, playerId });
    cb({ ok: true, code: room.code, playerId, token });
    broadcast(room.code);
  });

  socket.on('joinRoom', ({ code, name } = {}, cb = () => {}) => {
    const room = rooms.get(str(code, 8));
    if (!room) return fail(socket, cb, { error: 'Room does not exist' });
    const { playerId, token } = newIdentity();
    const res = room.engine.addPlayer(playerId, str(name, 20), { token });
    if (!res.ok) return fail(socket, cb, res);
    attach(socket, room, room.engine.playerById(playerId));
    log('playerJoined', { code: room.code, playerId });
    cb({ ok: true, code: room.code, playerId, token });
    broadcast(room.code);
  });

  socket.on('rejoin', ({ code, playerId, token } = {}, cb = () => {}) => {
    const room = rooms.get(str(code, 8));
    if (!room) return fail(socket, cb, { error: 'Room does not exist' });
    const id = str(playerId, 80);
    const player = room.engine.playerById(id);
    if (!player) return fail(socket, cb, { error: 'Player not found' });
    if (!room.engine.verifyToken(id, str(token, 80))) {
      return fail(socket, cb, { error: 'Please reconnect to continue' });
    }
    attach(socket, room, player);
    log('playerReconnected', { code: room.code, playerId: id });
    cb({ ok: true, code: room.code, playerId: player.id, name: player.name });
    broadcast(room.code, [{ type: 'PLAYER_RECONNECTED', playerId: id }]);
  });

  socket.on('leaveRoom', (cb = () => {}) => {
    const ctx = getCtx(socket);
    if (!ctx) return cb({ ok: true });
    const { room, player } = ctx;
    const res = room.engine.removePlayer(player.id);
    delete room.sockets[player.id];
    socket.leave(room.code);
    socket.data = {};
    log('playerLeft', { code: room.code, playerId: player.id, removed: res.removed });
    cb({ ok: true });
    broadcast(room.code, [{ type: 'PLAYER_LEFT', playerId: player.id }]);
  });

  socket.on('startGame', (cb = () => {}) => {
    const ctx = getCtx(socket);
    if (!ctx) return fail(socket, cb, { error: 'Not in a room' });
    if (ctx.room.engine.hostId !== ctx.player.id) {
      return fail(socket, cb, { error: 'Only the host can start' });
    }
    const res = ctx.room.engine.startGame();
    if (!res.ok) return fail(socket, cb, res);
    log('gameStart', { code: ctx.room.code });
    cb({ ok: true });
    broadcast(ctx.room.code, res.events);
  });

  socket.on('selectTrump', ({ suit } = {}, cb = () => {}) => {
    const ctx = getCtx(socket);
    if (!ctx) return fail(socket, cb, { error: 'Not in a room' });
    const res = ctx.room.engine.selectTrump(ctx.player.id, suit);
    if (!res.ok) return fail(socket, cb, res);
    log('trumpSelected', { code: ctx.room.code, suit });
    cb({ ok: true });
    broadcast(ctx.room.code, res.events);
  });

  socket.on('playCard', ({ cardId } = {}, cb = () => {}) => {
    const ctx = getCtx(socket);
    if (!ctx) return fail(socket, cb, { error: 'Not in a room' });
    const res = ctx.room.engine.playCard(ctx.player.id, typeof cardId === 'string' ? cardId : '');
    if (!res.ok) return fail(socket, cb, res);
    log('cardPlayed', { code: ctx.room.code, playerId: ctx.player.id, phase: ctx.room.engine.phase });
    cb({ ok: true });
    broadcast(ctx.room.code, res.events);
    if (ctx.room.engine.phase === PHASE.TRICK_COMPLETE) scheduleTrickAdvance(ctx.room.code);
  });

  socket.on('nextRound', (cb = () => {}) => {
    const ctx = getCtx(socket);
    if (!ctx) return fail(socket, cb, { error: 'Not in a room' });
    const res = ctx.room.engine.nextRound();
    if (!res.ok) return fail(socket, cb, res);
    log('nextRound', { code: ctx.room.code, round: ctx.room.engine.roundNumber });
    cb({ ok: true });
    broadcast(ctx.room.code, res.events);
  });

  socket.on('playAgain', (cb = () => {}) => {
    const ctx = getCtx(socket);
    if (!ctx) return fail(socket, cb, { error: 'Not in a room' });
    const res = ctx.room.engine.playAgain(ctx.player.id);
    if (!res.ok) return fail(socket, cb, res);
    log('playAgain', { code: ctx.room.code });
    cb({ ok: true });
    broadcast(ctx.room.code, res.events);
  });

  socket.on('disconnect', () => {
    const ctx = getCtx(socket);
    if (!ctx) return;
    if (ctx.room.sockets[ctx.player.id] !== socket.id) return;
    ctx.room.engine.setConnected(ctx.player.id, false);
    log('disconnect', { code: ctx.room.code, playerId: ctx.player.id });
    broadcast(ctx.room.code);
  });
});

setInterval(() => rooms.sweep(), 10 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`Hokm server listening on :${PORT}`));
