import { io } from 'socket.io-client';

// Render serves the client and server from one origin in production. CRA's
// development proxy does not reliably upgrade Socket.IO WebSocket requests,
// so local development connects to the backend port directly.
const developmentServerUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
const serverUrl = process.env.REACT_APP_SERVER_URL
  || (process.env.NODE_ENV === 'development' ? developmentServerUrl : window.location.origin);

const socket = io(serverUrl, {
  transports: ['websocket', 'polling'],
});

export default socket;
