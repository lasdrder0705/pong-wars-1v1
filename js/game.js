/**
 * 昼夜领地对战 V1.0 Main Game State and Controller
 */

const THEMES = {
  classic: {
    name: '宣纸水墨 (Rice Paper)',
    dayColor: '#FAF7F0',
    dayBall: '#141414', // 墨珠
    dayAccent: '#1C1812',
    nightColor: '#16130F',
    nightBall: '#FFFFFF', // 白丸
    nightAccent: '#8A8175',
    bg: 'linear-gradient(160deg, #F9F5EA 0%, #EDE6D4 100%)'
  },
  cyberpunk: {
    name: '浓墨重峦 (Heavy Ink)',
    dayColor: '#F5F1E6',
    dayBall: '#0D0D0D',
    dayAccent: '#100E0A',
    nightColor: '#0D0B08',
    nightBall: '#FFFFFF',
    nightAccent: '#6E675C',
    bg: 'linear-gradient(160deg, #F3EEE0 0%, #E3DAC3 100%)'
  },
  elemental: {
    name: '淡墨远山 (Light Ink)',
    dayColor: '#F6F4EE',
    dayBall: '#1A1A1A',
    dayAccent: '#454138',
    nightColor: '#454138',
    nightBall: '#FFFFFF',
    nightAccent: '#A39C8D',
    bg: 'linear-gradient(160deg, #FAF8F2 0%, #ECEAE2 100%)'
  },
  void: {
    name: '夜池墨影 (Night Pond)',
    dayColor: '#E8E4D8',
    dayBall: '#0F0F0F',
    dayAccent: '#1E1B15',
    nightColor: '#100E0A',
    nightBall: '#FFFFFF',
    nightAccent: '#5C564C',
    bg: 'linear-gradient(160deg, #24201A 0%, #12100C 100%)'
  },
  monochrome: {
    name: '极简黑白 (Monochrome)',
    dayColor: '#FBFBFD',
    dayBall: '#0E0E10',
    dayAccent: '#2E2E30',
    nightColor: '#141416',
    nightBall: '#FFFFFF',
    nightAccent: '#86868B',
    bg: 'linear-gradient(160deg, #FCFCFC 0%, #EAEAEC 100%)'
  }
};

const BASE_BALL_SPEED = 6.4;
const DEATHMATCH_WIN_RATIO = 0.9;
const ALLOWED_GRID_SIZES = new Set([20, 25, 30]);
const ALLOWED_TIME_LIMITS = new Set([0, 60, 90, 120]);
const FIXED_STEP_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 250;

