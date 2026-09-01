/**
 * UI Wiring, Event Listeners, and Game Lifecycle Controller
 */

// 构建标记：index.html 用来自检缓存版本是否一致
window.__APP_BUILD__ = '20260902a';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('pongCanvas');
  const game = new PongWarsGame(canvas, {
    squareSize: 25,
    theme: 'classic',
    mode: 'pve',
    timeLimit: 90
  });

  // DOM Elements
  const dayScoreEl = document.getElementById('dayScore');
  const nightScoreEl = document.getElementById('nightScore');
  const dayPercentEl = document.getElementById('dayPercent');
  const nightPercentEl = document.getElementById('nightPercent');
  const territoryBarDay = document.getElementById('territoryBarDay');
  const timerDisplay = document.getElementById('timerDisplay');
  const speedTierBadge = document.getElementById('speedTierBadge');
  
  const dayYouTag = document.getElementById('dayYouTag');
  const nightYouTag = document.getElementById('nightYouTag');
  const sideAnnouncement = document.getElementById('sideAnnouncement');
  const sideAnnouncementText = document.getElementById('sideAnnouncementText');

  const p1EnergyFill = document.getElementById('p1EnergyFill');
  const p2EnergyFill = document.getElementById('p2EnergyFill');
  const p1EnergyPct = document.getElementById('p1EnergyPct');
  const p2EnergyPct = document.getElementById('p2EnergyPct');

  const p1SkillBtn = document.getElementById('p1SkillBtn');
  const p2SkillBtn = document.getElementById('p2SkillBtn');
  const p1LaserBtn = document.getElementById('p1LaserBtn');
  const p2LaserBtn = document.getElementById('p2LaserBtn');
  const p1SkillBtnText = document.getElementById('p1SkillBtnText');
  const p2SkillBtnText = document.getElementById('p2SkillBtnText');
  const p1LaserBtnText = document.getElementById('p1LaserBtnText');
  const p2LaserBtnText = document.getElementById('p2LaserBtnText');
  const p1CDTag = document.getElementById('p1CDTag');
  const p2CDTag = document.getElementById('p2CDTag');
  const mobileControls = document.getElementById('mobileControls');

  // Modals & Panels
  const lanModal = document.getElementById('lanModal');
  const closeLanModalBtn = document.getElementById('closeLanModalBtn');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const joinCodeInput = document.getElementById('joinCodeInput');
  const lanHostInput = document.getElementById('lanHostInput');
  const lanHostBtn = document.getElementById('lanHostBtn');
  const lanHostRow = document.getElementById('lanHostRow');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const myRoomCode = document.getElementById('myRoomCode');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const lanStatus = document.getElementById('lanStatus');

  const gameOverModal = document.getElementById('gameOverModal');
  const winnerTitle = document.getElementById('winnerTitle');
  const winnerSub = document.getElementById('winnerSub');
  const restartBtn = document.getElementById('restartBtn');
  const modalRestartBtn = document.getElementById('modalRestartBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const pauseBtnText = document.getElementById('pauseBtnText');
  const soundBtn = document.getElementById('soundBtn');
  const soundIcon = document.getElementById('soundIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  const closeHelpModalIconBtn = document.getElementById('closeHelpModalIconBtn');
  const simSpeedSlider = document.getElementById('simSpeedSlider');
  const simSpeedGroup = document.getElementById('simSpeedGroup');
  const aiDiffGroup = document.getElementById('aiDiffGroup');
  const aiDiffSelect = document.getElementById('aiDiffSelect');
  const themeSelect = document.getElementById('themeSelect');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const timeLimitSelect = document.getElementById('timeLimitSelect');
  const gridSizeSelect = document.getElementById('gridSizeSelect');

  function applyMobileLayout() {
    if (!mobileControls) return;
    // 显示/隐藏完全交给 CSS（body.is-mobile + data-layout），这里只设置布局标识
    if (game.mode === 'sim') mobileControls.dataset.layout = 'sim';
    else if (game.mode === 'pvp') mobileControls.dataset.layout = 'pvp';
    else if (game.mode === 'lan') {
      mobileControls.dataset.layout = game.playerSide === 'night' ? 'lan-night' : 'lan-day';
    } else {
      mobileControls.dataset.layout = 'pve';
    }
    if (p1SkillBtnText) p1SkillBtnText.textContent = game.mode === 'pvp' ? 'P1 普技 (E)' : '普技';
    if (p1LaserBtnText) p1LaserBtnText.textContent = game.mode === 'pvp' ? 'P1 激光 (空格)' : '激光';
    if (p2SkillBtnText) p2SkillBtnText.textContent = game.mode === 'pvp' ? 'P2 普技 (Shift)' : '普技';
    if (p2LaserBtnText) p2LaserBtnText.textContent = game.mode === 'pvp' ? 'P2 激光 (回车)' : '激光';
  }

  async function loadLanHint() {
    const hint = document.getElementById('lanHint');
    if (!hint) return;
    if (game.network.shouldUseSecureSameOriginRelay()) {
      game.network.useSameOriginRelay();
      if (lanHostRow) lanHostRow.hidden = true;
      hint.textContent = `互联网联机已就绪：创建 4 位房间码发给朋友即可对战（优先加密中继，不可用时自动切换加密 P2P）。`;
      return;
    }
    if (lanHostRow) lanHostRow.hidden = false;
    try {
      const res = await fetch('/api/info', { cache: 'no-store' });
      if (!res.ok) throw new Error('no-api');
      const info = await res.json();
      hint.textContent = `电脑局域网地址：http://${info.ip}:${info.port}  （手机/APK 填 IP ${info.ip}）`;
      if (lanHostInput && !lanHostInput.value) lanHostInput.value = info.ip;
    } catch (_) {
      hint.textContent = '未检测到局域网服务。电脑先运行 node server.js，APK/手机填电脑 IP 再点连接电脑。';
    }
  }

  // Side Announcement Display
  function showSideAnnouncement(side) {
    const isDay = side === 'day';
    sideAnnouncementText.textContent = isDay
      ? '对决开始！你是【昼方 · 左侧挡板】（曜石黑球）'
      : '对决开始！你是【夜方 · 右侧挡板】（纯白光球）';
    sideAnnouncement.classList.add('show');

    if (dayYouTag) dayYouTag.classList.toggle('active', isDay);
    if (nightYouTag) nightYouTag.classList.toggle('active', !isDay);
    applyMobileLayout();

    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

    setTimeout(() => {
      sideAnnouncement.classList.remove('show');
    }, 2800);
  }

  // Network Callbacks
  game.network.onStatusChange = (status, msg) => {
    if (lanStatus) lanStatus.textContent = msg;
    updateRuleControls();
    if (status === 'connected') {
      setTimeout(() => {
        lanModal.classList.remove('show');
      }, 600);
    }
  };

  game.network.onSideAssigned = (side) => {
    timeLimitSelect.value = String(game.timeLimit);
    gridSizeSelect.value = String(game.squareSize);
    themeSelect.value = game.currentThemeKey;
    applyThemeCSS(game.currentThemeKey);
    updateRuleControls();
    showSideAnnouncement(side);
  };

  function rulesLocked() {
    return game.mode === 'lan' && game.network.isOnline;
  }

  function updateRuleControls() {
    const locked = rulesLocked();
    timeLimitSelect.disabled = locked;
    gridSizeSelect.disabled = locked;
    themeSelect.disabled = locked;
  }

  function requestPauseToggle() {
    const shouldPause = game.state !== 'paused';
    if (game.mode === 'lan' && game.network.isOnline) {
      game.network.requestPause(shouldPause);
    } else {
      game.setPaused(shouldPause);
    }
    updatePauseUI();
  }

  // Aggressive Web Audio Autoplay Unlock
  const unlockAudio = () => {
    game.sound.init();
    if (game.sound.ctx && game.sound.ctx.state === 'suspended') {
      game.sound.ctx.resume().then(() => {
        ['click', 'pointerdown', 'keydown', 'touchstart', 'mousemove', 'wheel'].forEach(evt => {
          window.removeEventListener(evt, unlockAudio);
        });
      }).catch(() => {});
    } else if (game.sound.ctx && game.sound.ctx.state === 'running') {
      ['click', 'pointerdown', 'keydown', 'touchstart', 'mousemove', 'wheel'].forEach(evt => {
        window.removeEventListener(evt, unlockAudio);
      });
    }
  };

  ['click', 'pointerdown', 'keydown', 'touchstart', 'mousemove', 'wheel'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });

  // Input Listeners
  // Capture-phase: Space/Enter must not click a focused button (that was restarting the match).
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);

    if (!typing && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
      e.preventDefault();
      if (tag === 'BUTTON' && e.target.blur) e.target.blur();
    }

    unlockAudio();
    game.keys[e.code] = true;
    if (e.key) game.keys[e.key] = true;

    if (e.code === 'KeyP' || e.code === 'Escape') {
      requestPauseToggle();
    } else if (e.code === 'KeyR') {
      if (game.mode !== 'lan') startNewGame();
    }
  }, true);

  document.querySelectorAll('button').forEach((btn) => {
    btn.setAttribute('type', 'button');
    btn.addEventListener('click', () => btn.blur());
  });

  window.addEventListener('keyup', (e) => {
    game.keys[e.code] = false;
    if (e.key) game.keys[e.key] = false;
  });

  // Touch / Mobile virtual controls
  let isTouching = false;
  canvas.addEventListener('touchstart', (e) => {
    unlockAudio();
    e.preventDefault();
    isTouching = true;
    handleTouchMove(e);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (isTouching) {
      e.preventDefault();
      handleTouchMove(e);
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    isTouching = false;
  });

  function handleTouchMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const scaleX = canvas.width / rect.width;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const tx = (touch.clientX - rect.left) * scaleX;
      const ty = (touch.clientY - rect.top) * scaleY;

      if (game.mode === 'lan') {
        // LAN Mode: Dragging anywhere moves YOUR assigned paddle!
        if (game.playerSide === 'day') {
          game.leftPaddle.y = Math.max(game.leftPaddle.height / 2, Math.min(canvas.height - game.leftPaddle.height / 2, ty));
          game.network.sendPaddleInput(game.leftPaddle.y, 0);
        } else {
          game.rightPaddle.y = Math.max(game.rightPaddle.height / 2, Math.min(canvas.height - game.rightPaddle.height / 2, ty));
          game.network.sendPaddleInput(game.rightPaddle.y, 0);
        }
      } else if (game.mode === 'pve') {
        // PVE: Player controls left paddle
        game.leftPaddle.y = Math.max(game.leftPaddle.height / 2, Math.min(canvas.height - game.leftPaddle.height / 2, ty));
      } else if (game.mode === 'pvp') {
        // PVP Local: Left half controls left, Right half controls right
        if (tx < canvas.width / 2) {
          game.leftPaddle.y = Math.max(game.leftPaddle.height / 2, Math.min(canvas.height - game.leftPaddle.height / 2, ty));
        } else {
          game.rightPaddle.y = Math.max(game.rightPaddle.height / 2, Math.min(canvas.height - game.rightPaddle.height / 2, ty));
        }
      }
    }
  }

  // Mouse Drag on Canvas
  let isMouseDown = false;
  canvas.addEventListener('mousedown', (e) => {
    unlockAudio();
    isMouseDown = true;
    handleMouseMove(e);
  });
  window.addEventListener('mousemove', (e) => {
    if (isMouseDown) handleMouseMove(e);
  });
  window.addEventListener('mouseup', () => {
    isMouseDown = false;
  });

  function handleMouseMove(e) {
    if (game.mode === 'sim') return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const ty = (e.clientY - rect.top) * scaleY;

    if (game.mode === 'lan') {
      if (game.playerSide === 'day') {
        game.leftPaddle.y = Math.max(game.leftPaddle.height / 2, Math.min(canvas.height - game.leftPaddle.height / 2, ty));
        game.network.sendPaddleInput(game.leftPaddle.y, 0);
      } else {
        game.rightPaddle.y = Math.max(game.rightPaddle.height / 2, Math.min(canvas.height - game.rightPaddle.height / 2, ty));
        game.network.sendPaddleInput(game.rightPaddle.y, 0);
      }
    } else {
      game.leftPaddle.y = Math.max(game.leftPaddle.height / 2, Math.min(canvas.height - game.leftPaddle.height / 2, ty));
    }
  }

  // Mobile Action Button Handlers
  if (p1SkillBtn) {
    p1SkillBtn.addEventListener('click', () => {
      unlockAudio();
      if (navigator.vibrate) navigator.vibrate(20);
      if (game.mode === 'lan' && game.playerSide === 'night') {
        game.activateEclipse();
      } else {
        game.activateSolarFlare();
      }
    });
  }
  if (p2SkillBtn) {
    p2SkillBtn.addEventListener('click', () => {
      unlockAudio();
      if (navigator.vibrate) navigator.vibrate(20);
      game.activateEclipse();
    });
  }
  if (p1LaserBtn) {
    p1LaserBtn.addEventListener('click', () => {
      unlockAudio();
      if (navigator.vibrate) navigator.vibrate(40);
      if (game.mode === 'lan' && game.playerSide === 'night') {
        game.activateLaser(false);
      } else {
        game.activateLaser(true);
      }
    });
  }
  if (p2LaserBtn) {
    p2LaserBtn.addEventListener('click', () => {
      unlockAudio();
      if (navigator.vibrate) navigator.vibrate(40);
      game.activateLaser(false);
    });
  }

  // Mode Selection
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudio();
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      cancelCountdown();
      game.setMode(mode);
      syncGameActive();

      if (mode === 'lan') {
        lanModal.classList.add('show');
        simSpeedGroup.style.display = 'none';
        aiDiffGroup.style.display = 'none';
        applyMobileLayout();
        loadLanHint();
      } else if (mode === 'sim') {
        simSpeedGroup.style.display = 'flex';
        aiDiffGroup.style.display = 'none';
        applyMobileLayout();
        startNewGame();
      } else if (mode === 'pve') {
        simSpeedGroup.style.display = 'none';
        aiDiffGroup.style.display = 'flex';
        if (dayYouTag) dayYouTag.classList.add('active');
        if (nightYouTag) nightYouTag.classList.remove('active');
        applyMobileLayout();
        tryEnterGameFullscreen();
        startNewGame();
      } else {
        simSpeedGroup.style.display = 'none';
        aiDiffGroup.style.display = 'none';
        if (dayYouTag) dayYouTag.classList.remove('active');
        if (nightYouTag) nightYouTag.classList.remove('active');
        applyMobileLayout();
        tryEnterGameFullscreen();
        startNewGame();
      }
    });
  });

  // LAN Modal Actions
  if (closeLanModalBtn) {
    closeLanModalBtn.addEventListener('click', () => {
      lanModal.classList.remove('show');
    });
  }

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
      unlockAudio();
      tryEnterGameFullscreen();
      createRoomBtn.disabled = true;
      lanStatus.textContent = '正在初始化房间...';
      game.network.createRoom(null, (err, code) => {
        createRoomBtn.disabled = false;
        if (!err) {
          myRoomCode.textContent = code;
          roomCodeDisplay.style.display = 'flex';
        }
      });
    });
  }

  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', () => {
      unlockAudio();
      tryEnterGameFullscreen();
      const code = joinCodeInput.value.trim();
      if (!/^\d{4}$/.test(code)) {
        lanStatus.textContent = '请输入正确的4位数字房间码！';
        return;
      }
      joinRoomBtn.disabled = true;
      game.network.joinRoom(code, (err) => {
        joinRoomBtn.disabled = false;
      });
    });
  }

  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      const code = myRoomCode.textContent;
      if (code && code !== '----') {
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) {
            throw new Error('clipboard-api-unavailable');
          }
          await navigator.clipboard.writeText(code);
          lanStatus.textContent = '房间码已复制到剪贴板！发给朋友即可对战。';
        } catch (_) {
          const input = document.createElement('textarea');
          input.value = code;
          input.setAttribute('readonly', '');
          input.style.position = 'fixed';
          input.style.opacity = '0';
          document.body.appendChild(input);
          input.select();
          const copied = typeof document.execCommand === 'function' &&
            document.execCommand('copy');
          input.remove();
          lanStatus.textContent = copied
            ? '房间码已复制到剪贴板！发给朋友即可对战。'
            : `无法自动复制，请手动复制房间码：${code}`;
        }
      }
    });
  }

  if (lanHostBtn) {
    lanHostBtn.addEventListener('click', async () => {
      unlockAudio();
      const host = lanHostInput ? lanHostInput.value.trim() : '';
      if (!host) {
        lanStatus.textContent = '请输入电脑的局域网 IP。';
        return;
      }
      if (!game.network.setRelayHost(host, 8080)) {
        lanStatus.textContent = 'IP 格式不正确。';
        return;
      }
      lanHostBtn.disabled = true;
      lanStatus.textContent = `正在连接 ${host}:8080 …`;
      const ok = await game.network._ensureWs();
      lanHostBtn.disabled = false;
      lanStatus.textContent = ok
        ? `已连上电脑 ${host}。请创建或加入房间。`
        : `连不上 ${host}:8080。请确认电脑已运行 node server.js，且手机与电脑同一 Wi-Fi。`;
    });
  }

  // AI Difficulty
  aiDiffSelect.addEventListener('change', (e) => {
    game.setAIDifficulty(e.target.value);
  });

  // Time Limit
  timeLimitSelect.addEventListener('change', (e) => {
    if (rulesLocked()) {
      e.target.value = String(game.timeLimit);
      return;
    }
    game.setTimeLimit(parseInt(e.target.value, 10));
  });

  // Grid Size
  gridSizeSelect.addEventListener('change', (e) => {
    if (rulesLocked()) {
      e.target.value = String(game.squareSize);
      return;
    }
    const size = parseInt(e.target.value, 10);
    if (game.setGridSize(size) && game.mode !== 'lan') startNewGame();
  });

  // Theme
  themeSelect.addEventListener('change', (e) => {
    if (rulesLocked()) {
      e.target.value = game.currentThemeKey;
      return;
    }
    game.setTheme(e.target.value);
    applyThemeCSS(e.target.value);
  });

  function applyThemeCSS(themeKey) {
    const t = THEMES[themeKey];
    if (t) {
      document.body.style.background = t.bg;
      territoryBarDay.style.backgroundColor = t.dayColor;
    }
  }

  // Simulation Speed
  simSpeedSlider.addEventListener('input', (e) => {
    game.simSpeed = parseFloat(e.target.value);
    document.getElementById('simSpeedVal').textContent = `${game.simSpeed.toFixed(1)}x`;
  });

  // Sound Controls
  soundBtn.addEventListener('click', () => {
    unlockAudio();
    const enabled = game.sound.toggleSound();
    if (enabled) {
      soundIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      `;
      soundBtn.title = '开启音效';
    } else {
      soundIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      `;
      soundBtn.title = '已静音';
    }
  });

  volumeSlider.addEventListener('input', (e) => {
    game.sound.setVolume(parseFloat(e.target.value));
  });

  // Help Modal
  helpBtn.addEventListener('click', () => helpModal.classList.add('show'));
  closeHelpBtn.addEventListener('click', () => {
    unlockAudio();
    helpModal.classList.remove('show');
  });
  if (closeHelpModalIconBtn) {
    closeHelpModalIconBtn.addEventListener('click', () => helpModal.classList.remove('show'));
  }
  window.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.remove('show');
    if (e.target === lanModal) lanModal.classList.remove('show');
  });

  // Pause UI
  function updatePauseUI() {
    pauseBtnText.textContent = game.state === 'paused' ? '继续 (P)' : '暂停 (P)';
    syncGameActive();
  }
  pauseBtn.addEventListener('click', () => {
    unlockAudio();
    requestPauseToggle();
  });

  function startNewGame() {
    gameOverModal.classList.remove('show');
    if (startOverlay) startOverlay.classList.remove('show');
    game.start();
    updatePauseUI();
    if (game.mode === 'pve') {
      if (dayYouTag) dayYouTag.classList.add('active');
      if (nightYouTag) nightYouTag.classList.remove('active');
    }
    applyMobileLayout();
  }

  function restartCurrentGame() {
    unlockAudio();
    if (game.mode === 'lan') {
      // 联机模式：通知对方并双方同时重开
      gameOverModal.classList.remove('show');
      if (startOverlay) startOverlay.classList.remove('show');
      tryEnterGameFullscreen();
      if (game.network && typeof game.network.sendRestartGame === 'function') {
        game.network.sendRestartGame();
      } else {
        startNewGame();
      }
      updatePauseUI();
      applyMobileLayout();
      return;
    }
    tryEnterGameFullscreen();
    startNewGame();
  }

  restartBtn.addEventListener('click', restartCurrentGame);
  modalRestartBtn.addEventListener('click', restartCurrentGame);

  // ====== 开局倒计时 / 移动端全屏横屏 / 挡板控制区 ======
  const startOverlay = document.getElementById('startOverlay');
  const startGameBtn = document.getElementById('startGameBtn');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownText = document.getElementById('countdownText');
  const paddleZone = document.getElementById('paddleZone');
  const exitFsBtn = document.getElementById('exitFsBtn');

  // ?mobiletest=1 可在桌面模拟移动端布局（调试用途）
  const forceMobile = new URLSearchParams(location.search).has('mobiletest');
  const isCoarsePointer = forceMobile || window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('is-mobile', isCoarsePointer);

  const landscapeMq = window.matchMedia('(orientation: landscape)');
  function syncOrientationClass() {
    document.body.classList.toggle('landscape-mode', landscapeMq.matches || forceMobile);
  }
  if (landscapeMq.addEventListener) landscapeMq.addEventListener('change', syncOrientationClass);
  else if (landscapeMq.addListener) landscapeMq.addListener(syncOrientationClass);
  window.addEventListener('resize', syncOrientationClass);
  syncOrientationClass();

  let countdownRunning = false;
  let countdownToken = 0;

  function syncGameActive() {
    const active = isCoarsePointer && game.mode !== 'sim' &&
      (game.state === 'running' || countdownRunning);
    document.body.classList.toggle('game-active', active);
  }

  function runCountdown(done) {
    const stepsText = ['3', '2', '1', '战'];
    let idx = 0;
    const myToken = ++countdownToken;
    countdownOverlay.classList.add('show');
    const tick = () => {
      if (myToken !== countdownToken) return;
      if (idx >= stepsText.length) {
        countdownOverlay.classList.remove('show');
        done();
        return;
      }
      countdownText.textContent = stepsText[idx];
      countdownText.classList.remove('pop');
      void countdownText.offsetWidth; // 重启动画
      countdownText.classList.add('pop');
      idx++;
      setTimeout(tick, idx >= stepsText.length ? 450 : 700);
    };
    tick();
  }

  function cancelCountdown() {
    countdownToken++;
    countdownRunning = false;
    if (countdownOverlay) countdownOverlay.classList.remove('show');
  }

  // 包装 game.start：先重置棋盘，再 3-2-1 倒计时，最后进入 running
  game.start = function () {
    game.sound.init();
    if (countdownRunning) return;
    if (startOverlay) startOverlay.classList.remove('show');
    if (gameOverModal) gameOverModal.classList.remove('show');
    countdownRunning = true;
    game.reset();
    syncGameActive();
    updatePauseUI();
    runCountdown(() => {
      game.state = 'running';
      countdownRunning = false;
      syncGameActive();
      updatePauseUI();
    });
  };

  async function tryEnterGameFullscreen() {
    if (!isCoarsePointer) return;
    try {
      const el = document.documentElement;
      const hasFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!hasFs) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
    } catch (_) {}
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (_) {}
    syncFsClass();
  }

  function exitGameFullscreen() {
    try {
      const hasFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (hasFs) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (_) {}
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
  }

  function syncFsClass() {
    document.body.classList.toggle('real-fs', !!(document.fullscreenElement || document.webkitFullscreenElement));
  }
  document.addEventListener('fullscreenchange', syncFsClass);
  document.addEventListener('webkitfullscreenchange', syncFsClass);

  if (exitFsBtn) {
    exitFsBtn.addEventListener('click', () => {
      unlockAudio();
      exitGameFullscreen();
      if (game.state === 'running') requestPauseToggle();
    });
  }

  if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      unlockAudio();
      tryEnterGameFullscreen();
      if (game.mode !== 'lan') startNewGame();
    });
  }

  // 挡板控制区：按住「上 / 下」按钮移动挡板（映射为键盘 W / S，全模式通用）
  const zoneUpBtn = document.getElementById('zoneUpBtn');
  const zoneDownBtn = document.getElementById('zoneDownBtn');

  function bindZoneHold(btn, keyCode) {
    if (!btn) return;
    const press = (e) => {
      unlockAudio();
      if (e && e.cancelable) e.preventDefault();
      game.keys[keyCode] = true;
      btn.classList.add('held');
    };
    const release = () => {
      game.keys[keyCode] = false;
      btn.classList.remove('held');
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindZoneHold(zoneUpBtn, 'KeyW');
  bindZoneHold(zoneDownBtn, 'KeyS');

  // ====== 渲染自检与兜底（防止棋盘空白且无提示） ======
  let renderErrorShown = false;
  let lastBlankCheck = 0;

  function showRenderError(msg) {
    if (renderErrorShown) return;
    renderErrorShown = true;
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:rgba(29,26,21,0.92);color:#F7F3EA;padding:10px 14px;border-radius:10px;font-size:12px;line-height:1.5;text-align:center;word-break:break-all;';
    banner.textContent = '棋盘渲染异常（已自动兜底），请截图反馈此信息：' + msg;
    document.body.appendChild(banner);
  }

  // 最简直绘：不依赖任何缓存层，保证领地/球至少可见
  function fallbackDraw() {
    const c = game.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, game.width, game.height);
    for (let i = 0; i < game.gridX; i++) {
      for (let j = 0; j < game.gridY; j++) {
        c.fillStyle = game.squares[i][j];
        c.fillRect(i * game.squareSize, j * game.squareSize, game.squareSize, game.squareSize);
      }
    }
    game.balls.forEach(b => {
      c.fillStyle = b.ballColor || '#141414';
      c.beginPath();
      c.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      c.fill();
    });
    c.restore();
  }

  function renderSelfCheck(currentTime) {
    if (currentTime - lastBlankCheck < 3000) return;
    lastBlankCheck = currentTime;
    try {
      // 1) 遮罩覆盖检查：游戏运行中不应有遮罩盖住棋盘，发现即自动移除
      if (game.state === 'running') {
        const rect = game.canvas.getBoundingClientRect();
        const cover = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const overlay = cover && cover.closest ? cover.closest('.start-overlay.show, .countdown-overlay.show') : null;
        if (overlay) {
          overlay.classList.remove('show');
          console.warn('[render] 移除了遮挡棋盘的遮罩:', overlay.id);
        }
      }
      // 2) 画布空白检查：中心点完全透明说明绘制失败，兜底直绘并提示
      if (game.state !== 'gameover' && game.canvas.width > 0) {
        const px = game.canvas.getContext('2d').getImageData(
          Math.floor(game.canvas.width / 2), Math.floor(game.canvas.height / 2), 1, 1).data;
        if (px[3] === 0) {
          fallbackDraw();
          showRenderError(`state=${game.state} canvas=${game.canvas.width}x${game.canvas.height} dpr=${window.devicePixelRatio} ua=${navigator.userAgent.slice(0, 90)}`);
        }
      }
    } catch (_) {}
  }

  // Main UI update loop
  let lastFrameTime = performance.now();

  function loop(currentTime) {
    const delta = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    try {
      game.update(delta);
      game.draw();
    } catch (err) {
      console.error('[render]', err);
      try { fallbackDraw(); } catch (_) {}
      showRenderError((err && err.message ? err.message : String(err)) + ` ua=${navigator.userAgent.slice(0, 90)}`);
    }
    renderSelfCheck(currentTime);
    updatePauseUI();
    updateRuleControls();

    // Update HUD Numbers
    const dayPct = ((game.dayScore / game.totalSquares) * 100).toFixed(1);
    const nightPct = ((game.nightScore / game.totalSquares) * 100).toFixed(1);

    dayScoreEl.textContent = game.dayScore;
    nightScoreEl.textContent = game.nightScore;
    dayPercentEl.textContent = `${dayPct}%`;
    nightPercentEl.textContent = `${nightPct}%`;
    territoryBarDay.style.width = `${dayPct}%`;

    // Speed Ratio & Penetration HUD
    const speedRatio = (0.5 + Math.min(1.0, game.elapsedSeconds / 75.0) * 1.0).toFixed(1);
    const penetration = speedRatio < 0.85 ? 1 : 2;
    speedTierBadge.textContent = `速度 ${speedRatio}x · 连破 ${penetration}格`;

    // Timer
    if (game.timeLimit > 0) {
      const mins = Math.floor(game.timeLeft / 60);
      const secs = (game.timeLeft % 60).toString().padStart(2, '0');
      timerDisplay.textContent = `${mins}:${secs}`;
    } else {
      timerDisplay.textContent = '∞';
    }

    // Normal Skill 5s Cooldowns
    if (game.p1SkillCD > 0) {
      const p1Sec = (game.p1SkillCD / 1000).toFixed(1);
      p1CDTag.textContent = `${p1Sec}s`;
      p1CDTag.classList.add('cooling');
      p1SkillBtn.disabled = true;
    } else {
      p1CDTag.textContent = 'READY';
      p1CDTag.classList.remove('cooling');
      p1SkillBtn.disabled = false;
    }

    if (game.p2SkillCD > 0) {
      const p2Sec = (game.p2SkillCD / 1000).toFixed(1);
      p2CDTag.textContent = `${p2Sec}s`;
      p2CDTag.classList.add('cooling');
      p2SkillBtn.disabled = true;
    } else {
      p2CDTag.textContent = 'READY';
      p2CDTag.classList.remove('cooling');
      p2SkillBtn.disabled = false;
    }

    // Energy Bars for 3-Row Laser Ultimate
    const p1E = Math.floor(game.leftPaddle.energy);
    const p2E = Math.floor(game.rightPaddle.energy);

    p1EnergyFill.style.width = `${p1E}%`;
    p2EnergyFill.style.width = `${p2E}%`;
    p1EnergyPct.textContent = `${p1E}%`;
    p2EnergyPct.textContent = `${p2E}%`;

    p1LaserBtn.disabled = p1E < 100;
    p1LaserBtn.classList.toggle('ready', p1E >= 100);

    p2LaserBtn.disabled = p2E < 100;
    p2LaserBtn.classList.toggle('ready', p2E >= 100);

    // Game Over Trigger
    if (game.state === 'gameover' && !gameOverModal.classList.contains('show')) {
      gameOverModal.classList.add('show');
      document.body.classList.remove('game-active');
      exitGameFullscreen();
      const dayWon = game.dayScore >= game.nightScore;
      winnerTitle.textContent = dayWon ? '昼方胜利 (Day Wins)' : '夜方胜利 (Night Wins)';
      winnerTitle.style.color = dayWon ? game.theme.dayAccent : game.theme.nightAccent;
      winnerSub.textContent = `最终领地占比：昼 ${dayPct}% vs 夜 ${nightPct}% (${game.dayScore} : ${game.nightScore})`;
    }

    requestAnimationFrame(loop);
  }

  // Initial Boot：只渲染静态棋盘背景，不自动开局（点击“开战”或切换模式后倒计时开始）
  applyThemeCSS('classic');
  applyMobileLayout();
  game.reset();
  window.game = game;
  requestAnimationFrame(loop);
});
