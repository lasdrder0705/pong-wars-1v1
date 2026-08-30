/**
 * WebRTC P2P and Local Network Manager for Pong Wars 1v1
 */

class NetworkManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.isOnline = false;
    this.mySide = 'day'; // 'day' (left) or 'night' (right)
    this.roomCode = null;
    this.onStatusChange = null;
    this.onSideAssigned = null;
    this.syncInterval = null;
  }

  // Generate a friendly 4-digit room code
  generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Create room as Host
  createRoom(customCode, callback) {
    const code = customCode || this.generateRoomCode();
    const peerId = `pw1v1-${code}`;

    if (this.peer) this.peer.destroy();

    // Connect to PeerJS cloud broker (free public signaling for WebRTC)
    this.peer = new Peer(peerId, {
      debug: 1
    });

    this.peer.on('open', (id) => {
      this.isHost = true;
      this.isOnline = true;
      this.roomCode = code;
      if (this.onStatusChange) this.onStatusChange('waiting', `房间已创建！房间码：${code}，等待对手加入...`);
      if (callback) callback(null, code);
    });

    this.peer.on('connection', (conn) => {
      this.conn = conn;
      this.setupConnection();

      // Host randomly assigns sides! (50% chance Host is Day, 50% chance Host is Night)
      const hostIsDay = Math.random() < 0.5;
      this.mySide = hostIsDay ? 'day' : 'night';
      const clientSide = hostIsDay ? 'night' : 'day';

      this.game.playerSide = this.mySide;
      this.game.isOnline = true;
      this.game.isHost = true;

      // Send initial handoff to client
      setTimeout(() => {
        if (this.conn && this.conn.open) {
          this.conn.send({
            type: 'init_game',
            yourSide: clientSide,
            hostSide: this.mySide,
            theme: this.game.currentThemeKey,
            timeLimit: this.game.timeLimit,
            squareSize: this.game.squareSize
          });

          if (this.onSideAssigned) this.onSideAssigned(this.mySide);
          if (this.onStatusChange) this.onStatusChange('connected', `对手已加入！对决开始！`);
          
          this.game.start();
          this.startHostSync();
        }
      }, 500);
    });

    this.peer.on('error', (err) => {
      console.warn('Peer error:', err);
      if (this.onStatusChange) this.onStatusChange('error', `联机错误：${err.type || err.message}`);
      if (callback) callback(err);
    });
  }

  // Join room as Client
  joinRoom(code, callback) {
    const targetPeerId = `pw1v1-${code.trim()}`;

    if (this.peer) this.peer.destroy();

    this.peer = new Peer({
      debug: 1
    });

    this.peer.on('open', () => {
      this.isHost = false;
      this.isOnline = true;
      this.roomCode = code;
      if (this.onStatusChange) this.onStatusChange('connecting', `正在连接房间 ${code}...`);

      const conn = this.peer.connect(targetPeerId, {
        reliable: true
      });

      this.conn = conn;
      this.setupConnection();

      conn.on('open', () => {
        if (this.onStatusChange) this.onStatusChange('connected', `已成功连接到房主！等待阵营分配...`);
        if (callback) callback(null);
      });
    });

    this.peer.on('error', (err) => {
      console.warn('Join error:', err);
      if (this.onStatusChange) this.onStatusChange('error', `加入房间失败，请检查房间码是否正确。`);
      if (callback) callback(err);
    });
  }

  setupConnection() {
    this.conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.conn.on('close', () => {
      this.isOnline = false;
      this.stopHostSync();
      if (this.onStatusChange) this.onStatusChange('disconnected', `对手已断开连接。`);
      this.game.pause();
    });
  }

  // Handle incoming network packet
  handleIncomingData(data) {
    if (!data || !data.type) return;

    if (data.type === 'init_game') {
      // Client receives side assignment
      this.mySide = data.yourSide;
      this.game.playerSide = this.mySide;
      this.game.isOnline = true;
      this.game.isHost = false;

      if (data.theme) this.game.setTheme(data.theme);
      if (this.onSideAssigned) this.onSideAssigned(this.mySide);
      if (this.onStatusChange) this.onStatusChange('connected', `对战开始！`);

      this.game.start();
    } else if (data.type === 'paddle_input') {
      // Receive remote paddle Y position
      if (this.mySide === 'day') {
        this.game.rightPaddle.y = data.y;
        this.game.rightPaddle.vy = data.vy || 0;
      } else {
        this.game.leftPaddle.y = data.y;
        this.game.leftPaddle.vy = data.vy || 0;
      }
    } else if (data.type === 'action_skill') {
      // Remote player triggered normal skill
      if (data.side === 'day') {
        this.game.activateSolarFlare();
      } else {
        this.game.activateEclipse();
      }
    } else if (data.type === 'action_laser') {
      // Remote player triggered laser ultimate
      this.game.activateLaser(data.side === 'day');
    } else if (data.type === 'game_state_sync' && !this.isHost) {
      // Client receives authoritative state sync from Host
      this.applyStateSync(data);
    }
  }

  // Host: Broadcast physics state at 30 FPS
  startHostSync() {
    this.stopHostSync();
    this.syncInterval = setInterval(() => {
      if (this.conn && this.conn.open && this.game.state === 'running') {
        const syncData = {
          type: 'game_state_sync',
          balls: this.game.balls.map(b => ({
            x: b.x,
            y: b.y,
            dx: b.dx,
            dy: b.dy,
            team: b.team,
            penetrationCapacity: b.penetrationCapacity
          })),
          leftY: this.game.leftPaddle.y,
          rightY: this.game.rightPaddle.y,
          leftEnergy: this.game.leftPaddle.energy,
          rightEnergy: this.game.rightPaddle.energy,
          timeLeft: this.game.timeLeft,
          elapsedSeconds: this.game.elapsedSeconds,
          squares: this.game.squares,
          stoneGrid: this.game.stoneGrid
        };
        this.conn.send(syncData);
      }
    }, 33); // ~30 FPS network sync
  }

  stopHostSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Client: Apply host state sync
  applyStateSync(data) {
    if (!data) return;

    if (data.balls && data.balls.length > 0) {
      for (let i = 0; i < data.balls.length; i++) {
        if (this.game.balls[i]) {
          // Smooth lerp / apply
          this.game.balls[i].x = data.balls[i].x;
          this.game.balls[i].y = data.balls[i].y;
          this.game.balls[i].dx = data.balls[i].dx;
          this.game.balls[i].dy = data.balls[i].dy;
          this.game.balls[i].penetrationCapacity = data.balls[i].penetrationCapacity;
        }
      }
    }

    if (this.mySide === 'night') {
      this.game.leftPaddle.y = data.leftY;
    } else {
      this.game.rightPaddle.y = data.rightY;
    }

    this.game.leftPaddle.energy = data.leftEnergy;
    this.game.rightPaddle.energy = data.rightEnergy;
    this.game.timeLeft = data.timeLeft;
    this.game.elapsedSeconds = data.elapsedSeconds;

    if (data.squares) this.game.squares = data.squares;
    if (data.stoneGrid) this.game.stoneGrid = data.stoneGrid;
    this.game.calculateTerritory();
  }

  // Send local paddle movement to opponent
  sendPaddleInput(y, vy) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'paddle_input',
        y: y,
        vy: vy
      });
    }
  }

  // Send skill activation to opponent
  sendSkillAction(side) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'action_skill',
        side: side
      });
    }
  }

  // Send laser activation to opponent
  sendLaserAction(side) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'action_laser',
        side: side
      });
    }
  }

  disconnect() {
    this.stopHostSync();
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.isOnline = false;
    this.isHost = false;
    this.game.isOnline = false;
  }
}

window.NetworkManager = NetworkManager;
