/**
 * 昼夜领地对战 V1.0 Particle and Visual Effects System
 * Pure visual particle effects without text clutter
 */

// ===== 水墨拖尾 Sprite 缓存（纯视觉：预渲染柔边墨点/光点，逐帧复用） =====
function _psHexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.replace('#', '');
  if (m.length !== 6) return null;
  const v = parseInt(m, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function _psIsDarkColor(color) {
  const c = _psHexToRgb(color);
  if (!c) return true;
  // 相对亮度，低于阈值视为深色（墨珠系）
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 < 0.5;
}

//  deterministic pseudo-random for stable sprites
function _psSeededRand(seed) {
  let h = seed >>> 0;
  return function () {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

const _psTrailSpriteCache = {};

// kind: 'ink'（柔边墨点，边缘略不规则+颗粒） | 'glow'（发光圆点，核心亮、外圈辉光）
function _psGetTrailSprite(color, kind) {
  const key = kind + '|' + color;
  let spr = _psTrailSpriteCache[key];
  if (spr) return spr;

  const S = 64;
  spr = document.createElement('canvas');
  spr.width = S;
  spr.height = S;
  const c = spr.getContext('2d');
  const rgb = _psHexToRgb(color) || { r: 20, g: 20, b: 20 };
  const rgba = (a) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  let seed = 7;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const rand = _psSeededRand(seed);

  if (kind === 'ink') {
    // 主墨团：中心浓、边缘渐淡
    let g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
    g.addColorStop(0, rgba(0.92));
    g.addColorStop(0.5, rgba(0.6));
    g.addColorStop(0.8, rgba(0.22));
    g.addColorStop(1, rgba(0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // 偏移小墨晕，打破完美圆形
    for (let k = 0; k < 2; k++) {
      const ox = S / 2 + (rand() - 0.5) * S * 0.3;
      const oy = S / 2 + (rand() - 0.5) * S * 0.3;
      const or = S * (0.16 + rand() * 0.12);
      g = c.createRadialGradient(ox, oy, 0, ox, oy, or);
      g.addColorStop(0, rgba(0.4));
      g.addColorStop(1, rgba(0));
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }
    // 飞白颗粒
    for (let k = 0; k < 4; k++) {
      const ang = rand() * Math.PI * 2;
      const d = S * (0.3 + rand() * 0.18);
      c.globalAlpha = 0.2 + rand() * 0.25;
      c.fillStyle = color;
      c.beginPath();
      c.arc(S / 2 + Math.cos(ang) * d, S / 2 + Math.sin(ang) * d, 0.8 + rand() * 1.6, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
  } else {
    // 光点：亮核 + 外圈柔和辉光
    let g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(1));
    g.addColorStop(0.28, rgba(0.95));
    g.addColorStop(0.55, rgba(0.35));
    g.addColorStop(1, rgba(0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  }

  _psTrailSpriteCache[key] = spr;
  return spr;
}

class ParticleSystem {
  constructor() {
    this.particles = [];
    this.shockwaves = [];
    this.lasers = [];
    this.shields = [];
    this.siphonBeads = [];
    this.slowdownRings = [];
    this.shakeDuration = 0;
    this.shakeIntensity = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  // Trigger screen shake (gentle and subtle)
  shake(duration = 5, intensity = 2) {
    this.shakeDuration = duration;
    this.shakeIntensity = intensity;
  }

  // Add block conversion particles
  addBlockSparks(x, y, color, count = 5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2.8 + 1;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        color: color,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.025,
        shape: 'square'
      });
    }
  }

  // Add Stone/Rock Debris when hitting petrified blocks
  addStoneDebris(x, y, isDestroyed = false) {
    const count = isDestroyed ? 14 : 7;
    const stoneColors = ['#718096', '#4A5568', '#A0AEC0', '#E2E8F0'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (isDestroyed ? 4.5 : 2.5) + 1;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * (isDestroyed ? 4 : 3) + 2,
        color: stoneColors[Math.floor(Math.random() * stoneColors.length)],
        alpha: 1,
        decay: Math.random() * 0.04 + 0.03,
        shape: 'square'
      });
    }
  }

  // Add distinct black/white ball trail
  // 黑球（墨珠）：每步盖一枚柔边墨点，重叠成沿运动方向的连续水墨拖尾（粗浓→细淡），偶发飞白颗粒
  // 白球（白丸）：隔步盖一枚发光圆点，形成离散递减的白色墨点回声
  addBallTrail(x, y, ballColor, size, isHighSpeed = false) {
    const isDarkBall = _psIsDarkColor(ballColor);

    if (isDarkBall) {
      this.particles.push({
        x: x + (Math.random() * 2 - 1),
        y: y + (Math.random() * 2 - 1),
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        size: size * (isHighSpeed ? 1.3 : 1.1),
        color: ballColor,
        alpha: isHighSpeed ? 0.65 : 0.55,
        decay: isHighSpeed ? 0.011 : 0.013,
        shrink: 0.955,
        shape: 'inkstamp'
      });

      // 飞白/颗粒感：少量细碎墨点散落在主拖尾两侧
      if (Math.random() < 0.35) {
        const ang = Math.random() * Math.PI * 2;
        const d = size * (0.4 + Math.random() * 0.6);
        this.particles.push({
          x: x + Math.cos(ang) * d,
          y: y + Math.sin(ang) * d,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: size * (0.14 + Math.random() * 0.16),
          color: ballColor,
          alpha: 0.38,
          decay: 0.05,
          shrink: 0.9,
          shape: 'inkstamp'
        });
      }
    } else {
      // 离散圆点回声：每 4 步一颗，间距随速度自然拉开
      this._trailTick = (this._trailTick || 0) + 1;
      if (this._trailTick % 4 !== 0) return;
      this.particles.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        size: size * (isHighSpeed ? 0.95 : 0.85),
        color: ballColor,
        alpha: 1,
        decay: 0.016,
        shrink: 0.945,
        shape: 'glowdot'
      });
    }
  }

  // Add shockwave ring
  addShockwave(x, y, color, maxRadius = 80) {
    this.shockwaves.push({
      x: x,
      y: y,
      radius: 4,
      maxRadius: maxRadius,
      color: color,
      alpha: 1,
      lineWidth: 3.5,
      growth: 4.5
    });
  }

  // Add Energy Siphon Beaded Flow from ball to paddle
  addEnergySiphon(fromX, fromY, toX, toY, color = '#00F0FF', count = 8) {
    for (let i = 0; i < count; i++) {
      this.siphonBeads.push({
        x: fromX + (Math.random() - 0.5) * 10,
        y: fromY + (Math.random() - 0.5) * 10,
        targetX: toX,
        targetY: toY,
        progress: 0,
        speed: 0.07 + Math.random() * 0.05,
        color: color,
        size: 3.5 + Math.random() * 2,
        alpha: 1.0
      });
    }
  }

  // Add Ball Slowdown deceleration ripple ring
  addSlowdownRing(x, y, color = '#00E5FF') {
    this.slowdownRings.push({
      x: x,
      y: y,
      radius: 6,
      maxRadius: 28,
      color: color,
      alpha: 1.0
    });
  }

  // Add Energy Shield Barrier on Paddle
  addEnergyShield(x, y, height, color = '#00E5FF', duration = 24) {
    this.shields.push({
      x: x,
      y: y,
      height: height + 20,
      color: color,
      alpha: 1.0,
      life: duration,
      maxLife: duration
    });
  }

  // Add High-Impact Laser Beam anchored to paddle
  addLaserBeam(startX, targetX, yCenter, height, color, duration = 18) {
    this.lasers.push({
      startX: startX,
      targetX: targetX,
      y: yCenter,
      height: height,
      color: color,
      alpha: 1.0,
      life: duration,
      maxLife: duration,
      progress: 0.2
    });

    this.addWallSparks(targetX, yCenter, targetX > startX ? -1 : 1, color, 18);
  }

  // Laser Wall / Shield Impact Sparks
  addWallSparks(x, y, dir, color, count = 15) {
    for (let i = 0; i < count; i++) {
      const angle = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2;
      const speed = Math.random() * 6 + 2;
      this.particles.push({
        x: x,
        y: y + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 2,
        color: Math.random() > 0.4 ? '#FFFFFF' : color,
        alpha: 1,
        decay: Math.random() * 0.05 + 0.03,
        shape: 'circle'
      });
    }
  }

  // No-op for floating text to keep codebase clean and free of visual text popups
  addFloatingText(text, x, y, color = '#FFFFFF', size = 15) {
    // Intentionally no-op to eliminate ugly text popups per user request
  }

  update() {
    if (this.shakeDuration > 0) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeDuration--;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    // Energy Siphon Beads update
    for (let i = this.siphonBeads.length - 1; i >= 0; i--) {
      const b = this.siphonBeads[i];
      b.progress += b.speed;
      b.x = b.x + (b.targetX - b.x) * b.progress;
      b.y = b.y + (b.targetY - b.y) * b.progress;
      if (b.progress >= 1.0) {
        this.siphonBeads.splice(i, 1);
      }
    }

    // Slowdown rings update
    for (let i = this.slowdownRings.length - 1; i >= 0; i--) {
      const r = this.slowdownRings[i];
      r.radius += 1.8;
      r.alpha = Math.max(0, 1 - (r.radius / r.maxRadius));
      if (r.radius >= r.maxRadius || r.alpha <= 0) {
        this.slowdownRings.splice(i, 1);
      }
    }

    // Shields update
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      s.life--;
      s.alpha = Math.max(0, s.life / s.maxLife);
      if (s.life <= 0) {
        this.shields.splice(i, 1);
      }
    }

    // Laser beams update
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.life--;
      l.progress = Math.min(1.0, l.progress + 0.35);
      l.alpha = Math.max(0, l.life / l.maxLife);

      if (l.life > 6 && Math.random() < 0.8) {
        this.addWallSparks(l.targetX, l.y, l.targetX > l.startX ? -1 : 1, l.color, 4);
      }

      if (l.life <= 0) {
        this.lasers.splice(i, 1);
      }
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      p.size = Math.max(0.1, p.size * (p.shrink || 0.95));
      if (p.alpha <= 0 || p.size <= 0.2) {
        this.particles.splice(i, 1);
      }
    }

    // Shockwaves update
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += s.growth;
      s.alpha = Math.max(0, 1 - (s.radius / s.maxRadius));
      if (s.radius >= s.maxRadius || s.alpha <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  draw(ctx, canvasWidth) {
    ctx.save();

    // 1. Draw Lasers
    this.lasers.forEach(l => {
      ctx.save();
      const currentX = l.startX + (l.targetX - l.startX) * l.progress;
      const minX = Math.min(l.startX, currentX);
      const beamWidth = Math.abs(currentX - l.startX);
      const topY = l.y - l.height / 2;

      ctx.globalAlpha = l.alpha * 0.5;
      ctx.fillStyle = l.color;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 35;
      ctx.fillRect(minX, topY - 8, beamWidth, l.height + 16);

      ctx.globalAlpha = l.alpha * 0.85;
      ctx.fillStyle = l.color;
      ctx.shadowBlur = 18;
      ctx.fillRect(minX, topY, beamWidth, l.height);

      ctx.globalAlpha = l.alpha * 0.95;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 12;
      ctx.fillRect(minX, l.y - l.height * 0.2, beamWidth, l.height * 0.4);

      ctx.globalAlpha = l.alpha * 0.7;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const steps = 8;
      ctx.moveTo(l.startX, l.y);
      for (let s = 1; s <= steps; s++) {
        const segX = l.startX + (currentX - l.startX) * (s / steps);
        const segY = l.y + (Math.random() - 0.5) * (l.height * 0.7);
        ctx.lineTo(segX, segY);
      }
      ctx.stroke();

      ctx.globalAlpha = l.alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(l.startX, l.y, l.height * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(currentX, l.y, l.height * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = l.color;
      ctx.fill();

      ctx.restore();
    });

    // 2. Draw Energy Shields on Defending Paddle
    this.shields.forEach(s => {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 16, s.height / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.alpha * 0.35;
      ctx.fill();
      ctx.globalAlpha = s.alpha;
      ctx.stroke();

      ctx.restore();
    });

    // 3. Draw Energy Siphon Beaded Stream
    this.siphonBeads.forEach(b => {
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 4. Draw Slowdown Deceleration Rings
    this.slowdownRings.forEach(r => {
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // 5. Draw shockwaves
    this.shockwaves.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.alpha;
      ctx.lineWidth = s.lineWidth;
      ctx.stroke();
    });

    // 6. Draw particles
    this.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.alpha);
      if (p.shape === 'inkstamp' || p.shape === 'glowdot') {
        // 水墨拖尾：预渲染柔边墨点/光点 sprite，直接缩放贴图
        const spr = _psGetTrailSprite(p.color, p.shape === 'glowdot' ? 'glow' : 'ink');
        const d = p.size * (p.shape === 'glowdot' ? 3.0 : 2.4);
        ctx.drawImage(spr, p.x - d / 2, p.y - d / 2, d, d);
      } else if (p.shape === 'circle') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    });

    ctx.restore();
  }

  clear() {
    this.particles = [];
    this.shockwaves = [];
    this.lasers = [];
    this.shields = [];
    this.siphonBeads = [];
    this.slowdownRings = [];
    this.shakeDuration = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }
}

window.ParticleSystem = ParticleSystem;