// ===== 水墨球头 Sprite 缓存（纯视觉：墨团/光晕预渲染，逐帧复用） =====
function _gmHexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.replace('#', '');
  if (m.length !== 6) return null;
  const v = parseInt(m, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function _gmSeededRand(seed) {
  let h = seed >>> 0;
  return function () {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

const _gmBallSpriteCache = {};
const _GM_BALL_SPRITE_SIZE = 192;
const _GM_BALL_CORE_R = 56; // 球半径在 sprite 中占据的像素半径

// isInk=true：浓墨墨团（边缘不规则晕染+颗粒）；isInk=false：发光白丸（亮核+柔光晕）
// 返回 { canvas, scale }，绘制边长 = ball.radius * 2 * scale
function _gmGetBallSprite(color, isInk) {
  const key = (isInk ? 'ink|' : 'glow|') + color;
  let entry = _gmBallSpriteCache[key];
  if (entry) return entry;

  const S = _GM_BALL_SPRITE_SIZE;
  const C = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const c = canvas.getContext('2d');
  const rgb = _gmHexToRgb(color) || (isInk ? { r: 20, g: 20, b: 20 } : { r: 255, g: 255, b: 255 });
  const rgba = (a) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  let seed = 13;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const rand = _gmSeededRand(seed);

  if (isInk) {
    // 外围偏移墨晕（2 层），让边缘不再是矢量正圆
    for (let k = 0; k < 2; k++) {
      const ox = C + (rand() - 0.5) * _GM_BALL_CORE_R * 0.5;
      const oy = C + (rand() - 0.5) * _GM_BALL_CORE_R * 0.5;
      const or = _GM_BALL_CORE_R * (0.75 + rand() * 0.2);
      const g = c.createRadialGradient(ox, oy, 0, ox, oy, or);
      g.addColorStop(0, rgba(0.8));
      g.addColorStop(0.6, rgba(0.5));
      g.addColorStop(1, rgba(0));
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }
    // 主墨团：中心浓重饱满，向外晕开
    const g = c.createRadialGradient(C, C, 0, C, C, _GM_BALL_CORE_R);
    g.addColorStop(0, rgba(1));
    g.addColorStop(0.62, rgba(0.97));
    g.addColorStop(0.85, rgba(0.5));
    g.addColorStop(1, rgba(0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // 边缘颗粒飞白
    for (let k = 0; k < 10; k++) {
      const ang = rand() * Math.PI * 2;
      const d = _GM_BALL_CORE_R * (0.82 + rand() * 0.35);
      c.globalAlpha = 0.15 + rand() * 0.3;
      c.fillStyle = color;
      c.beginPath();
      c.arc(C + Math.cos(ang) * d, C + Math.sin(ang) * d, 1 + rand() * 2.2, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
  } else {
    // 外圈柔和辉光
    let g = c.createRadialGradient(C, C, 0, C, C, C - 2);
    g.addColorStop(0, rgba(0.45));
    g.addColorStop(0.45, rgba(0.22));
    g.addColorStop(0.75, rgba(0.07));
    g.addColorStop(1, rgba(0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // 亮核：纯白中心，边缘轻微柔化
    g = c.createRadialGradient(C, C, 0, C, C, _GM_BALL_CORE_R);
    g.addColorStop(0, rgba(1));
    g.addColorStop(0.72, rgba(1));
    g.addColorStop(0.92, rgba(0.85));
    g.addColorStop(1, rgba(0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  }

  entry = { canvas: canvas, scale: C / _GM_BALL_CORE_R };
  _gmBallSpriteCache[key] = entry;
  return entry;
}

class PongWarsGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.width = canvas.width;
    this.height = canvas.height;

    this.squareSize = ALLOWED_GRID_SIZES.has(options.squareSize)
      ? options.squareSize
      : 25;
    this.gridX = Math.floor(this.width / this.squareSize);
    this.gridY = Math.floor(this.height / this.squareSize);

    this.sound = new SoundEngine();
    this.particles = new ParticleSystem();
    this.physics = new PhysicsEngine(this.gridX, this.gridY, this.squareSize);
    this.ai = new AIController('medium');
    this.network = new NetworkManager(this);

    this.currentThemeKey = options.theme || 'classic';
    this.theme = THEMES[this.currentThemeKey];
    this.mode = options.mode || 'pve'; // 'pve', 'pvp', 'sim', 'lan'
    this.state = 'idle';
    
    // Online LAN Properties
    this.isOnline = false;
    this.isHost = false;
    this.playerSide = 'day'; // 'day' (left) or 'night' (right)
    
    this.timeLimit = ALLOWED_TIME_LIMITS.has(options.timeLimit)
      ? options.timeLimit
      : 90;
    this.timeLeft = this.timeLimit;
    this.elapsedSeconds = 0;
    this.timerAcc = 0;

    // Normal Skill 5-second Cooldowns
    this.p1SkillCD = 0;
    this.p2SkillCD = 0;

    // Territory Scores
    this.dayScore = 0;
    this.nightScore = 0;
    this.totalSquares = this.gridX * this.gridY;
    this.dayCombo = 0;
    this.nightCombo = 0;

    this.squares = [];
    this.stoneGrid = [];
    this.leftPaddle = this.createPaddle(30, true);
    this.rightPaddle = this.createPaddle(this.width - 30, false);
    this.balls = [];
    this.powerups = [];
    this.powerupSpawnTimer = 0;
    this.keys = {};
    this.simSpeed = 1.0;
    this.simulationAccumulator = 0;

    // 纯视觉缓存：领地水墨纹理离屏层（增量重绘，不影响格子数据结构）
    this._terrLayer = null;
    this._terrColors = null;
  }

  createPaddle(x, isLeft) {
    return {
      x: x,
      y: this.height / 2,
      width: 14,
      height: 90,
      speed: 7.5,
      vy: 0,
      energy: 0,
      frozenTimer: 0,
      isLeft: isLeft
    };
  }

  setGridSize(size) {
    if (typeof size !== 'number' || !ALLOWED_GRID_SIZES.has(size)) return false;
    this.squareSize = size;
    this.gridX = Math.floor(this.width / size);
    this.gridY = Math.floor(this.height / size);
    this.physics = new PhysicsEngine(this.gridX, this.gridY, size);
    this.totalSquares = this.gridX * this.gridY;
    return true;
  }

  setTimeLimit(seconds) {
    if (typeof seconds !== 'number' || !ALLOWED_TIME_LIMITS.has(seconds)) return false;
    this.timeLimit = seconds;
    this.timeLeft = seconds;
    this.timerAcc = 0;
    return true;
  }

  setTheme(themeKey) {
    if (THEMES[themeKey]) {
      this.currentThemeKey = themeKey;
      const oldTheme = this.theme;
      this.theme = THEMES[themeKey];

      for (let i = 0; i < this.gridX; i++) {
        for (let j = 0; j < this.gridY; j++) {
          if (this.squares[i] && this.squares[i][j] === oldTheme.dayColor) {
            this.squares[i][j] = this.theme.dayColor;
          } else if (this.squares[i] && this.squares[i][j] === oldTheme.nightColor) {
            this.squares[i][j] = this.theme.nightColor;
          }
        }
      }

      this.balls.forEach(b => {
        if (b.team === 'day') {
          b.reverseColor = this.theme.dayColor;
          b.ballColor = '#141414';
        } else {
          b.reverseColor = this.theme.nightColor;
          b.ballColor = '#FFFFFF';
        }
      });
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'lan') {
      this.isOnline = false;
      this.network.disconnect();
    }
    this.reset();
  }

  setAIDifficulty(diff) {
    this.ai.setDifficulty(diff);
  }

  reset() {
    this.squares = this.physics.createGrid(this.theme.dayColor, this.theme.nightColor);
    this.stoneGrid = this.physics.createStoneGrid();
    this.particles.clear();
    this.powerups = [];
    this.powerupSpawnTimer = 0;
    this.timeLeft = this.timeLimit;
    this.elapsedSeconds = 0;
    this.timerAcc = 0;
    this.simulationAccumulator = 0;
    this.p1SkillCD = 0;
    this.p2SkillCD = 0;
    this.dayCombo = 0;
    this.nightCombo = 0;

    this.leftPaddle = this.createPaddle(30, true);
    this.rightPaddle = this.createPaddle(this.width - 30, false);

    const initialSpeed = (BASE_BALL_SPEED * 0.5) / Math.sqrt(2);

    this.balls = [
      {
        x: this.width / 4,
        y: this.height / 2,
        dx: initialSpeed,
        dy: -initialSpeed,
        team: 'day',
        reverseColor: this.theme.dayColor,
        ballColor: '#141414',
        radius: this.squareSize / 2,
        penetrationCapacity: 1,
        remainingPenetration: 1
      },
      {
        x: (this.width / 4) * 3,
        y: this.height / 2,
        dx: -initialSpeed,
        dy: initialSpeed,
        team: 'night',
        reverseColor: this.theme.nightColor,
        ballColor: '#FFFFFF',
        radius: this.squareSize / 2,
        penetrationCapacity: 1,
        remainingPenetration: 1
      }
    ];

    this.calculateTerritory();
    this.state = 'idle';
  }

  start() {
    this.sound.init();
    this.reset();
    this.state = 'running';
  }

  pause() {
    this.setPaused(this.state !== 'paused');
  }

  setPaused(paused) {
    if (typeof paused !== 'boolean') return false;
    if (paused && this.state === 'running') this.state = 'paused';
    else if (!paused && this.state === 'paused') this.state = 'running';
    return true;
  }

  calculateTerritory() {
    let day = 0;
    let night = 0;
    for (let i = 0; i < this.gridX; i++) {
      for (let j = 0; j < this.gridY; j++) {
        if (this.squares[i][j] === this.theme.dayColor) day++;
        else if (this.squares[i][j] === this.theme.nightColor) night++;
      }
    }
    this.dayScore = day;
    this.nightScore = night;
  }

  // Normal Skill: Solar Flare
  activateSolarFlare(isRemote = false) {
    if (this.state !== 'running' && !isRemote) return;
    if (this.isOnline && !this.isHost && !isRemote) {
      if (this.p1SkillCD > 0) return;
      this.p1SkillCD = 250;
      this.network.sendSkillAction('day');
      return;
    }
    if (this.p1SkillCD > 0) return;
    this.p1SkillCD = 5000;

    const enemyTiles = [];
    for (let i = 0; i < this.gridX; i++) {
      for (let j = 0; j < this.gridY; j++) {
        if (this.squares[i][j] === this.theme.nightColor) {
          enemyTiles.push({ i, j });
        }
      }
    }

    if (enemyTiles.length === 0) return;
    const target = enemyTiles[Math.floor(Math.random() * enemyTiles.length)];

    this.sound.playSkill('solar');
    this.particles.shake(4, 1.5);

    const radius = 1.5;
    for (let i = target.i - 2; i <= target.i + 2; i++) {
      for (let j = target.j - 2; j <= target.j + 2; j++) {
        if (i >= 0 && i < this.gridX && j >= 0 && j < this.gridY) {
          const dist = Math.hypot(i - target.i, j - target.j);
          if (dist <= radius) {
            this.squares[i][j] = this.theme.dayColor;
            if (this.stoneGrid[i][j]) this.stoneGrid[i][j] = null;
            this.particles.addBlockSparks(
              i * this.squareSize + this.squareSize / 2,
              j * this.squareSize + this.squareSize / 2,
              this.theme.dayColor,
              4
            );
          }
        }
      }
    }

    this.particles.addShockwave(target.i * this.squareSize + this.squareSize / 2, target.j * this.squareSize + this.squareSize / 2, this.theme.dayAccent, 65);
    this.calculateTerritory();
  }

  // Normal Skill: Eclipse
  activateEclipse(isRemote = false) {
    if (this.state !== 'running' && !isRemote) return;
    if (this.isOnline && !this.isHost && !isRemote) {
      if (this.p2SkillCD > 0) return;
      this.p2SkillCD = 250;
      this.network.sendSkillAction('night');
      return;
    }
    if (this.p2SkillCD > 0) return;
    this.p2SkillCD = 5000;

    const enemyTiles = [];
    for (let i = 0; i < this.gridX; i++) {
      for (let j = 0; j < this.gridY; j++) {
        if (this.squares[i][j] === this.theme.dayColor) {
          enemyTiles.push({ i, j });
        }
      }
    }

    if (enemyTiles.length === 0) return;
    const target = enemyTiles[Math.floor(Math.random() * enemyTiles.length)];

    this.sound.playSkill('eclipse');
    this.particles.shake(4, 1.5);

    const radius = 1.5;
    for (let i = target.i - 2; i <= target.i + 2; i++) {
      for (let j = target.j - 2; j <= target.j + 2; j++) {
        if (i >= 0 && i < this.gridX && j >= 0 && j < this.gridY) {
          const dist = Math.hypot(i - target.i, j - target.j);
          if (dist <= radius) {
            this.squares[i][j] = this.theme.nightColor;
            if (this.stoneGrid[i][j]) this.stoneGrid[i][j] = null;
            this.particles.addBlockSparks(
              i * this.squareSize + this.squareSize / 2,
              j * this.squareSize + this.squareSize / 2,
              this.theme.nightColor,
              4
            );
          }
        }
      }
    }

    this.particles.addShockwave(target.i * this.squareSize + this.squareSize / 2, target.j * this.squareSize + this.squareSize / 2, this.theme.nightAccent, 65);
    this.calculateTerritory();
  }

  // Ultimate Skill: 3-Row Laser Beam with Paddle Shielding & Energy Absorption
  activateLaser(isLeft = true, isRemote = false) {
    if (this.state !== 'running' && !isRemote) return;
    const caster = isLeft ? this.leftPaddle : this.rightPaddle;
    const defender = isLeft ? this.rightPaddle : this.leftPaddle;
    if (caster.energy < 100) return;

    if (this.isOnline && !this.isHost && !isRemote) {
      caster.energy = 0;
      this.network.sendLaserAction(isLeft ? 'day' : 'night');
      return;
    }

    caster.energy = 0;
    const targetColor = isLeft ? this.theme.dayColor : this.theme.nightColor;
    const beamColor = isLeft ? (this.theme.dayAccent || '#2B2620') : (this.theme.nightAccent || '#8A8175');

    let centerRow = Math.floor(caster.y / this.squareSize);
    centerRow = Math.max(1, Math.min(this.gridY - 2, centerRow));
    const beamRows = [centerRow - 1, centerRow, centerRow + 1];

    const laserY = centerRow * this.squareSize + this.squareSize / 2;
    const laserTopY = (centerRow - 1) * this.squareSize;
    const laserBottomY = (centerRow + 2) * this.squareSize;

    const startX = isLeft ? caster.x + caster.width / 2 : caster.x - caster.width / 2;

    const defTopY = defender.y - defender.height / 2;
    const defBottomY = defender.y + defender.height / 2;
    const isBlocked = (this.mode !== 'sim') && (Math.max(laserTopY, defTopY) < Math.min(laserBottomY, defBottomY));

    let targetX = isLeft ? this.width : 0;
    const defenderCol = Math.floor(defender.x / this.squareSize);

    if (isBlocked) {
      targetX = isLeft ? (defender.x - defender.width / 2) : (defender.x + defender.width / 2);
      
      defender.energy = Math.min(100, defender.energy + 30.0);

      this.sound.playShieldAbsorb();
      this.particles.shake(5, 2);
      this.particles.addEnergyShield(defender.x, defender.y, defender.height, isLeft ? (this.theme.nightAccent || '#8A8175') : (this.theme.dayAccent || '#2B2620'), 25);
    } else {
      this.sound.playLaser(isLeft);
      this.particles.shake(6, 2.5);
    }

    this.particles.addLaserBeam(startX, targetX, laserY, this.squareSize * 3, beamColor, 18);

    beamRows.forEach(r => {
      if (r >= 0 && r < this.gridY) {
        for (let i = 0; i < this.gridX; i++) {
          if (isBlocked) {
            if (isLeft && i >= defenderCol) continue;
            if (!isLeft && i <= defenderCol) continue;
          }

          this.squares[i][r] = targetColor;
          if (this.stoneGrid[i][r]) this.stoneGrid[i][r] = null;
          if (i % 2 === 0) {
            this.particles.addBlockSparks(
              i * this.squareSize + this.squareSize / 2,
              r * this.squareSize + this.squareSize / 2,
              targetColor,
              2
            );
          }
        }
      }
    });

    this.calculateTerritory();
  }

  spawnRandomPowerup() {
    if (this.powerups.length >= 2) return;
    const types = ['bomb', 'multiball', 'freeze', 'speed', 'petrify'];
    const type = types[Math.floor(Math.random() * types.length)];
    const gx = Math.floor(Math.random() * (this.gridX - 4)) + 2;
    const gy = Math.floor(Math.random() * (this.gridY - 4)) + 2;

    this.powerups.push({
      type: type,
      x: gx * this.squareSize + this.squareSize / 2,
      y: gy * this.squareSize + this.squareSize / 2,
      radius: 11,
      timer: 600
    });
  }

  applyPowerup(powerup, ball) {
    const isDay = ball.team === 'day';
    const enemyPaddle = isDay ? this.rightPaddle : this.leftPaddle;

    if (powerup.type === 'petrify') {
      this.sound.playSkill('petrify');
      this.particles.shake(4, 1.5);

      const enemyColor = isDay ? this.theme.nightColor : this.theme.dayColor;
      const enemyTiles = [];
      for (let i = 0; i < this.gridX; i++) {
        for (let j = 0; j < this.gridY; j++) {
          if (this.squares[i][j] === enemyColor) {
            enemyTiles.push({ i, j });
          }
        }
      }

      const count = Math.min(5, enemyTiles.length);
      for (let k = 0; k < count; k++) {
        const randIdx = Math.floor(Math.random() * enemyTiles.length);
        const pick = enemyTiles.splice(randIdx, 1)[0];
        if (pick) {
          this.squares[pick.i][pick.j] = ball.reverseColor;
          this.stoneGrid[pick.i][pick.j] = { hp: 2, maxHp: 2, owner: ball.team };
          this.particles.addStoneDebris(
            pick.i * this.squareSize + this.squareSize / 2,
            pick.j * this.squareSize + this.squareSize / 2,
            false
          );
        }
      }
    } else if (powerup.type === 'bomb') {
      this.sound.playSkill('generic');
      this.sound.playExplosion();
      this.particles.shake(5, 2);
      const centerI = Math.floor(powerup.x / this.squareSize);
      const centerJ = Math.floor(powerup.y / this.squareSize);
      for (let i = centerI - 2; i <= centerI + 2; i++) {
        for (let j = centerJ - 2; j <= centerJ + 2; j++) {
          if (i >= 0 && i < this.gridX && j >= 0 && j < this.gridY) {
            this.squares[i][j] = ball.reverseColor;
            if (this.stoneGrid[i][j]) this.stoneGrid[i][j] = null;
            this.particles.addBlockSparks(
              i * this.squareSize + this.squareSize / 2,
              j * this.squareSize + this.squareSize / 2,
              ball.reverseColor,
              3
            );
          }
        }
      }
      this.particles.addShockwave(powerup.x, powerup.y, ball.reverseColor, 70);
    } else if (powerup.type === 'multiball') {
      this.sound.playSkill('generic');
      for (let k = -1; k <= 1; k += 2) {
        this.balls.push({
          x: ball.x,
          y: ball.y,
          dx: ball.dx * 0.9 + k * 1.2,
          dy: ball.dy * 0.9 - k * 1.2,
          team: ball.team,
          reverseColor: ball.reverseColor,
          ballColor: ball.ballColor,
          radius: this.squareSize / 2,
          penetrationCapacity: ball.penetrationCapacity,
          remainingPenetration: 1,
          isExtra: true,
          // 分裂球持续 6 秒：60 步/秒 × 3 子步 × 6 秒 = 1080
          lifetime: 1080
        });
      }
    } else if (powerup.type === 'freeze') {
      this.sound.playSkill('generic');
      enemyPaddle.frozenTimer = 150;
    } else if (powerup.type === 'speed') {
      this.sound.playSkill('generic');
      ball.penetrationCapacity = Math.min(3, ball.penetrationCapacity + 1);
      ball.remainingPenetration = ball.penetrationCapacity;
    }

    this.calculateTerritory();
  }

  handleInput() {
    if (this.mode === 'sim') return;

    // In Online LAN mode, player only controls their assigned paddle
    if (this.isOnline) {
      const isMyDay = this.playerSide === 'day';
      const myPaddle = isMyDay ? this.leftPaddle : this.rightPaddle;
      const mySpeed = myPaddle.frozenTimer > 0 ? myPaddle.speed * 0.45 : myPaddle.speed;
      myPaddle.vy = 0;

      if (this.keys['KeyW'] || this.keys['w'] || this.keys['W'] || this.keys['ArrowUp']) {
        myPaddle.y -= mySpeed;
        myPaddle.vy = -mySpeed;
      }
      if (this.keys['KeyS'] || this.keys['s'] || this.keys['S'] || this.keys['ArrowDown']) {
        myPaddle.y += mySpeed;
        myPaddle.vy = mySpeed;
      }
      if (this.keys['KeyE'] || this.keys['e'] || this.keys['E'] || this.keys['ShiftRight'] || this.keys['Slash']) {
        if (isMyDay) this.activateSolarFlare();
        else this.activateEclipse();
      }
      if (this.keys['Space'] || this.keys[' '] || this.keys['Enter'] || this.keys['NumpadEnter']) {
        this.activateLaser(isMyDay);
      }

      myPaddle.y = Math.max(myPaddle.height / 2, Math.min(this.height - myPaddle.height / 2, myPaddle.y));
      if (!this.isHost) this.network.sendPaddleInput(myPaddle.y, myPaddle.vy);
      return;
    }

    // P1 Controls (Local)
    const p1Speed = this.leftPaddle.frozenTimer > 0 ? this.leftPaddle.speed * 0.45 : this.leftPaddle.speed;
    this.leftPaddle.vy = 0;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['W']) {
      this.leftPaddle.y -= p1Speed;
      this.leftPaddle.vy = -p1Speed;
    }
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['S']) {
      this.leftPaddle.y += p1Speed;
      this.leftPaddle.vy = p1Speed;
    }
    if (this.keys['KeyE'] || this.keys['e'] || this.keys['E']) {
      this.activateSolarFlare();
    }
    if (this.keys['Space'] || this.keys[' ']) {
      this.activateLaser(true);
    }

    // P2 Controls (Local PVP)
    if (this.mode === 'pvp') {
      const p2Speed = this.rightPaddle.frozenTimer > 0 ? this.rightPaddle.speed * 0.45 : this.rightPaddle.speed;
      this.rightPaddle.vy = 0;
      if (this.keys['ArrowUp']) {
        this.rightPaddle.y -= p2Speed;
        this.rightPaddle.vy = -p2Speed;
      }
      if (this.keys['ArrowDown']) {
        this.rightPaddle.y += p2Speed;
        this.rightPaddle.vy = p2Speed;
      }
      if (this.keys['ShiftRight'] || this.keys['Slash']) {
        this.activateEclipse();
      }
      if (this.keys['Enter'] || this.keys['NumpadEnter']) {
        this.activateLaser(false);
      }
    }

    this.leftPaddle.y = Math.max(this.leftPaddle.height / 2, Math.min(this.height - this.leftPaddle.height / 2, this.leftPaddle.y));
    this.rightPaddle.y = Math.max(this.rightPaddle.height / 2, Math.min(this.height - this.rightPaddle.height / 2, this.rightPaddle.y));
  }

  update(delta) {
    if (this.state !== 'running') return;

    const frameDelta = Number.isFinite(delta)
      ? Math.max(0, Math.min(MAX_FRAME_DELTA_MS, delta))
      : 0;

    if (this.isOnline && !this.isHost) {
      this.simulationAccumulator += frameDelta;
      let inputSteps = 0;
      while (this.simulationAccumulator + 0.000001 >= FIXED_STEP_MS &&
             inputSteps < 15 && this.state === 'running') {
        this.handleInput();
        this.particles.update();
        this.simulationAccumulator = Math.max(
          0,
          this.simulationAccumulator - FIXED_STEP_MS
        );
        inputSteps++;
      }
      return;
    }

    this.simulationAccumulator += frameDelta;
    let simulationSteps = 0;
    while (this.simulationAccumulator + 0.000001 >= FIXED_STEP_MS &&
           simulationSteps < 15 && this.state === 'running') {
      this.simulateFixedStep();
      this.simulationAccumulator = Math.max(
        0,
        this.simulationAccumulator - FIXED_STEP_MS
      );
      simulationSteps++;
    }
  }

  simulateFixedStep() {
    this.elapsedSeconds += FIXED_STEP_MS / 1000;
    if (this.timeLimit > 0) {
      this.timerAcc += FIXED_STEP_MS;
      while (this.timerAcc + 0.000001 >= 1000) {
        this.timeLeft--;
        this.timerAcc = Math.max(0, this.timerAcc - 1000);
        if (this.timeLeft <= 0) {
          this.endGame();
          return;
        }
      }
    }
    if (this.p1SkillCD > 0) {
      this.p1SkillCD = Math.max(0, this.p1SkillCD - FIXED_STEP_MS);
    }
    if (this.p2SkillCD > 0) {
      this.p2SkillCD = Math.max(0, this.p2SkillCD - FIXED_STEP_MS);
    }
    if (this.hasReachedWinTerritory()) {
      this.endGame();
      return;
    }

    const globalSpeedRatio = 0.5 + Math.min(1.0, this.elapsedSeconds / 75.0);
    const globalTargetSpeed = BASE_BALL_SPEED * globalSpeedRatio;

    this.handleInput();

    if (this.mode === 'pve') {
      this.ai.update(this.rightPaddle, this.balls, this.height, true, this);
    }

    [this.leftPaddle, this.rightPaddle].forEach(p => {
      if (p.frozenTimer > 0) p.frozenTimer--;
    });

    this.powerupSpawnTimer++;
    if (this.powerupSpawnTimer >= 450 && this.mode !== 'sim') {
      this.powerupSpawnTimer = 0;
      this.spawnRandomPowerup();
    }

    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.timer--;
      if (p.timer <= 0) this.powerups.splice(i, 1);
    }

    const steps = 3;
    for (let s = 0; s < steps; s++) {
      for (let bIdx = this.balls.length - 1; bIdx >= 0; bIdx--) {
        const ball = this.balls[bIdx];

        const currentBallSpeed = Math.hypot(ball.dx, ball.dy);
        if (currentBallSpeed > 0.01 && currentBallSpeed < globalTargetSpeed) {
          const speedFactor = Math.min(globalTargetSpeed, currentBallSpeed + 0.015) / currentBallSpeed;
          ball.dx *= speedFactor;
          ball.dy *= speedFactor;
        }

        const ballSpeedRatio = (Math.hypot(ball.dx, ball.dy) / BASE_BALL_SPEED);
        // 连破数：低速 1 格，其余 2 格（极速从 3 格下调为 2 格）
        ball.penetrationCapacity = ballSpeedRatio < 0.85 ? 1 : 2;
        // 极速档（≥1.25x）标记：用于高速特效与石化一击碎
        ball.atMaxSpeed = ballSpeedRatio >= 1.25;

        const stepDx = (ball.dx / steps) * (this.mode === 'sim' ? this.simSpeed : 1.0);
        const stepDy = (ball.dy / steps) * (this.mode === 'sim' ? this.simSpeed : 1.0);

        ball.x += stepDx;
        ball.y += stepDy;

        if (s === 0) {
          // 拖尾颜色取自当前主题（黑球=dayBall 墨色，白球=nightBall 色系），纯视觉参数
          const trailColor = ball.team === 'day' ? this.theme.dayBall : this.theme.nightBall;
          this.particles.addBallTrail(ball.x, ball.y, trailColor, ball.radius, ball.atMaxSpeed === true);
        }

        this.physics.checkSquareCollision(
          ball,
          this.squares,
          this.stoneGrid,
          this.theme.dayColor,
          this.theme.nightColor,
          (i, j, b, oldColor) => {
            const isDay = b.team === 'day';
            const combo = isDay ? ++this.dayCombo : ++this.nightCombo;
            this.sound.playBlockFlip(isDay, combo);

            const paddle = isDay ? this.leftPaddle : this.rightPaddle;
            paddle.energy = Math.min(100, paddle.energy + 0.8);

            this.particles.addBlockSparks(
              i * this.squareSize + this.squareSize / 2,
              j * this.squareSize + this.squareSize / 2,
              b.reverseColor,
              4
            );
          },
          (i, j, isDestroyed) => {
            this.sound.playStoneHit(isDestroyed);
            this.particles.addStoneDebris(
              i * this.squareSize + this.squareSize / 2,
              j * this.squareSize + this.squareSize / 2,
              isDestroyed
            );
          }
        );

        this.physics.checkBoundaryCollision(ball, this.width, this.height);

        if (this.mode !== 'sim') {
          this.physics.checkPaddleCollision(ball, this.leftPaddle, this.rightPaddle, true, (paddle, enemyPaddle, b) => {
            this.dayCombo = 0;
            this.sound.playPaddleHit(false);
            this.particles.addShockwave(paddle.x, paddle.y, this.theme.dayColor, 35);
            this.particles.addEnergySiphon(b.x, b.y, paddle.x, paddle.y, this.theme.dayAccent, 8);
            this.particles.addSlowdownRing(b.x, b.y, '#8A8175');
          });

          this.physics.checkPaddleCollision(ball, this.rightPaddle, this.leftPaddle, false, (paddle, enemyPaddle, b) => {
            this.nightCombo = 0;
            this.sound.playPaddleHit(false);
            this.particles.addShockwave(paddle.x, paddle.y, this.theme.nightColor, 35);
            this.particles.addEnergySiphon(b.x, b.y, paddle.x, paddle.y, this.theme.nightAccent, 8);
            this.particles.addSlowdownRing(b.x, b.y, '#8A8175');
          });
        }

        for (let pIdx = this.powerups.length - 1; pIdx >= 0; pIdx--) {
          const pu = this.powerups[pIdx];
          const dist = Math.hypot(ball.x - pu.x, ball.y - pu.y);
          if (dist < ball.radius + pu.radius) {
            this.applyPowerup(pu, ball);
            this.powerups.splice(pIdx, 1);
          }
        }

        if (ball.isExtra) {
          ball.lifetime--;
          if (ball.lifetime <= 0) this.balls.splice(bIdx, 1);
        }

        this.physics.applyRandomness(ball, 2.4, 11.2);
      }
    }

    this.calculateTerritory();
    this.particles.update();
  }

  hasReachedWinTerritory() {
    if (!this.totalSquares) return false;
    const dayRatio = this.dayScore / this.totalSquares;
    const nightRatio = this.nightScore / this.totalSquares;
    if (this.timeLimit === 0) {
      return dayRatio >= DEATHMATCH_WIN_RATIO || nightRatio >= DEATHMATCH_WIN_RATIO;
    }
    return this.dayScore === this.totalSquares || this.nightScore === this.totalSquares;
  }

  endGame() {
    this.state = 'gameover';
    const dayWon = this.dayScore >= this.nightScore;
    this.sound.playVictory(dayWon);
    this.particles.shake(8, 3);
    this.particles.addShockwave(this.width / 2, this.height / 2, dayWon ? this.theme.dayColor : this.theme.nightColor, 200);
  }

  roundedRectPath(x, y, width, height, radius) {
    const ctx = this.ctx;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + height - r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.lineTo(x + r, y + height);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ===== 领地水墨纹理层（纯视觉增量缓存：只改绘制方式，不改 squares 数据结构） =====
  _terrRand(i, j, k) {
    let h = ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }

  _renderTerrCell(ctx, i, j) {
    const s = this.squareSize;
    const x = i * s;
    const y = j * s;
    const color = this.squares[i][j];

    ctx.globalAlpha = 1;
    ctx.clearRect(x, y, s, s);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s, s);

    if (color === this.theme.nightColor) {
      // 黑夜领地：大尺度平滑墨色晕染（跨格连续浓淡，非平涂死黑）
      const nx = x / this.width;
      const ny = y / this.height;
      let v = Math.sin(nx * 9.3 + 1.7) * Math.cos(ny * 7.1 + 0.6) * 0.5
            + Math.sin((nx + ny) * 5.2 + 3.1) * 0.35
            + Math.cos(nx * 3.7 - ny * 6.4) * 0.15;
      v *= 0.85 + this._terrRand(i, j, 0) * 0.3; // 轻微逐格抖动防色带
      if (v > 0) {
        ctx.fillStyle = `rgba(232, 224, 208, ${(v * 0.1).toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(0, 0, 0, ${(-v * 0.17).toFixed(3)})`;
      }
      ctx.fillRect(x, y, s, s);
      // 叠加一格内极淡的径向墨团，增加宣纸吸墨的局部质感
      const rx = x + this._terrRand(i, j, 2) * s;
      const ry = y + this._terrRand(i, j, 3) * s;
      const rr = s * (0.5 + this._terrRand(i, j, 4) * 0.5);
      const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
      const lightBlob = this._terrRand(i, j, 5) > 0.5;
      g.addColorStop(0, lightBlob ? 'rgba(232, 224, 208, 0.05)' : 'rgba(0, 0, 0, 0.08)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, s, s);
    } else {
      // 白昼领地：宣纸纤维细纹
      ctx.strokeStyle = 'rgba(140, 132, 118, 0.05)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const rx = x + this._terrRand(i, j, k * 2) * s;
        const ry = y + this._terrRand(i, j, k * 2 + 1) * s;
        const ang = this._terrRand(i, j, 10 + k) * Math.PI;
        const len = s * (0.35 + this._terrRand(i, j, 20 + k) * 0.45);
        ctx.beginPath();
        ctx.moveTo(rx - Math.cos(ang) * len / 2, ry - Math.sin(ang) * len / 2);
        ctx.lineTo(rx + Math.cos(ang) * len / 2, ry + Math.sin(ang) * len / 2);
        ctx.stroke();
      }
    }

    // 交界晕染：与异色格相邻的边上叠不规则小墨点，让边界更有机
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let n = 0; n < 4; n++) {
      const ni = i + dirs[n][0];
      const nj = j + dirs[n][1];
      if (ni < 0 || nj < 0 || ni >= this.gridX || nj >= this.gridY) continue;
      if (this.squares[ni][nj] === color) continue;
      for (let k = 0; k < 3; k++) {
        const t = this._terrRand(i, j, 30 + n * 3 + k);
        const wob = (this._terrRand(i, j, 60 + n * 3 + k) - 0.5) * 3.5;
        let ex, ey;
        if (dirs[n][0] !== 0) {
          ex = x + (dirs[n][0] > 0 ? s - 1.5 : 1.5) + wob * dirs[n][0];
          ey = y + t * s;
        } else {
          ex = x + t * s;
          ey = y + (dirs[n][1] > 0 ? s - 1.5 : 1.5) + wob * dirs[n][1];
        }
        const rr = 1.8 + this._terrRand(i, j, 50 + n * 3 + k) * 3.2;
        ctx.globalAlpha = 0.18 + this._terrRand(i, j, 70 + n * 3 + k) * 0.2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ex, ey, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _syncTerritoryLayer() {
    if (!this._terrLayer || this._terrLayer.width !== this.width || this._terrLayer.height !== this.height) {
      this._terrLayer = document.createElement('canvas');
      this._terrLayer.width = this.width;
      this._terrLayer.height = this.height;
      this._terrColors = null;
    }
    const ctx = this._terrLayer.getContext('2d');

    if (!this._terrColors) {
      this._terrColors = [];
      for (let i = 0; i < this.gridX; i++) {
        this._terrColors[i] = new Array(this.gridY);
        for (let j = 0; j < this.gridY; j++) {
          this._renderTerrCell(ctx, i, j);
          this._terrColors[i][j] = this.squares[i][j];
        }
      }
      return;
    }

    // 增量重绘：仅颜色发生变化的格子（及其邻居的交界晕染）
    for (let i = 0; i < this.gridX; i++) {
      for (let j = 0; j < this.gridY; j++) {
        if (this.squares[i][j] !== this._terrColors[i][j]) {
          this._terrColors[i][j] = this.squares[i][j];
          this._renderTerrCell(ctx, i, j);
          if (i + 1 < this.gridX) this._renderTerrCell(ctx, i + 1, j);
          if (i - 1 >= 0) this._renderTerrCell(ctx, i - 1, j);
          if (j + 1 < this.gridY) this._renderTerrCell(ctx, i, j + 1);
          if (j - 1 >= 0) this._renderTerrCell(ctx, i, j - 1);
        }
      }
    }
  }

  draw() {
    this.ctx.save();
    
    if (this.particles.shakeDuration > 0) {
      this.ctx.translate(this.particles.shakeOffsetX, this.particles.shakeOffsetY);
    }

    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw Grid Squares（水墨宣纸/晕染领地：离屏纹理层一次性贴上）
    this._syncTerritoryLayer();
    this.ctx.drawImage(this._terrLayer, 0, 0);

    // Stones overlay
    for (let i = 0; i < this.gridX; i++) {
      for (let j = 0; j < this.gridY; j++) {
        const stone = this.stoneGrid[i] ? this.stoneGrid[i][j] : null;
        if (stone) {
          this.ctx.save();
          this.ctx.strokeStyle = '#55504A';
          this.ctx.lineWidth = 2.5;
          this.ctx.strokeRect(i * this.squareSize + 1.5, j * this.squareSize + 1.5, this.squareSize - 3, this.squareSize - 3);

          this.ctx.fillStyle = '#55504A';
          this.ctx.beginPath();
          this.ctx.arc(i * this.squareSize + this.squareSize / 2, j * this.squareSize + this.squareSize / 2, 2.5, 0, Math.PI * 2);
          this.ctx.fill();

          if (stone.hp === 1) {
            this.ctx.strokeStyle = '#CFC8BA';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.squareSize + 4, j * this.squareSize + 4);
            this.ctx.lineTo(i * this.squareSize + this.squareSize / 2, j * this.squareSize + this.squareSize / 2);
            this.ctx.lineTo(i * this.squareSize + this.squareSize - 4, j * this.squareSize + this.squareSize - 4);
            this.ctx.moveTo(i * this.squareSize + this.squareSize - 5, j * this.squareSize + 5);
            this.ctx.lineTo(i * this.squareSize + this.squareSize / 2, j * this.squareSize + this.squareSize / 2);
            this.ctx.stroke();
          }
          this.ctx.restore();
        }
      }
    }

    // Grid lines
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= this.gridX; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(i * this.squareSize, 0);
      this.ctx.lineTo(i * this.squareSize, this.height);
      this.ctx.stroke();
    }
    for (let j = 0; j <= this.gridY; j++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, j * this.squareSize);
      this.ctx.lineTo(this.width, j * this.squareSize);
      this.ctx.stroke();
    }

    // 2. Draw Vector Power-Ups
    this.powerups.forEach(p => {
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      const pulse = 1 + Math.sin(Date.now() / 150) * 0.12;
      this.ctx.scale(pulse, pulse);

      this.ctx.beginPath();
      this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(26, 23, 18, 0.92)';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = p.type === 'petrify' ? '#8C857A' : '#F0E7D3';
      this.ctx.stroke();

      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.lineWidth = 1.5;

      if (p.type === 'petrify') {
        this.ctx.beginPath();
        this.ctx.moveTo(0, -6);
        this.ctx.lineTo(5, -3);
        this.ctx.lineTo(5, 2);
        this.ctx.lineTo(0, 6);
        this.ctx.lineTo(-5, 2);
        this.ctx.lineTo(-5, -3);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.fillStyle = '#8C857A';
        this.ctx.fill();
      } else if (p.type === 'bomb') {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(-7, 0); this.ctx.lineTo(7, 0);
        this.ctx.moveTo(0, -7); this.ctx.lineTo(0, 7);
        this.ctx.stroke();
      } else if (p.type === 'multiball') {
        this.ctx.beginPath();
        this.ctx.arc(-3.5, 2, 2, 0, Math.PI * 2);
        this.ctx.arc(3.5, 2, 2, 0, Math.PI * 2);
        this.ctx.arc(0, -3.5, 2, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (p.type === 'freeze') {
        for (let a = 0; a < 3; a++) {
          this.ctx.save();
          this.ctx.rotate(a * Math.PI / 3);
          this.ctx.beginPath();
          this.ctx.moveTo(-5, 0); this.ctx.lineTo(5, 0);
          this.ctx.stroke();
          this.ctx.restore();
        }
      } else if (p.type === 'speed') {
        this.ctx.beginPath();
        this.ctx.moveTo(-1, -5);
        this.ctx.lineTo(3, -1);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(2, 5);
        this.ctx.lineTo(-3, 1);
        this.ctx.lineTo(-0.5, 0);
        this.ctx.closePath();
        this.ctx.fill();
      }

      this.ctx.restore();
    });

    // 3. Draw Paddles
    if (this.mode !== 'sim') {
      [this.leftPaddle, this.rightPaddle].forEach(p => {
        this.ctx.save();
        
        if (p.frozenTimer > 0) {
          this.ctx.shadowColor = '#FFFFFF';
          this.ctx.shadowBlur = 12;
        } else if (p.energy >= 100) {
          this.ctx.shadowColor = '#2B2620';
          this.ctx.shadowBlur = 18;
        }

        this.ctx.fillStyle = p.frozenTimer > 0 ? '#B8B2A4' : (p.isLeft ? this.theme.dayBall : this.theme.nightBall);
        
        const rx = p.x - p.width / 2;
        const ry = p.y - p.height / 2;
        const radius = p.width / 2;

        this.ctx.beginPath();
        this.roundedRectPath(rx, ry, p.width, p.height, radius);
        this.ctx.fill();

        // Laser Core when ready
        if (p.energy >= 100) {
          this.ctx.fillStyle = '#FFFFFF';
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.strokeStyle = 'rgba(138, 129, 117, 0.35)';
          this.ctx.setLineDash([4, 4]);
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(p.isLeft ? this.width : 0, p.y);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        }

        this.ctx.restore();
      });
    }

    // 4. Draw Lasers & Particles
    this.particles.draw(this.ctx, this.width);

    // 5. Draw Distinct Black & White Balls（水墨风：墨珠=不规则晕染墨团，白丸=发光球+柔光晕）
    this.balls.forEach(ball => {
      const isDayBall = ball.team === 'day';
      const ballColor = isDayBall ? this.theme.dayBall : this.theme.nightBall;
      const spr = _gmGetBallSprite(ballColor, isDayBall);
      const drawSize = ball.radius * 2 * spr.scale;

      this.ctx.save();
      if (ball.atMaxSpeed === true) {
        this.ctx.shadowColor = isDayBall ? 'rgba(0,0,0,0.85)' : ballColor;
        this.ctx.shadowBlur = 18;
      } else if (!isDayBall) {
        // 白丸常态柔和辉光
        this.ctx.shadowColor = 'rgba(255,255,255,0.55)';
        this.ctx.shadowBlur = 14;
      } else {
        this.ctx.shadowColor = 'rgba(0,0,0,0.35)';
        this.ctx.shadowBlur = 5;
      }
      this.ctx.drawImage(spr.canvas, ball.x - drawSize / 2, ball.y - drawSize / 2, drawSize, drawSize);
      this.ctx.restore();

      if (isDayBall) {
        // 墨珠表面的宣纸反光小高光
        this.ctx.save();
        this.ctx.globalAlpha = 0.26;
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(ball.x - ball.radius * 0.28, ball.y - ball.radius * 0.3, ball.radius * 0.22, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    });

    this.ctx.restore();
  }
}

window.PongWarsGame = PongWarsGame;
window.THEMES = THEMES;
