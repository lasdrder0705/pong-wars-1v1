'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  consumeFrameBudget,
  isRelayAllowedForRole,
  safeJsonByteLength
} = require('../server.js');

const ROOT = path.resolve(__dirname, '..');
let child;
let port;

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: encodeURI(pathname),
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.once('error', reject);
    req.end();
  });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const probe = async () => {
      try {
        const response = await request('/api/info');
        if (response.status === 200) return resolve();
      } catch (_) {}
      if (Date.now() >= deadline) return reject(new Error('server did not start'));
      setTimeout(probe, 50);
    };
    probe();
  });
}

function rawRequest(source) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let output = '';
    const timer = setTimeout(() => socket.destroy(), 1000);
    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\r\n\r\n')) socket.destroy();
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(output);
    });
    socket.on('connect', () => socket.end(source));
  });
}

function openRawWebSocket() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('websocket handshake timeout'));
    }, 1500);
    let response = Buffer.alloc(0);
    const onError = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    const onData = (chunk) => {
      response = Buffer.concat([response, chunk]);
      const boundary = response.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      clearTimeout(timer);
      socket.off('error', onError);
      socket.off('data', onData);
      assert.match(response.subarray(0, boundary).toString('utf8'), /^HTTP\/1\.1 101 /);
      socket.on('data', () => {});
      resolve(socket);
    };
    socket.once('error', onError);
    socket.on('data', onData);
    socket.on('connect', () => {
      socket.write(
        `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        `Origin: http://127.0.0.1:${port}\r\n\r\n`
      );
    });
  });
}

function maskedControlFrame(opcode) {
  return Buffer.from([0x80 | opcode, 0x80, 0x12, 0x34, 0x56, 0x78]);
}

function maskedTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const encoded = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) encoded[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, encoded]);
}

test.before(async () => {
  port = await reservePort();
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      GAME_PUBLIC_ORIGINS: 'https://game.example.com'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForServer();
});

test.after(() => {
  if (child && child.exitCode == null) child.kill('SIGTERM');
});

test('静态服务只公开运行游戏所需的精确资源', async () => {
  const publicPaths = [
    '/', '/index.html', '/style.css', '/vendor/peerjs.min.js',
    '/js/audio.js', '/js/particles.js', '/js/physics.js', '/js/ai.js',
    '/js/network.js', '/js/game.js', '/js/main.js'
  ];
  for (const pathname of publicPaths) {
    assert.equal((await request(pathname)).status, 200, pathname);
  }

  const privatePaths = [
    '/server.js', '/README.md', '/package.json',
    '/android/app/build.gradle', '/Android/app/build.gradle',
    '/copyright_docs/1_软件源代码文档.pdf',
    '/COPYRIGHT_DOCS/1_软件源代码文档.pdf',
    '/dist/pong-wars-1v1-debug.apk', '/.git/config', '/unknown.txt'
  ];
  for (const pathname of privatePaths) {
    assert.equal((await request(pathname)).status, 404, pathname);
  }
});

test('HTTP 仅允许 GET/HEAD 且不返回通配 CORS', async () => {
  const health = await request('/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body.toString('utf8')), { ok: true });
  const head = await request('/index.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['access-control-allow-origin'], undefined);
  assert.equal((await request('/index.html', { method: 'POST' })).status, 405);
  assert.equal((await request('/api/info', { method: 'PUT' })).status, 405);
});

test('畸形 Host 只能关闭当前请求，服务进程继续响应', async () => {
  await rawRequest(
    'GET /api/info HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n'
  );
  const health = await request('/api/info');
  assert.equal(health.status, 200);
});

test('WebSocket 拒绝不可信来源和结构错误的握手', async () => {
  const badOrigin = await rawRequest(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Version: 13\r\n' +
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
    'Origin: https://attacker.invalid\r\n\r\n'
  );
  assert.match(badOrigin, /^HTTP\/1\.1 403 /);

  const badKey = await rawRequest(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: nope\r\n' +
    `Origin: http://127.0.0.1:${port}\r\n\r\n`
  );
  assert.doesNotMatch(badKey, /^HTTP\/1\.1 101 /);

  const localhostOrigin = await rawRequest(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Version: 13\r\n' +
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
    `Origin: http://localhost:${port}\r\n\r\n`
  );
  assert.match(localhostOrigin, /^HTTP\/1\.1 101 /);

  const configuredPublicOrigin = await rawRequest(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Version: 13\r\n' +
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
    'Origin: https://game.example.com\r\n\r\n'
  );
  assert.match(configuredPublicOrigin, /^HTTP\/1\.1 101 /);
});

test('WebSocket 中继按房主与访客角色限制权威消息方向', () => {
  assert.equal(isRelayAllowedForRole('host', 'init_game'), true);
  assert.equal(isRelayAllowedForRole('host', 'game_state_sync'), true);
  assert.equal(isRelayAllowedForRole('host', 'paddle_input'), false);
  assert.equal(isRelayAllowedForRole('host', 'action_skill'), false);
  assert.equal(isRelayAllowedForRole('host', 'action_laser'), false);
  assert.equal(isRelayAllowedForRole('host', 'pause_request'), false);

  assert.equal(isRelayAllowedForRole('guest', 'init_game'), false);
  assert.equal(isRelayAllowedForRole('guest', 'game_state_sync'), false);
  assert.equal(isRelayAllowedForRole('guest', 'paddle_input'), true);
  assert.equal(isRelayAllowedForRole('guest', 'action_skill'), true);
  assert.equal(isRelayAllowedForRole('guest', 'action_laser'), true);
  assert.equal(isRelayAllowedForRole('guest', 'pause_request'), true);
  assert.equal(isRelayAllowedForRole(null, 'game_state_sync'), false);
});

test('WebSocket 中继序列化异常不会逃逸到进程级错误', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(safeJsonByteLength(cyclic), Infinity);
  assert.equal(safeJsonByteLength({ type: 'pause_request', paused: true }), 38);
});

test('WebSocket 五秒窗口同时限制帧数与累计字节数', () => {
  const socket = {
    destroyed: false,
    destroy() {
      this.destroyed = true;
    }
  };
  const client = {
    socket,
    rateWindowStarted: Date.now(),
    frameCount: 0,
    byteCount: 0
  };
  for (let i = 0; i < 16; i++) {
    assert.equal(consumeFrameBudget(client, 256 * 1024), true);
  }
  assert.equal(consumeFrameBudget(client, 1), false);
  assert.equal(socket.destroyed, true);
});

test('深层合法 JSON 只丢弃异常消息且服务继续健康', async () => {
  const socket = await openRawWebSocket();
  const nested = `${'['.repeat(10000)}0${']'.repeat(10000)}`;
  const relay = `{"type":"relay","data":{"type":"game_state_sync","x":${nested}}}`;
  socket.write(Buffer.concat([
    maskedTextFrame('{"type":"create"}'),
    maskedTextFrame(relay)
  ]));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const health = await request('/healthz');
  socket.destroy();
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body.toString('utf8')), { ok: true });
});

test('WebSocket 控制帧与文本帧共享连接速率预算', async () => {
  const socket = await openRawWebSocket();
  const closed = new Promise((resolve) => socket.once('close', () => resolve(true)));
  socket.write(Buffer.concat(
    Array.from({ length: 301 }, () => maskedControlFrame(0x9))
  ));
  const didClose = await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(() => resolve(false), 1000))
  ]);
  if (!didClose) socket.destroy();
  assert.equal(didClose, true);
});
