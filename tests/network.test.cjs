'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, clone, linkManagers } = require('./helpers/game-fixture.cjs');

function makeOnlinePair() {
  const host = createGame().game;
  const guest = createGame().game;
  host.start();
  guest.start();
  host.mode = guest.mode = 'lan';
  host.isOnline = guest.isOnline = true;
  host.isHost = true;
  guest.isHost = false;
  host.network.isOnline = guest.network.isOnline = true;
  host.network.isHost = true;
  guest.network.isHost = false;
  host.network.mySide = 'day';
  guest.network.mySide = 'night';
  host.playerSide = 'day';
  guest.playerSide = 'night';
  linkManagers(host.network, guest.network);
  return { host, guest };
}

test('HTTPS 域名使用同源 WSS，Android 本地资源域保留手动中继', () => {
  const { context, game } = createGame();
  context.location = {
    protocol: 'https:',
    hostname: 'game.example.com',
    host: 'game.example.com'
  };

  assert.equal(game.network.shouldUseSecureSameOriginRelay(), true);
  game.network.preferredWsUrl = 'ws://192.168.1.10:8080/ws';
  game.network.useSameOriginRelay();
  assert.equal(game.network.preferredWsUrl, null);
  assert.equal(game.network._wsUrl(), 'wss://game.example.com/ws');

  context.location = {
    protocol: 'https:',
    hostname: 'appassets.androidplatform.net',
    host: 'appassets.androidplatform.net'
  };
  assert.equal(game.network.shouldUseSecureSameOriginRelay(), false);
});

test('HTTPS 域名中继失败时不静默回退到第三方 PeerJS', async () => {
  const { context, game } = createGame();
  context.location = {
    protocol: 'https:',
    hostname: 'game.example.com',
    host: 'game.example.com'
  };
  game.network._ensureWs = async () => false;
  let peerFallbacks = 0;
  let callbackError = null;
  game.network._createPeerRoom = (callback) => {
    peerFallbacks++;
    if (callback) callback(null, '1234');
  };

  await game.network.createRoom(null, (error) => {
    callbackError = error;
  });

  assert.equal(peerFallbacks, 0);
  assert.equal(callbackError && callbackError.message, 'secure-relay-unavailable');
});

test('访客在开始比赛前采用房主完整规则并重建网格', () => {
  const { game } = createGame();
  game.network.handleIncomingData({
    type: 'init_game',
    yourSide: 'night',
    hostSide: 'day',
    theme: 'void',
    timeLimit: 120,
    squareSize: 30
  });

  assert.equal(game.currentThemeKey, 'void');
  assert.equal(game.timeLimit, 120);
  assert.equal(game.timeLeft, 120);
  assert.equal(game.squareSize, 30);
  assert.equal(game.gridX, 20);
  assert.equal(game.gridY, 20);
  assert.equal(game.totalSquares, 400);
  assert.equal(game.physics.numSquaresX, 20);
  assert.equal(game.physics.numSquaresY, 20);
  assert.equal(game.physics.squareSize, 30);
  assert.equal(game.squares.length, 20);
  assert.ok(game.squares.every((column) => column.length === 20));
  assert.equal(game.stoneGrid.length, 20);
  assert.ok(game.stoneGrid.every((column) => column.length === 20));
  assert.ok(game.balls.every((ball) => ball.radius === 15));
  assert.equal(game.state, 'running');
  assert.doesNotThrow(() => game.calculateTerritory());
});

test('非法网格尺寸不会修改规则或分配异常网格', () => {
  const { game } = createGame();
  const before = [game.squareSize, game.gridX, game.gridY, game.physics];
  for (const value of [0, 1, Number.NaN, 999999, '25']) {
    assert.equal(game.setGridSize(value), false);
    assert.deepEqual(
      [game.squareSize, game.gridX, game.gridY, game.physics],
      before
    );
  }
});

test('暂停和恢复请求由房主裁决并在双方幂等同步', () => {
  const { host, guest } = makeOnlinePair();

  guest.network.requestPause(true);
  assert.equal(host.state, 'paused');
  assert.equal(guest.state, 'paused');

  guest.network.requestPause(true);
  assert.equal(host.state, 'paused');
  assert.equal(guest.state, 'paused');

  host.network.requestPause(false);
  assert.equal(host.state, 'running');
  assert.equal(guest.state, 'running');
});

