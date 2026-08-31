/**
 * 昼夜领地对战 V1.0 Physics and Collision Engine
 */
class PhysicsEngine {
  constructor(gridWidth, gridHeight, squareSize) {
    this.numSquaresX = gridWidth;
    this.numSquaresY = gridHeight;
    this.squareSize = squareSize;
  }

  // Create initial grid (Day on left half, Night on right half)
  createGrid(dayColor, nightColor) {
    const squares = [];
    for (let i = 0; i < this.numSquaresX; i++) {
      squares[i] = [];
      for (let j = 0; j < this.numSquaresY; j++) {
        squares[i][j] = i < this.numSquaresX / 2 ? dayColor : nightColor;
      }
    }
    return squares;
  }

  // Create empty stone fortification grid
  createStoneGrid() {
    const grid = [];
    for (let i = 0; i < this.numSquaresX; i++) {
      grid[i] = [];
      for (let j = 0; j < this.numSquaresY; j++) {
        grid[i][j] = null;
      }
    }
    return grid;
  }

  // Check ball vs grid squares collision with stone fortification and penetration logic
  checkSquareCollision(ball, squares, stoneGrid, dayColor, nightColor, onFlipBlock, onStoneHit) {
    let flippedCount = 0;
    const radius = this.squareSize / 2;
    const checkAngles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];

    if (ball.remainingPenetration === undefined) {
      ball.remainingPenetration = ball.penetrationCapacity || 1;
    }

