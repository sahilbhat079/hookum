const crypto = require('crypto');
const HokmEngine = require('./engine');

const ROOM_TTL_MS = 60 * 60 * 1000;

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom() {
    let code;
    do {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    const room = {
      code,
      engine: new HokmEngine(),
      sockets: {},
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    if (!code || typeof code !== 'string') return undefined;
    return this.rooms.get(code.trim().toUpperCase());
  }

  touch(room) {
    if (room) room.lastActive = Date.now();
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const anyoneConnected = room.engine.players.some((p) => p.connected);
      if (!anyoneConnected && now - room.lastActive > ROOM_TTL_MS) this.rooms.delete(code);
    }
  }

  get count() {
    return this.rooms.size;
  }
}

module.exports = RoomManager;
