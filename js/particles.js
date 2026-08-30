/**
 * Particle and Visual Effects System for Pong Wars 1v1
 * Pure visual particle effects without text clutter
 */
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

  // Trigger screen shake
  shake(duration = 10, intensity = 6) {
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
  addBallTrail(x, y, ballColor, size, isHighSpeed = false) {
    const isDarkBall = ballColor === '#141414' || ballColor === '#121212' || ballColor === '#1D1D1F' || ballColor === '#172B36' || ballColor === '#114C5A';
    const trailColor = isDarkBall ? '#2D3748' : '#F7FAFC';

    this.particles.push({
      x: x + (Math.random() * 2.5 - 1.25),
      y: y + (Math.random() * 2.5 - 1.25),
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: size * (isHighSpeed ? 0.75 : 0.5),
      color: trailColor,
      alpha: isHighSpeed ? 0.7 : 0.4,
      decay: isHighSpeed ? 0.05 : 0.04,
      shape: 'circle'
    });
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
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
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
      p.size = Math.max(0.1, p.size * 0.95);
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
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
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