    for (let angle of checkAngles) {
      const checkX = ball.x + Math.cos(angle) * radius;
      const checkY = ball.y + Math.sin(angle) * radius;

      const i = Math.floor(checkX / this.squareSize);
      const j = Math.floor(checkY / this.squareSize);

      if (i >= 0 && i < this.numSquaresX && j >= 0 && j < this.numSquaresY) {
        // If the square belongs to the enemy side
        if (squares[i][j] !== ball.reverseColor) {
          const oldColor = squares[i][j];
          const stone = stoneGrid && stoneGrid[i] ? stoneGrid[i][j] : null;

          // Case A: Enemy has petrified / fortified this block!
          if (stone && stone.owner !== ball.team) {
            // High speed mode (penetrationCapacity >= 3): 1-hit shatter stone but consume all penetration for this bounce
            if (ball.penetrationCapacity >= 3) {
              stoneGrid[i][j] = null;
              squares[i][j] = ball.reverseColor;
              flippedCount++;

              if (onStoneHit) onStoneHit(i, j, true);
              if (onFlipBlock) onFlipBlock(i, j, ball, oldColor);

              // Consume full penetration: this hit only breaks 1 stone block and bounces immediately!
              ball.remainingPenetration = 0;
            } else {
              // Low / Normal speed mode: Requires 2 hits to break
              stone.hp -= 1;
              if (stone.hp <= 0) {
                // Stone shattered on second hit
                stoneGrid[i][j] = null;
                squares[i][j] = ball.reverseColor;
                flippedCount++;

                if (onStoneHit) onStoneHit(i, j, true);
                if (onFlipBlock) onFlipBlock(i, j, ball, oldColor);
              } else {
                // Stone damaged / cracked (1 HP remaining), territory NOT flipped
                if (onStoneHit) onStoneHit(i, j, false);
              }
              // Force bounce on stone impact
              ball.remainingPenetration = 0;
            }

            // Perform bounce
            if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
              ball.dx = -ball.dx;
            } else {
              ball.dy = -ball.dy;
            }
            ball.remainingPenetration = ball.penetrationCapacity || 1;
            break;
          }

          // Case B: Normal Square Hit
          squares[i][j] = ball.reverseColor;
          flippedCount++;

          if (onFlipBlock) {
            onFlipBlock(i, j, ball, oldColor);
          }

          ball.remainingPenetration--;

          // Bounce if remaining penetration exhausted
          if (ball.remainingPenetration <= 0) {
            if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
              ball.dx = -ball.dx;
            } else {
              ball.dy = -ball.dy;
            }
            ball.remainingPenetration = ball.penetrationCapacity || 1;
            break;
          }
        }
      }
    }
    return flippedCount;
  }

  // Boundary collision (Walls) - Walls strictly do NOT touch energy or trigger miss penalties
  checkBoundaryCollision(ball, width, height) {
    const radius = this.squareSize / 2;

    if (ball.y - radius <= 0) {
      ball.y = radius;
      ball.dy = Math.abs(ball.dy);
      ball.remainingPenetration = ball.penetrationCapacity || 1;
    } else if (ball.y + radius >= height) {
      ball.y = height - radius;
      ball.dy = -Math.abs(ball.dy);
      ball.remainingPenetration = ball.penetrationCapacity || 1;
    }

    if (ball.x - radius <= 0) {
      ball.x = radius;
      ball.dx = Math.abs(ball.dx);
      ball.remainingPenetration = ball.penetrationCapacity || 1;
    } else if (ball.x + radius >= width) {
      ball.x = width - radius;
      ball.dx = -Math.abs(ball.dx);
      ball.remainingPenetration = ball.penetrationCapacity || 1;
    }
  }

  // Paddle Collision Detection with Energy Siphon & Ball Slowdown
  checkPaddleCollision(ball, paddle, enemyPaddle, isLeftPaddle, onHit) {
    const radius = this.squareSize / 2;
    const px = paddle.x;
    const py = paddle.y;
    const pw = paddle.width;
    const ph = paddle.height;

    const nearestX = Math.max(px - pw / 2, Math.min(ball.x, px + pw / 2));
    const nearestY = Math.max(py - ph / 2, Math.min(ball.y, py + ph / 2));

    const distX = ball.x - nearestX;
    const distY = ball.y - nearestY;
    const distSq = distX * distX + distY * distY;

    if (distSq < radius * radius) {
      // 1. Directional reposition
      if (isLeftPaddle && ball.dx < 0) {
        ball.dx = Math.abs(ball.dx);
        ball.x = px + pw / 2 + radius + 1;
      } else if (!isLeftPaddle && ball.dx > 0) {
        ball.dx = -Math.abs(ball.dx);
        ball.x = px - pw / 2 - radius - 1;
      }

      // 2. Deflection angle
      const offset = (ball.y - py) / (ph / 2); // -1 to 1
      const maxAngle = Math.PI / 3;
      const angle = offset * maxAngle;

      // 3. Energy Siphon & Slowdown Penalty:
      // ONLY when intercepting the OPPONENT'S ball: drain opponent's energy, recharge self, and slow down the ball!
      const isOpponentBall = (isLeftPaddle && ball.team === 'night') || (!isLeftPaddle && ball.team === 'day');

      if (isOpponentBall) {
        paddle.energy = Math.min(100, paddle.energy + 6.0);
        if (enemyPaddle) {
          enemyPaddle.energy = Math.max(0, enemyPaddle.energy - 4.0);
        }

        // Slow down ball speed by 25% (down to minimum 0.5x base speed)
        const currentSpeed = Math.hypot(ball.dx, ball.dy);
        const newSpeed = Math.max(3.2, currentSpeed * 0.75);

        ball.dx = (isLeftPaddle ? 1 : -1) * Math.cos(angle) * newSpeed;
        ball.dy = Math.sin(angle) * newSpeed + (paddle.vy || 0) * 0.2;

        const speedRatio = newSpeed / 6.4;
        ball.penetrationCapacity = speedRatio < 0.85 ? 1 : (speedRatio < 1.25 ? 2 : 3);
        ball.remainingPenetration = ball.penetrationCapacity;
      } else {
        // Own ball: Normal deflect at current speed
        const currentSpeed = Math.hypot(ball.dx, ball.dy);
        ball.dx = (isLeftPaddle ? 1 : -1) * Math.cos(angle) * currentSpeed;
        ball.dy = Math.sin(angle) * currentSpeed + (paddle.vy || 0) * 0.2;
      }

      if (onHit) onHit(paddle, enemyPaddle, ball, isOpponentBall);
      return true;
    }
    return false;
  }

  // Small random perturbation
  applyRandomness(ball, minSpeed = 2.4, maxSpeed = 11.2) {
    ball.dx += (Math.random() * 0.03 - 0.015);
    ball.dy += (Math.random() * 0.03 - 0.015);

    const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    if (speed > maxSpeed) {
      const factor = maxSpeed / speed;
      ball.dx *= factor;
      ball.dy *= factor;
    } else if (speed < minSpeed) {
      const factor = minSpeed / (speed || 1);
      ball.dx *= factor;
      ball.dy *= factor;
    }

    if (Math.abs(ball.dx) < 0.96) ball.dx = ball.dx >= 0 ? 1.2 : -1.2;
    if (Math.abs(ball.dy) < 0.96) ball.dy = ball.dy >= 0 ? 1.2 : -1.2;
  }
}

window.PhysicsEngine = PhysicsEngine;
