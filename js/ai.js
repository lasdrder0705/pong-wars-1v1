/**
 * 昼夜领地对战 V1.0 AI Opponent Logic
 */
class AIController {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty; // 'easy', 'medium', 'hard', 'demon'
    this.targetY = 300;
    this.reactionTimer = 0;
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  // Find the primary threat ball heading towards this paddle
  findThreatBall(balls, paddle, isRightSide) {
    const relevantBalls = balls.filter(b => isRightSide ? b.dx > 0 : b.dx < 0);
    if (relevantBalls.length === 0) {
      return balls.reduce((closest, b) => {
        const dist = Math.abs(b.x - paddle.x);
        return (!closest || dist < Math.abs(closest.x - paddle.x)) ? b : closest;
      }, null);
    }

    return relevantBalls.reduce((urgent, b) => {
      const dist = Math.abs(b.x - paddle.x);
      const timeToArrive = dist / Math.max(0.1, Math.abs(b.dx));
      if (!urgent) return b;
      const urgentDist = Math.abs(urgent.x - paddle.x);
      const urgentTime = urgentDist / Math.max(0.1, Math.abs(urgent.dx));
      return timeToArrive < urgentTime ? b : urgent;
    }, null);
  }

  // Predict ball intercept Y coordinate
  predictBallLanding(ball, targetX, canvasHeight) {
    if (!ball) return canvasHeight / 2;
    let simX = ball.x;
    let simY = ball.y;
    let simDx = ball.dx;
    let simDy = ball.dy;

    const maxSteps = 140;
    let step = 0;

    while (step < maxSteps) {
      if ((simDx > 0 && simX >= targetX) || (simDx < 0 && simX <= targetX)) {
        break;
      }
      simX += simDx;
      simY += simDy;

      if (simY <= 15) {
        simY = 15;
        simDy = -simDy;
      } else if (simY >= canvasHeight - 15) {
        simY = canvasHeight - 15;
        simDy = -simDy;
      }
      step++;
    }
    return simY;
  }

  update(paddle, balls, canvasHeight, isRightSide, gameState) {
    const config = {
      easy: { speed: 4.0, delayFrames: 18, errorMargin: 40 },
      medium: { speed: 6.0, delayFrames: 10, errorMargin: 18 },
      hard: { speed: 8.0, delayFrames: 4, errorMargin: 6 },
      demon: { speed: 11.0, delayFrames: 0, errorMargin: 0 }
    }[this.difficulty] || { speed: 6.0, delayFrames: 10, errorMargin: 18 };

    this.reactionTimer++;
    if (this.reactionTimer >= config.delayFrames) {
      this.reactionTimer = 0;
      const threatBall = this.findThreatBall(balls, paddle, isRightSide);

      if (threatBall) {
        if (this.difficulty === 'easy') {
          this.targetY = threatBall.y + (Math.random() - 0.5) * config.errorMargin;
        } else {
          const predictedY = this.predictBallLanding(threatBall, paddle.x, canvasHeight);
          const strategicOffset = (Math.sin(Date.now() / 1000) * 12);
          this.targetY = predictedY + (Math.random() - 0.5) * config.errorMargin + strategicOffset;
        }
      } else {
        this.targetY = canvasHeight / 2;
      }
    }

    // Move paddle towards targetY
    const distY = this.targetY - paddle.y;
    if (Math.abs(distY) > 3) {
      const moveStep = Math.min(config.speed, Math.abs(distY)) * Math.sign(distY);
      paddle.y += moveStep;
      paddle.vy = moveStep;
    } else {
      paddle.vy = 0;
    }

    paddle.y = Math.max(paddle.height / 2, Math.min(canvasHeight - paddle.height / 2, paddle.y));

    // AI Normal Skill (Eclipse) - Cast whenever off 5s CD
    if (gameState.p2SkillCD <= 0) {
      if (Math.random() < 0.05) {
        gameState.activateEclipse();
      }
    }

    // AI Ultimate Skill (Laser Beam) - Cast when 100% charged
    if (paddle.energy >= 100) {
      if (Math.random() < 0.08) {
        gameState.activateLaser(false);
      }
    }
  }
}

window.AIController = AIController;