test('房主在访客离开后保留房间并可与新访客重新开局', () => {
  const { game } = createGame();
  const sent = [];
  game.start();
  game.setPaused(true);
  game.mode = 'lan';
  game.isOnline = true;
  game.isHost = true;
  game.network.isOnline = true;
  game.network.isHost = true;
  game.network._matchStarted = true;
  game.network.transport = 'peer';
  game.network.conn = { open: true, send: (data) => sent.push(clone(data)) };

  game.network.handleRelayMessage({ type: 'peer_left' });
  assert.equal(game.network.isHost, true);
  assert.equal(game.network.isOnline, false);
  assert.equal(game.network._matchStarted, false);
  assert.equal(game.isOnline, false);
  assert.equal(game.state, 'paused');

  game.network.handleRelayMessage({ type: 'peer_joined', code: '1234' });
  assert.equal(game.network.isOnline, true);
  assert.equal(game.network._matchStarted, true);
  assert.equal(game.isOnline, true);
  assert.equal(game.isHost, true);
  assert.equal(game.state, 'running');
  assert.equal(sent.filter((data) => data.type === 'init_game').length, 1);
  game.network.stopHostSync();
});

test('权威快照精确新增、删除和覆盖比赛状态', () => {
  const { host, guest } = makeOnlinePair();
  const baseBall = host.balls[0];
  host.balls = [
    { ...baseBall, x: 11, y: 12, remainingPenetration: 2 },
    { ...host.balls[1], x: 21, y: 22 },
    { ...baseBall, x: 31, y: 32, isExtra: true, lifetime: 222 },
    { ...host.balls[1], x: 41, y: 42, isExtra: true, lifetime: 111 }
  ];
  host.powerups = [
    { type: 'freeze', x: 100, y: 120, radius: 11, timer: 432 },
    { type: 'bomb', x: 200, y: 220, radius: 11, timer: 321 }
  ];
  host.leftPaddle.vy = -3;
  host.rightPaddle.vy = 4;
  host.leftPaddle.frozenTimer = 41;
  host.rightPaddle.frozenTimer = 73;
  host.p1SkillCD = 1234;
  host.p2SkillCD = 2345;
  host.powerupSpawnTimer = 99;
  host.timerAcc = 456;
  host.state = 'paused';

  guest.network.handleIncomingData(clone(host.network.createStateSync()));
  assert.equal(guest.balls.length, 4);
  assert.equal(guest.balls[2].lifetime, 222);
  assert.equal(guest.balls[0].remainingPenetration, 2);
  assert.equal(guest.powerups.length, 2);
  assert.equal(guest.leftPaddle.vy, -3);
  assert.equal(guest.rightPaddle.vy, 4);
  assert.equal(guest.leftPaddle.frozenTimer, 41);
  assert.equal(guest.rightPaddle.frozenTimer, 73);
  assert.equal(guest.p1SkillCD, 1234);
  assert.equal(guest.p2SkillCD, 2345);
  assert.equal(guest.powerupSpawnTimer, 99);
  assert.equal(guest.timerAcc, 456);
  assert.equal(guest.state, 'paused');

  host.balls = [{ ...baseBall, x: 50, y: 60 }];
  host.powerups = [];
  host.leftPaddle.frozenTimer = 0;
  host.rightPaddle.frozenTimer = 0;
  host.p1SkillCD = 0;
  host.p2SkillCD = 0;
  host.state = 'gameover';
  guest.network.handleIncomingData(clone(host.network.createStateSync()));
  assert.equal(guest.balls.length, 1);
  assert.equal(guest.powerups.length, 0);
  assert.equal(guest.leftPaddle.frozenTimer, 0);
  assert.equal(guest.rightPaddle.frozenTimer, 0);
  assert.equal(guest.p1SkillCD, 0);
  assert.equal(guest.p2SkillCD, 0);
  assert.equal(guest.state, 'gameover');
});

test('访客在权威快照之间发送输入但不推进物理', () => {
  const { game } = createGame();
  const sent = [];
  game.start();
  game.mode = 'lan';
  game.isOnline = true;
  game.isHost = false;
  game.playerSide = 'night';
  game.network.transport = 'peer';
  game.network.conn = { open: true, send: (data) => sent.push(clone(data)) };
  game.balls[0].x = 300;
  game.balls[0].y = 300;
  game.balls[0].dx = 4;
  game.balls[0].dy = 2;
  game.keys.KeyW = true;

  game.update(1000 / 60);
  assert.equal(game.balls[0].x, 300);
  assert.equal(game.balls[0].y, 300);
  assert.ok(sent.some((data) => data.type === 'paddle_input'));
});

