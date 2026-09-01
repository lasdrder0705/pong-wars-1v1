/**
 * 昼夜领地对战 V1.0 LAN HTTP + WebSocket relay
 * Run: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const parsedPort = Number(process.env.PORT || 8080);
const PORT = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535
  ? parsedPort
  : 8080;
const GAME_BIND_HOST = String(process.env.GAME_BIND_HOST || '0.0.0.0').trim() || '0.0.0.0';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME_BYTES = 256 * 1024;
const MAX_BUFFERED_WRITE_BYTES = MAX_FRAME_BYTES * 2;
const RATE_WINDOW_MS = 5000;
const MAX_FRAMES_PER_WINDOW = 300;
const MAX_BYTES_PER_WINDOW = 4 * 1024 * 1024;

function parsePublicOrigins(rawValue) {
  const origins = new Set();
  if (typeof rawValue !== 'string') return origins;
  for (const token of rawValue.split(',')) {
    const candidate = token.trim();
    if (!candidate) continue;
    try {
      const origin = new URL(candidate);
      const validProtocol = origin.protocol === 'http:' || origin.protocol === 'https:';
      const originOnly = origin.pathname === '/' && !origin.search && !origin.hash;
      if (validProtocol && originOnly && !origin.username && !origin.password) {
        origins.add(origin.origin);
      }
    } catch (_) {}
  }
  return origins;
}

const GAME_PUBLIC_ORIGINS = parsePublicOrigins(process.env.GAME_PUBLIC_ORIGINS);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json'
};

const PUBLIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/style.css', 'style.css'],
  ['/vendor/peerjs.min.js', 'vendor/peerjs.min.js'],
  ['/js/audio.js', 'js/audio.js'],
  ['/js/particles.js', 'js/particles.js'],
  ['/js/physics.js', 'js/physics.js'],
  ['/js/ai.js', 'js/ai.js'],
  ['/js/network.js', 'js/network.js'],
  ['/js/game.js', 'js/game.js'],
  ['/js/main.js', 'js/main.js']
]);

const HOST_RELAY_MESSAGE_TYPES = new Set([
  'init_game',
  'game_state_sync'
]);

const GUEST_RELAY_MESSAGE_TYPES = new Set([
  'paddle_input',
  'action_skill',
  'action_laser',
  'pause_request'
]);

const PUBLIC_ROOT = fs.realpathSync(__dirname);

const rooms = new Map();

function getLocalIPs() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }
  return [...new Set(addresses)];
}

function getLocalIP() {
  return getLocalIPs()[0] || 'localhost';
}

function parseRequestTarget(rawTarget) {
  if (typeof rawTarget !== 'string' || rawTarget.length > 4096) return null;
  try {
    return new URL(rawTarget, 'http://127.0.0.1');
  } catch (_) {
    return null;
  }
}

function resolvePublicFile(urlPath) {
  const target = parseRequestTarget(urlPath);
  if (!target) return null;
  const relativePath = PUBLIC_FILES.get(target.pathname);
  return relativePath ? path.resolve(PUBLIC_ROOT, relativePath) : null;
}

function sendJson(req, res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendText(req, res, code, message, extraHeaders = {}) {
  const body = Buffer.from(message);
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((req, res) => {
  const url = parseRequestTarget(req.url);
  if (!url) {
    sendText(req, res, 400, '400 Bad Request');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(req, res, 405, '405 Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }
  if (url.pathname === '/api/info') {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : PORT;
    sendJson(req, res, 200, { ip: getLocalIP(), port: actualPort, ws: true });
    return;
  }
  if (url.pathname === '/healthz') {
    sendJson(req, res, 200, { ok: true });
    return;
  }

  const filePath = resolvePublicFile(req.url);
  if (!filePath) {
    sendText(req, res, 404, '404 Not Found');
    return;
  }

  fs.realpath(filePath, (realPathError, realPath) => {
    const insideRoot = realPath === PUBLIC_ROOT ||
      (realPath && realPath.startsWith(PUBLIC_ROOT + path.sep));
    if (realPathError || !insideRoot) {
      sendText(req, res, 404, '404 Not Found');
      return;
    }

    fs.stat(realPath, (err, stats) => {
      if (err || !stats.isFile()) {
        sendText(req, res, 404, '404 Not Found');
        return;
      }
      const ext = path.extname(realPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(realPath);
      stream.once('error', () => res.destroy());
      stream.pipe(res);
    });
  });
});

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeTextFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeControlFrame(opcode, payload) {
  const data = payload || Buffer.alloc(0);
  const header = Buffer.alloc(2);
  header[0] = 0x80 | opcode;
  header[1] = data.length;
  return Buffer.concat([header, data]);
}

function tryParseFrame(buf) {
  if (buf.length < 2) return null;
  const finished = (buf[0] & 0x80) !== 0;
  const hasReservedBits = (buf[0] & 0x70) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (!finished || hasReservedBits || !masked) return { error: 'invalid-frame' };
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(MAX_FRAME_BYTES)) return { error: 'too-large' };
    len = Number(big);
    offset = 10;
  }
  if (len > MAX_FRAME_BYTES) return { error: 'too-large' };
  if (opcode >= 0x8 && len > 125) return { error: 'invalid-control-frame' };
  if (buf.length < offset + 4 + len) return null;
  const mask = buf.subarray(offset, offset + 4);
  const encoded = buf.subarray(offset + 4, offset + 4 + len);
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) payload[i] = encoded[i] ^ mask[i % 4];
  return { opcode, payload, rest: buf.subarray(offset + 4 + len) };
}

function wsSend(client, obj) {
  if (!client || !client.socket || client.socket.destroyed) return;
  try {
    if (client.socket.writableLength > MAX_BUFFERED_WRITE_BYTES) {
      client.socket.destroy();
      return;
    }
    client.socket.write(encodeTextFrame(JSON.stringify(obj)));
  } catch (_) {}
}

function isAlive(client) {
  return client && client.socket && !client.socket.destroyed;
}

function allocRoomCode() {
  const start = crypto.randomInt(0, 9000);
  for (let i = 0; i < 9000; i++) {
    const code = String(1000 + ((start + i) % 9000));
    const room = rooms.get(code);
    if (!room) return code;
    if (!isAlive(room.host) && !isAlive(room.guest)) {
      rooms.delete(code);
      return code;
    }
  }
  return null;
}

function otherPeer(room, client) {
  if (!room) return null;
  return client === room.host ? room.guest : room.host;
}

function isRelayAllowedForRole(role, messageType) {
  if (role === 'host') return HOST_RELAY_MESSAGE_TYPES.has(messageType);
  if (role === 'guest') return GUEST_RELAY_MESSAGE_TYPES.has(messageType);
  return false;
}

function consumeFrameBudget(client, payloadBytes) {
  const now = Date.now();
  if (now - client.rateWindowStarted >= RATE_WINDOW_MS) {
    client.rateWindowStarted = now;
    client.frameCount = 0;
    client.byteCount = 0;
  }
  client.frameCount++;
  client.byteCount = (Number.isFinite(client.byteCount) ? client.byteCount : 0) + payloadBytes;
  if (client.frameCount > MAX_FRAMES_PER_WINDOW ||
      client.byteCount > MAX_BYTES_PER_WINDOW ||
      payloadBytes > MAX_FRAME_BYTES) {
    client.socket.destroy();
    return false;
  }
  return true;
}

function leaveRoom(client) {
  if (!client || !client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  const peer = otherPeer(room, client);
  if (room.host === client) room.host = null;
  if (room.guest === client) room.guest = null;
  if (peer) wsSend(peer, { type: 'peer_left' });
  if (!isAlive(room.host) && !isAlive(room.guest)) rooms.delete(client.roomCode);
  client.roomCode = null;
  client.role = null;
}

function safeJsonByteLength(value) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      ? Buffer.byteLength(serialized, 'utf8')
      : Infinity;
  } catch (_) {
    return Infinity;
  }
}

function handleWsMessage(client, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch (_) {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'create') {
    leaveRoom(client);
    const code = allocRoomCode();
    if (!code) {
      wsSend(client, { type: 'error', message: '房间已满，请稍后重试' });
      return;
    }
    rooms.set(code, { host: client, guest: null });
    client.role = 'host';
    client.roomCode = code;
    wsSend(client, { type: 'created', code });
    return;
  }

  if (msg.type === 'join') {
    const code = String(msg.code || '').trim();
    if (!/^\d{4}$/.test(code)) {
      wsSend(client, { type: 'error', message: '房间码必须是4位数字' });
      return;
    }
    const room = rooms.get(code);
    if (!room || !isAlive(room.host)) {
      wsSend(client, { type: 'error', message: '房间不存在或房主已离开' });
      return;
    }
    if (isAlive(room.guest)) {
      wsSend(client, { type: 'error', message: '房间已满' });
      return;
    }
    leaveRoom(client);
    room.guest = client;
    client.role = 'guest';
    client.roomCode = code;
    wsSend(client, { type: 'joined', code });
    wsSend(room.host, { type: 'peer_joined', code });
    return;
  }

  if (msg.type === 'relay') {
    if (!msg.data || typeof msg.data !== 'object' ||
        !isRelayAllowedForRole(client.role, msg.data.type)) return;
    if (safeJsonByteLength(msg.data) > MAX_FRAME_BYTES) return;
    const room = rooms.get(client.roomCode);
    const peer = otherPeer(room, client);
    if (peer) wsSend(peer, { type: 'relay', data: msg.data });
  }
}

function attachWsClient(socket) {
  const client = {
    socket,
    role: null,
    roomCode: null,
    buf: Buffer.alloc(0),
    rateWindowStarted: Date.now(),
    frameCount: 0,
    byteCount: 0
  };
  socket.on('data', (chunk) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    if (client.buf.length > MAX_FRAME_BYTES + 14) {
      socket.destroy();
      return;
    }
    while (true) {
      const parsed = tryParseFrame(client.buf);
      if (!parsed) break;
      if (parsed.error) {
        socket.destroy();
        return;
      }
      client.buf = parsed.rest;
      if (!consumeFrameBudget(client, parsed.payload.length)) return;
      if (parsed.opcode === 0x8) {
        try { socket.write(encodeControlFrame(0x8, parsed.payload)); } catch (_) {}
        socket.end();
        return;
      }
      if (parsed.opcode === 0x9) {
        try { socket.write(encodeControlFrame(0xa, parsed.payload)); } catch (_) {}
        continue;
      }
      if (parsed.opcode === 0x1) {
        handleWsMessage(client, parsed.payload.toString('utf8'));
      } else if (parsed.opcode !== 0x0a) {
        socket.destroy();
        return;
      }
    }
  });
  socket.on('close', () => leaveRoom(client));
  socket.on('error', () => leaveRoom(client));
}

function headerHasToken(value, expected) {
  return typeof value === 'string' && value
    .split(',')
    .some((token) => token.trim().toLowerCase() === expected);
}

function validWebSocketKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64').length === 16;
  } catch (_) {
    return false;
  }
}

function isAllowedWsOrigin(rawOrigin, port, publicOrigins = GAME_PUBLIC_ORIGINS) {
  if (typeof rawOrigin !== 'string' || rawOrigin.includes(',')) return false;
  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch (_) {
    return false;
  }
  if (origin.origin !== rawOrigin || origin.username || origin.password) return false;
  if (publicOrigins && typeof publicOrigins.has === 'function' &&
      publicOrigins.has(origin.origin)) return true;
  if ((origin.protocol === 'http:' || origin.protocol === 'https:') &&
      origin.hostname === 'appassets.androidplatform.net') {
    return !origin.port;
  }
  if (origin.protocol !== 'http:') return false;
  const originPort = origin.port || '80';
  if (originPort !== String(port)) return false;
  return new Set(['localhost', '127.0.0.1', ...getLocalIPs()]).has(origin.hostname);
}

function rejectUpgrade(socket, statusCode, reason) {
  const message = `${statusCode} ${reason}`;
  try {
    socket.end(
      `HTTP/1.1 ${message}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n` +
      message
    );
  } catch (_) {
    socket.destroy();
  }
}

server.on('upgrade', (req, socket) => {
  const url = parseRequestTarget(req.url);
  if (!url || url.pathname !== '/ws') {
    rejectUpgrade(socket, 404, 'Not Found');
    return;
  }
  const key = req.headers['sec-websocket-key'];
  const validHandshake = req.method === 'GET' &&
    headerHasToken(req.headers.upgrade, 'websocket') &&
    headerHasToken(req.headers.connection, 'upgrade') &&
    req.headers['sec-websocket-version'] === '13' &&
    validWebSocketKey(key);
  if (!validHandshake) {
    rejectUpgrade(socket, 400, 'Bad Request');
    return;
  }
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : PORT;
  if (!isAllowedWsOrigin(req.headers.origin, actualPort)) {
    rejectUpgrade(socket, 403, 'Forbidden');
    return;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n` +
    '\r\n'
  );
  attachWsClient(socket);
});

if (require.main === module) {
  server.listen(PORT, GAME_BIND_HOST, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : PORT;
    const localIP = getLocalIP();
    console.log('====================================================');
    console.log('  昼夜领地对战 V1.0 本地与局域网服务已启动');
    console.log(`  · 本机访问:   http://localhost:${actualPort}`);
    console.log(`  · 局域网访问: http://${localIP}:${actualPort}`);
    console.log('  手机/APK 连同一 Wi-Fi，填此 IP 后用房间码对战');
    console.log('====================================================');
  });
}

module.exports = {
  PUBLIC_FILES,
  GAME_PUBLIC_ORIGINS,
  getLocalIP,
  getLocalIPs,
  consumeFrameBudget,
  isAllowedWsOrigin,
  isRelayAllowedForRole,
  parsePublicOrigins,
  parseRequestTarget,
  resolvePublicFile,
  safeJsonByteLength,
  server,
  tryParseFrame,
  validWebSocketKey
};
