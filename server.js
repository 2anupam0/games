/* ============== Football Legends - WebSocket Server ==============
   Usage: npm install ws && node server.js
   Deploy to Render/Railway/Fly.io for public access.
   Set PORT env var or defaults to 3000.
   ================================================================ */
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const server = new WebSocket.Server({ port: PORT });

const rooms = {};
const randomQueue = [];

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

server.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(ws, msg);
    } catch (e) {
      sendTo(ws, { type: 'error', message: 'Invalid message format' });
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => {});
});

function sendTo(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function getOpponent(ws) {
  if (!ws.room || !rooms[ws.room]) return null;
  const room = rooms[ws.room];
  return ws.role === 'host' ? room.joiner : room.host;
}

function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'create_room': {
      const code = genCode();
      rooms[code] = { host: ws, joiner: null, code };
      ws.room = code;
      ws.role = 'host';
      sendTo(ws, { type: 'room_created', code });
      break;
    }

    case 'join_room': {
      const room = rooms[msg.code];
      if (!room) { sendTo(ws, { type: 'error', message: 'Room not found' }); return; }
      if (room.joiner) { sendTo(ws, { type: 'error', message: 'Room is full' }); return; }
      room.joiner = ws;
      ws.room = msg.code;
      ws.role = 'joiner';
      sendTo(ws, { type: 'joined', code: msg.code });
      sendTo(room.host, { type: 'opponent_joined' });
      break;
    }

    case 'random_match': {
      if (randomQueue.length > 0) {
        const opponent = randomQueue.shift();
        if (opponent.readyState === WebSocket.OPEN) {
          const code = genCode();
          rooms[code] = { host: opponent, joiner: ws, code };
          opponent.room = code; opponent.role = 'host';
          ws.room = code; ws.role = 'joiner';
          sendTo(opponent, { type: 'match_found', code, role: 'host' });
          sendTo(ws, { type: 'match_found', code, role: 'joiner' });
        } else {
          randomQueue.push(ws);
        }
      } else {
        randomQueue.push(ws);
        sendTo(ws, { type: 'searching' });
      }
      break;
    }

    case 'cancel_match': {
      const idx = randomQueue.indexOf(ws);
      if (idx > -1) randomQueue.splice(idx, 1);
      break;
    }

    case 'game_data': {
      const opp = getOpponent(ws);
      if (opp) sendTo(opp, { type: 'game_data', data: msg.data });
      break;
    }

    case 'new_game': {
      const opp = getOpponent(ws);
      if (opp) sendTo(opp, { type: 'new_game' });
      break;
    }

    case 'ping': {
      sendTo(ws, { type: 'pong' });
      break;
    }

    default: {
      sendTo(ws, { type: 'error', message: 'Unknown message type: ' + msg.type });
    }
  }
}

function handleDisconnect(ws) {
  const idx = randomQueue.indexOf(ws);
  if (idx > -1) randomQueue.splice(idx, 1);

  if (ws.room && rooms[ws.room]) {
    const opp = getOpponent(ws);
    if (opp) sendTo(opp, { type: 'opponent_disconnected' });
    delete rooms[ws.room];
  }
}

/* Heartbeat — ping every 30s, terminate unresponsive clients */
const heartbeat = setInterval(() => {
  server.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.on('close', () => clearInterval(heartbeat));

console.log(`🏁 Football Legends Server running on port ${PORT}`);
console.log(`   Connect your game client to: ws://localhost:${PORT}`);
console.log(`   For production, use: wss://your-domain.com`);