test('高刷新访客输入按固定步进处理并限制到三十赫兹', () => {
  const { game } = createGame();
  const sent = [];
  let now = 0;
  game.start();
  game.mode = 'lan';
  game.isOnline = true;
  game.isHost = false;
  game.playerSide = 'night';
  game.rightPaddle.speed = 0.4;
  game.keys.ArrowDown = true;
  game.network.transport = 'peer';
  game.network.conn = { open: true, send: (data) => sent.push(clone(data)) };
  game.network._now = () => now;

  for (let frame = 0; frame < 600; frame++) {
    now += 1000 / 120;
    game.update(1000 / 120);
  }

  const inputs = sent.filter((data) => data.type === 'paddle_input');
  assert.ok(inputs.length >= 100, `输入过少：${inputs.length}`);
  assert.ok(inputs.length <= 151, `输入过多：${inputs.length}`);
  assert.ok(game.rightPaddle.y < 450, `高刷导致挡板移动过快：${game.rightPaddle.y}`);
});

test('房主固定步进不发送访客方向的挡板输入', () => {
  const { game } = createGame();
  const sent = [];
  game.start();
  game.mode = 'lan';
  game.isOnline = true;
  game.isHost = true;
  game.playerSide = 'day';
  game.network.transport = 'peer';
  game.network.conn = { open: true, send: (data) => sent.push(clone(data)) };

  for (let frame = 0; frame < 60; frame++) game.update(1000 / 60);

  assert.equal(sent.filter((data) => data.type === 'paddle_input').length, 0);
});

test('访客技能只发送请求且房主拒绝越权阵营', () => {
  const guest = createGame().game;
  const sent = [];
  guest.start();
  guest.mode = 'lan';
  guest.isOnline = true;
  guest.isHost = false;
  guest.network.transport = 'peer';
  guest.network.conn = { open: true, send: (data) => sent.push(clone(data)) };
  const before = JSON.stringify(guest.squares);
  guest.activateEclipse();
  assert.equal(JSON.stringify(guest.squares), before);
  assert.deepEqual(sent, [{ type: 'action_skill', side: 'night' }]);

  const { host } = makeOnlinePair();
  const dayCooldown = host.p1SkillCD;
  host.network.handleIncomingData({ type: 'action_skill', side: 'day' });
  assert.equal(host.p1SkillCD, dayCooldown);
});

test('房主拒绝访客伪造的初始化消息并保持权威角色', () => {
  const { host } = makeOnlinePair();
  const before = {
    gameIsHost: host.isHost,
    managerIsHost: host.network.isHost,
    playerSide: host.playerSide,
    theme: host.currentThemeKey,
    timeLimit: host.timeLimit,
    squareSize: host.squareSize
  };

  host.network.handleIncomingData({
    type: 'init_game',
    yourSide: 'night',
    hostSide: 'day',
    theme: 'void',
    timeLimit: 120,
    squareSize: 30
  });

  assert.deepEqual({
    gameIsHost: host.isHost,
    managerIsHost: host.network.isHost,
    playerSide: host.playerSide,
    theme: host.currentThemeKey,
    timeLimit: host.timeLimit,
    squareSize: host.squareSize
  }, before);
});

test('房主把访客挡板速度限制在本地合法范围', () => {
  const { host } = makeOnlinePair();
  const remotePaddle = host.rightPaddle;

  host.network.handleIncomingData({
    type: 'paddle_input',
    y: 320,
    vy: 999999
  });
  assert.equal(remotePaddle.vy, remotePaddle.speed);

  host.network.handleIncomingData({
    type: 'paddle_input',
    y: 280,
    vy: -999999
  });
  assert.equal(remotePaddle.vy, -remotePaddle.speed);

  remotePaddle.frozenTimer = 10;
  host.network.handleIncomingData({
    type: 'paddle_input',
    y: 300,
    vy: 999999
  });
  assert.equal(remotePaddle.vy, remotePaddle.speed * 0.45);

  host.network.handleIncomingData({
    type: 'paddle_input',
    y: 300,
    vy: 0
  });
  assert.equal(remotePaddle.vy, 0);
});

test('固定步长使相同一秒在不同渲染帧率下得到一致物理状态', () => {
  const first = createGame().game;
  const second = createGame().game;
  for (const game of [first, second]) {
    game.start();
    game.mode = 'sim';
    game.physics.applyRandomness = () => {};
  }

  for (let index = 0; index < 10; index++) first.update(100);
  for (let index = 0; index < 60; index++) second.update(1000 / 60);

  assert.ok(Math.abs(first.balls[0].x - second.balls[0].x) < 0.000001);
  assert.ok(Math.abs(first.balls[0].y - second.balls[0].y) < 0.000001);
  assert.ok(Math.abs(first.elapsedSeconds - second.elapsedSeconds) < 0.000001);
});

test('初始球速向量与界面标称的 0.5 倍一致', () => {
  const { game } = createGame();
  game.start();
  assert.ok(Math.abs(Math.hypot(game.balls[0].dx, game.balls[0].dy) - 3.2) < 0.000001);
});
