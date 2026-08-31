/**
 * LAN WebSocket relay (preferred on same Wi-Fi) + PeerJS internet fallback.
 */

const PADDLE_INPUT_INTERVAL_MS = 1000 / 30;
const PADDLE_INPUT_KEEPALIVE_MS = 250;

class NetworkManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conn = null;
    this.ws = null;
    this.transport = null;
    this.preferredWsUrl = null;
    this.isHost = false;
    this.isOnline = false;
    this.mySide = 'day';
    this.roomCode = null;
    this.onStatusChange = null;
    this.onSideAssigned = null;
    this.syncInterval = null;
    this._wsWaiters = [];
    this._matchStarted = false;
    this._lastPaddleInputAt = -Infinity;
    this._lastPaddleInput = null;
    this._now = () => Date.now();
  }

  generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  setRelayHost(host, port) {
    const raw = String(host || '').trim().replace(/^https?:\/\//i, '');
    const hostOnly = raw.split('/')[0].split(':')[0];
    if (!hostOnly) return false;
    const p = Number(port) || 8080;
    this.preferredWsUrl = `ws://${hostOnly}:${p}/ws`;
    return true;
  }

  shouldUseSecureSameOriginRelay() {
    if (typeof location === 'undefined') return false;
    return location.protocol === 'https:' &&
      location.hostname !== 'appassets.androidplatform.net';
  }

  useSameOriginRelay() {
    this.preferredWsUrl = null;
    return this._wsUrl();
  }

  _status(kind, msg) {
    if (this.onStatusChange) this.onStatusChange(kind, msg);
  }

  _send(data) {
    if (this.transport === 'ws' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'relay', data }));
      return true;
    }
    if (this.conn && this.conn.open) {
      this.conn.send(data);
      return true;
    }
    return false;
  }

  _resetPaddleInputState() {
    this._lastPaddleInputAt = -Infinity;
    this._lastPaddleInput = null;
  }

  _wsUrl() {
    if (this.preferredWsUrl) return this.preferredWsUrl;
    if (typeof location === 'undefined') return null;
    if (location.protocol === 'file:') return null;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  async _ensureWs(timeoutMs = 1600) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return true;
    const url = this._wsUrl();
    if (!url) return false;

    return new Promise((resolve) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (_) {
        resolve(false);
        return;
      }
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          this.ws = ws;
          this.transport = 'ws';
          ws.onmessage = (ev) => this._onWsMessage(ev);
          ws.onclose = () => this._onTransportClose();
          ws.onerror = () => {};
        } else {
          try { ws.close(); } catch (_) {}
        }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      ws.onopen = () => finish(true);
      ws.onerror = () => finish(false);
    });
  }

  _onWsMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (_) {
      return;
    }
    this.handleRelayMessage(msg);
  }

  handleRelayMessage(msg) {
    if (!msg || typeof msg !== 'object' || !msg.type) return;

    if (msg.type === 'created') {
      this.roomCode = msg.code;
      this.isHost = true;
      this.isOnline = true;
      this._status('waiting', `房间已创建。房间码：${msg.code}，等待对手加入…`);
      this._flushWaiters(null, msg.code);
      return;
    }
    if (msg.type === 'joined') {
      this.roomCode = msg.code;
      this.isHost = false;
      this.isOnline = true;
      this._status('connected', '已连上房主，等待阵营分配…');
      this._flushWaiters(null);
      return;
    }
    if (msg.type === 'error') {
      this._status('error', msg.message || '联机错误');
      this._flushWaiters(new Error(msg.message || 'error'));
      return;
    }
    if (msg.type === 'peer_joined' && this.isHost) {
      this._beginMatch();
      return;
    }
    if (msg.type === 'peer_left') {
      this._handlePeerUnavailable('对手已断开连接。');
      return;
    }
    if (msg.type === 'relay' && msg.data) {
      this.handleIncomingData(msg.data);
    }
  }

  _flushWaiters(err, code) {
    const waiters = this._wsWaiters.splice(0);
    waiters.forEach((cb) => cb(err, code));
  }

  _onTransportClose() {
    if (!this.isOnline) return;
    this._handlePeerUnavailable('连接已断开。');
  }

  _handlePeerUnavailable(message) {
    this.isOnline = false;
    this._matchStarted = false;
    this.stopHostSync();
    this._status('disconnected', message);
    this.game.isOnline = false;
    this.game.setPaused(true);
  }

  _beginMatch() {
    if (this._matchStarted) return;
    this._matchStarted = true;
    this.isOnline = true;

    const hostIsDay = Math.random() < 0.5;
    this.mySide = hostIsDay ? 'day' : 'night';
    const clientSide = hostIsDay ? 'night' : 'day';

    this.game.playerSide = this.mySide;
    this.game.isOnline = true;
    this.game.isHost = true;
    this.game.mode = 'lan';
    this._resetPaddleInputState();

    this._send({
      type: 'init_game',
      yourSide: clientSide,
      hostSide: this.mySide,
      theme: this.game.currentThemeKey,
      timeLimit: this.game.timeLimit,
      squareSize: this.game.squareSize
    });

    if (this.onSideAssigned) this.onSideAssigned(this.mySide);
    this._status('connected', '对手已加入，对决开始！');
    this.game.start();
    this.startHostSync();
  }

  async createRoom(_customCode, callback) {
    const wsOk = await this._ensureWs();
    if (wsOk) {
      this._wsWaiters.push(callback || (() => {}));
      this.ws.send(JSON.stringify({ type: 'create' }));
      return;
    }
    if (this.shouldUseSecureSameOriginRelay()) {
      const error = new Error('secure-relay-unavailable');
      this._status('error', '安全联机服务暂不可用，请稍后重试或联系网站管理员。');
      if (callback) callback(error);
      return;
    }
    this._createPeerRoom(callback);
  }

  async joinRoom(code, callback) {
    const trimmed = String(code || '').trim();
    const wsOk = await this._ensureWs();
    if (wsOk) {
      this._wsWaiters.push(callback || (() => {}));
      this.ws.send(JSON.stringify({ type: 'join', code: trimmed }));
      return;
    }
    if (this.shouldUseSecureSameOriginRelay()) {
      const error = new Error('secure-relay-unavailable');
      this._status('error', '安全联机服务暂不可用，请稍后重试或联系网站管理员。');
      if (callback) callback(error);
      return;
    }
    this._joinPeerRoom(trimmed, callback);
  }

  _createPeerRoom(callback) {
    if (typeof Peer === 'undefined') {
      this._status('error', '局域网服务未连接，且无法使用互联网 P2P。请先在电脑运行 node server.js，并填写电脑 IP。');
      if (callback) callback(new Error('no-peer'));
      return;
    }

    const tryCode = (attempt) => {
      const code = this.generateRoomCode();
      if (this.peer) {
        try { this.peer.destroy(); } catch (_) {}
      }
      this.peer = new Peer(`pw1v1-${code}`, { debug: 0 });
      this.transport = 'peer';

      this.peer.on('open', () => {
        this.isHost = true;
        this.isOnline = true;
        this.roomCode = code;
        this._status('waiting', `房间已创建（互联网 P2P）。房间码：${code}，等待对手加入…`);
        if (callback) callback(null, code);
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this.setupConnection();
        this._matchStarted = false;
        if (conn.open) this._beginMatch();
        else conn.on('open', () => this._beginMatch());
      });

      this.peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id' && attempt < 5) {
          tryCode(attempt + 1);
          return;
        }
        this._status('error', `联机错误：${(err && (err.type || err.message)) || 'unknown'}`);
        if (callback) callback(err);
      });
    };

    tryCode(0);
  }

  _joinPeerRoom(code, callback) {
    if (typeof Peer === 'undefined') {
      this._status('error', '加入失败：请先用 node server.js 启动局域网服务，或检查网络。');
      if (callback) callback(new Error('no-peer'));
      return;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
    }
    this.peer = new Peer({ debug: 0 });
    this.transport = 'peer';

    this.peer.on('open', () => {
      this.isHost = false;
      this.isOnline = true;
      this.roomCode = code;
      this._status('connecting', `正在连接房间 ${code}…`);
      const conn = this.peer.connect(`pw1v1-${code}`, { reliable: true });
      this.conn = conn;
      this.setupConnection();
      conn.on('open', () => {
        this._status('connected', '已连上房主，等待阵营分配…');
        if (callback) callback(null);
      });
    });

    this.peer.on('error', (err) => {
      this._status('error', '加入房间失败，请检查房间码，或改用电脑 IP 局域网模式。');
      if (callback) callback(err);
    });
  }

  setupConnection() {
    if (!this.conn) return;
    this.conn.on('data', (data) => this.handleIncomingData(data));
    this.conn.on('close', () => this._onTransportClose());
  }

  handleIncomingData(data) {
    if (!data || !data.type) return;

    if (data.type === 'init_game') {
      if (this.isHost) return;
      if (data.yourSide !== 'day' && data.yourSide !== 'night') return;
      this.mySide = data.yourSide;
      this.isOnline = true;
      this._matchStarted = true;
      this.game.playerSide = this.mySide;
      this.game.isOnline = true;
      this.game.isHost = false;
      this.game.mode = 'lan';
      this._resetPaddleInputState();
      if (data.theme) this.game.setTheme(data.theme);
      if (data.timeLimit != null) this.game.setTimeLimit(data.timeLimit);
      if (data.squareSize != null) this.game.setGridSize(data.squareSize);
      if (this.onSideAssigned) this.onSideAssigned(this.mySide);
      this._status('connected', '对战开始！');
      this.game.start();
      return;
    }

    if (data.type === 'paddle_input') {
      if (!this.isHost || !Number.isFinite(data.y)) return;
      const remoteSide = this.mySide === 'day' ? 'night' : 'day';
      const paddle = remoteSide === 'day'
        ? this.game.leftPaddle
        : this.game.rightPaddle;
      paddle.y = Math.max(
        paddle.height / 2,
        Math.min(this.game.height - paddle.height / 2, data.y)
      );
      const allowedSpeed = paddle.frozenTimer > 0
        ? paddle.speed * 0.45
        : paddle.speed;
      paddle.vy = Number.isFinite(data.vy)
        ? Math.max(-allowedSpeed, Math.min(allowedSpeed, data.vy))
        : 0;
      return;
    }

    if (data.type === 'action_skill') {
      const remoteSide = this.mySide === 'day' ? 'night' : 'day';
      if (!this.isHost || data.side !== remoteSide) return;
      if (data.side === 'day') this.game.activateSolarFlare(true);
      else this.game.activateEclipse(true);
      this.sendHostStateNow();
      return;
    }

    if (data.type === 'action_laser') {
      const remoteSide = this.mySide === 'day' ? 'night' : 'day';
      if (!this.isHost || data.side !== remoteSide) return;
      this.game.activateLaser(data.side === 'day', true);
      this.sendHostStateNow();
      return;
    }

    if (data.type === 'pause_request') {
      if (!this.isHost || typeof data.paused !== 'boolean') return;
      this.game.setPaused(data.paused);
      this.sendHostStateNow();
      return;
    }

    if (data.type === 'game_state_sync' && !this.isHost) {
      this.applyStateSync(data);
    }
  }

  startHostSync() {
    this.stopHostSync();
    this.syncInterval = setInterval(() => {
      if (!this.game || !this.isHost || !this.isOnline || !this._matchStarted) return;
      this.sendHostStateNow();
    }, 33);
  }

  createStateSync() {
    const game = this.game;
    return {
      type: 'game_state_sync',
      state: game.state,
      balls: game.balls.map((ball) => ({
        x: ball.x,
        y: ball.y,
        dx: ball.dx,
        dy: ball.dy,
        team: ball.team,
        radius: ball.radius,
        penetrationCapacity: ball.penetrationCapacity,
        remainingPenetration: ball.remainingPenetration,
        isExtra: Boolean(ball.isExtra),
        lifetime: ball.lifetime == null ? null : ball.lifetime
      })),
      powerups: game.powerups.map((powerup) => ({
        type: powerup.type,
        x: powerup.x,
        y: powerup.y,
        radius: powerup.radius,
        timer: powerup.timer
      })),
      leftY: game.leftPaddle.y,
      rightY: game.rightPaddle.y,
      leftVy: game.leftPaddle.vy,
      rightVy: game.rightPaddle.vy,
      leftEnergy: game.leftPaddle.energy,
      rightEnergy: game.rightPaddle.energy,
      leftFrozenTimer: game.leftPaddle.frozenTimer,
      rightFrozenTimer: game.rightPaddle.frozenTimer,
      p1SkillCD: game.p1SkillCD,
      p2SkillCD: game.p2SkillCD,
      powerupSpawnTimer: game.powerupSpawnTimer,
      timeLeft: game.timeLeft,
      elapsedSeconds: game.elapsedSeconds,
      timerAcc: game.timerAcc,
      dayCombo: game.dayCombo,
      nightCombo: game.nightCombo,
      squares: game.squares,
      stoneGrid: game.stoneGrid
    };
  }

  sendHostStateNow() {
    if (!this.isHost || !this.isOnline || !this.game) return false;
    this._send(this.createStateSync());
    return true;
  }

  stopHostSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  applyStateSync(data) {
    if (!data || typeof data !== 'object') return;
    const game = this.game;
    const finite = (value, minimum, maximum) => Number.isFinite(value) &&
      value >= minimum && value <= maximum;

    if (Array.isArray(data.balls) && data.balls.length <= 16) {
      const balls = data.balls.map((source) => {
        if (!source || (source.team !== 'day' && source.team !== 'night')) return null;
        if (![source.x, source.y, source.dx, source.dy].every(Number.isFinite)) return null;
        const penetration = finite(source.penetrationCapacity, 1, 3)
          ? source.penetrationCapacity
          : 1;
        const remaining = finite(source.remainingPenetration, 0, 3)
          ? source.remainingPenetration
          : penetration;
        const isDay = source.team === 'day';
        return {
          x: source.x,
          y: source.y,
          dx: source.dx,
          dy: source.dy,
          team: source.team,
          reverseColor: isDay ? game.theme.dayColor : game.theme.nightColor,
          ballColor: isDay ? '#141414' : '#FFFFFF',
          radius: finite(source.radius, 1, game.squareSize)
            ? source.radius
            : game.squareSize / 2,
          penetrationCapacity: penetration,
          remainingPenetration: remaining,
          isExtra: Boolean(source.isExtra),
          lifetime: finite(source.lifetime, 0, 100000) ? source.lifetime : undefined
        };
      });
      if (balls.every(Boolean)) game.balls = balls;
    }

    const powerupTypes = new Set(['bomb', 'multiball', 'freeze', 'speed', 'petrify']);
    if (Array.isArray(data.powerups) && data.powerups.length <= 8) {
      const powerups = data.powerups.map((source) => {
        if (!source || !powerupTypes.has(source.type)) return null;
        if (![source.x, source.y, source.radius, source.timer].every(Number.isFinite)) return null;
        return {
          type: source.type,
          x: source.x,
          y: source.y,
          radius: source.radius,
          timer: source.timer
        };
      });
      if (powerups.every(Boolean)) game.powerups = powerups;
    }

    const applyNumber = (target, key, value, minimum, maximum) => {
      if (finite(value, minimum, maximum)) target[key] = value;
    };
    applyNumber(game.leftPaddle, 'y', data.leftY, 0, game.height);
    applyNumber(game.rightPaddle, 'y', data.rightY, 0, game.height);
    applyNumber(game.leftPaddle, 'vy', data.leftVy, -100, 100);
    applyNumber(game.rightPaddle, 'vy', data.rightVy, -100, 100);
    applyNumber(game.leftPaddle, 'energy', data.leftEnergy, 0, 100);
    applyNumber(game.rightPaddle, 'energy', data.rightEnergy, 0, 100);
    applyNumber(game.leftPaddle, 'frozenTimer', data.leftFrozenTimer, 0, 100000);
    applyNumber(game.rightPaddle, 'frozenTimer', data.rightFrozenTimer, 0, 100000);
    applyNumber(game, 'p1SkillCD', data.p1SkillCD, 0, 60000);
    applyNumber(game, 'p2SkillCD', data.p2SkillCD, 0, 60000);
    applyNumber(game, 'powerupSpawnTimer', data.powerupSpawnTimer, 0, 100000);
    applyNumber(game, 'timeLeft', data.timeLeft, 0, Math.max(0, game.timeLimit));
    applyNumber(game, 'elapsedSeconds', data.elapsedSeconds, 0, 86400);
    applyNumber(game, 'timerAcc', data.timerAcc, 0, 1000);
    applyNumber(game, 'dayCombo', data.dayCombo, 0, 1000000);
    applyNumber(game, 'nightCombo', data.nightCombo, 0, 1000000);

    const validGrid = (grid, cellValidator) => Array.isArray(grid) &&
      grid.length === game.gridX &&
      grid.every((column) => Array.isArray(column) &&
        column.length === game.gridY && column.every(cellValidator));
    if (validGrid(
      data.squares,
      (cell) => cell === game.theme.dayColor || cell === game.theme.nightColor
    )) {
      game.squares = data.squares.map((column) => column.slice());
    }
    if (validGrid(data.stoneGrid, (cell) => cell === null || (
      cell && typeof cell === 'object' &&
      finite(cell.hp, 0, 10) && finite(cell.maxHp, 1, 10) &&
      (cell.owner === 'day' || cell.owner === 'night')
    ))) {
      game.stoneGrid = data.stoneGrid.map((column) => column.map((cell) =>
        cell === null ? null : { hp: cell.hp, maxHp: cell.maxHp, owner: cell.owner }
      ));
    }
    if (data.state === 'running' || data.state === 'paused' || data.state === 'gameover') {
      game.state = data.state;
    }
    this.game.calculateTerritory();
  }

  requestPause(paused) {
    if (typeof paused !== 'boolean') return false;
    if (!this.isOnline) return this.game.setPaused(paused);
    if (this.isHost) {
      this.game.setPaused(paused);
      this.sendHostStateNow();
    } else {
      this._send({ type: 'pause_request', paused });
    }
    return true;
  }

  sendPaddleInput(y, vy) {
    if (!Number.isFinite(y) || !Number.isFinite(vy)) return false;
    const measuredNow = Number(this._now());
    const now = Number.isFinite(measuredNow) ? measuredNow : Date.now();
    const previous = this._lastPaddleInput;
    const elapsed = now - this._lastPaddleInputAt;
    const stopped = previous && previous.vy !== 0 && vy === 0;
    const changed = !previous || previous.y !== y || previous.vy !== vy;

    if (!stopped && elapsed + 0.000001 < PADDLE_INPUT_INTERVAL_MS) return false;
    if (!changed && elapsed + 0.000001 < PADDLE_INPUT_KEEPALIVE_MS) return false;
    if (!this._send({ type: 'paddle_input', y, vy })) return false;

    this._lastPaddleInputAt = now;
    this._lastPaddleInput = { y, vy };
    return true;
  }

  sendSkillAction(side) {
    this._send({ type: 'action_skill', side });
  }

  sendLaserAction(side) {
    this._send({ type: 'action_laser', side });
  }

  disconnect() {
    this.stopHostSync();
    this._matchStarted = false;
    this.isOnline = false;
    this.isHost = false;
    this.game.isOnline = false;
    this._resetPaddleInputState();
    this._wsWaiters.splice(0);
    if (this.conn) {
      try { this.conn.close(); } catch (_) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.transport = null;
  }
}

window.NetworkManager = NetworkManager;
