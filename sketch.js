// Dino Run - minimal p5.js implementation with placeholders
// Canvas size set per user preference (800x400)
const CANVAS_W = 800;
const CANVAS_H = 400;

// Game constants (tunable per PRD)
const INITIAL_SPEED = 3;
const SPEED_INCREMENT = 0.5;
const SPEED_INCREMENT_INTERVAL = 15; // points
const MAX_SPEED = 6.5;
const GRAVITY = 0.9;
const FAST_FALL_GRAVITY_BOOST = 0.65; // extra downward accel while holding ↓ during descent
const JUMP_POWER = 16;
const OBSTACLE_SPAWN_FRAMES = 90; // baseline spawn every 90 frames
const PLATFORM_EVENT = { minScore: 20, chancePerFrame: 0.005, durationFrames: 180 };
const PLATFORM_W = 220;
const JUMP_COYOTE_FRAMES = 12;
const HIGH_SCORE_STORAGE_KEY = 'dinoRunHighScore_v1';
const SFX_VOLUME = 0.48; // 0–1; hit, gameover, score
const SFX_JUMP_VOLUME = 0.20; // jump only (quieter than other SFX)
const CLOUD_SPAWN_CHANCE = 0.012;
const MAX_CLOUDS = 14;
const TITLE_CLOUD_DRIFT = 0.42;
const BGM_VOL = 0.14;
const BGM_FADE_OUT_SEC = 2;
const BGM_FADE_IN_SEC = 2;

let speed;
let score = 0;
let framesSinceLastScore = 0;
let frameCounter = 0;

// Game state
let gameState = 'title'; // 'title' | 'playing' | 'gameOver'
let isPaused = false;
let highScore = 0;
let platformEventActive = false;
let platformEventDurationRemaining = 0;
let bgmFadeOutStarted = false;
let bgmRestartAt = 0;

// Entities
let player;
let obstacles = [];
let groundY;
let groundOffset = 0;
let obstacleTimer = 0;
let clouds = [];
let gameFont = null;

// Assets (optional). If files are uploaded later, they will be used; otherwise placeholders.
let assets = {
  sky: null,
  groundFront: null,
  dinoFrames: [null, null, null, null, null, null],  // Ensure proper indexed loading
  cactusSmall: null,
  cactusLarge: null,
  pteroFrames: [null, null],
  cloudFrames: [null, null, null, null],
  platform: null,
  sfx: { jump: null, hit: null, score: null, gameover: null },
  bgm: null
};

function preload() {
  // Attempt to load named assets if present in the sketch folder; errors are ignored.
  // Replace filenames here if you upload assets to the p5 Web Editor.
  loadImageSafe('Sky_2.png', img => assets.sky = img);
  loadImageSafe('Desert_ground_5.png', img => assets.groundFront = img);

  // Attempt to load up to 6 dino frames from the BUILD/Dino folder
  for (let i = 0; i < 6; i++) {
    const name = `dino_${i}.png`;
    loadImageSafe(name, img => assets.dinoFrames[i] = img);
  }

  loadImageSafe('Cactus_2.png', img => {
    assets.cactusSmall = img;
    assets.cactusLarge = img;
  });
  loadImageSafe('Flying_Dino_2.png', img => assets.pteroFrames[0] = img);
  loadImageSafe('Flying_Dino_3.png', img => assets.pteroFrames[1] = img);
  for (let c = 1; c <= 4; c++) {
    loadImageSafe(`Cloud_${c}.png`, img => { assets.cloudFrames[c - 1] = img; });
  }
  // Platform is drawn as a long black rectangle placeholder if the image is not available.
  // loadImageSafe('platform.png', img => assets.platform = img);

  loadSoundSafe('Jump_Sound.mp3', s => { assets.sfx.jump = s; });
  loadSoundSafe('Game_Over_Sound.mp3', s => { assets.sfx.gameover = s; });
  loadSoundSafe('Background_Music_1.mp3', s => { assets.bgm = s; });
  loadFontSafe('Game-Font.ttf', f => { gameFont = f; });
}

function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  frameRate(60);
  groundY = height - 100; // Raise ground so entities visually sit on it
  loadHighScore();
  resetGame();
}

function resetGame() {
  speed = INITIAL_SPEED;
  score = 0;
  frameCounter = 0;
  framesSinceLastScore = 0;
  obstacles = [];
  obstacleTimer = 0;
  platformEventActive = false;
  platformEventDurationRemaining = 0;
  player = new Player(100, groundY);
  gameState = 'title';
  isPaused = false;
  stopBackgroundMusic();
  initClouds();
}

function loadHighScore() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    const n = raw == null ? 0 : parseInt(raw, 10);
    highScore = Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (e) {
    highScore = 0;
  }
}

function commitHighScoreIfBeat() {
  if (score <= highScore) return;
  highScore = score;
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(highScore));
  } catch (e) {}
}

function draw() {
  background(200, 230, 255);
  frameCounter++;

  // Draw sky (image if provided)
  if (assets.sky) image(assets.sky, 0, 0, width, height);

  const playingActive = gameState === 'playing' && !isPaused;
  const cloudTime = gameState !== 'gameOver' && !isPaused;
  const cloudBaseScroll = playingActive ? speed : (gameState === 'title' ? TITLE_CLOUD_DRIFT : 0);

  if (cloudTime && cloudsAnyLoaded()) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      clouds[i].update(cloudBaseScroll);
      if (clouds[i].offscreen()) clouds.splice(i, 1);
    }
    if (random() < CLOUD_SPAWN_CHANCE && clouds.length < MAX_CLOUDS) {
      clouds.push(new Cloud());
    }
  }
  for (let c of clouds) {
    c.display();
  }

  // Ground scrolling (frozen on title, game over, and pause)
  const scrollSpeed = playingActive ? speed : 0;
  groundOffset = (groundOffset - scrollSpeed) % width;

  // Scrolling ground layer
  if (assets.groundFront) {
    for (let x = groundOffset - width; x < width; x += width) {
      image(assets.groundFront, x, groundY, width, height - groundY);
    }
  } else {
    noStroke();
    fill(150, 100, 50);
    rect(0, groundY, width, height - groundY);
    fill(180, 140, 90);
    for (let x = 0; x < width; x += 40) {
      rect(x + 8, groundY + 10, 24, 12, 4);
    }
  }

  if (gameState === 'title') {
    player.update();
    player.display();
  } else if (gameState === 'playing') {
    if (playingActive) {
      syncPlatformLanding(player);
      player.update();

      obstacleTimer++;
      let spawnInterval = Math.max(20, Math.floor(OBSTACLE_SPAWN_FRAMES - speed * 6));
      if (obstacleTimer >= spawnInterval) {
        spawnObstacle();
        obstacleTimer = 0;
      }

      if (!platformEventActive && score >= PLATFORM_EVENT.minScore && random() < PLATFORM_EVENT.chancePerFrame) {
        spawnPlatformSequence();
      }

      if (platformEventActive) {
        platformEventDurationRemaining--;
        if (platformEventDurationRemaining <= 0) {
          platformEventActive = false;
        }
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        let o = obstacles[i];
        o.update();
        if (o.offscreen()) obstacles.splice(i, 1);
        else if (o.type !== 'platform' && checkCollision(player.getHitbox(), o.getHitbox())) {
          if (assets.sfx.hit) playSfx(assets.sfx.hit);
          commitHighScoreIfBeat();
          stopBackgroundMusic();
          gameState = 'gameOver';
          isPaused = false;
          player.frame = 5;
          playSfx(assets.sfx.gameover);
        }
      }

      framesSinceLastScore++;
      if (framesSinceLastScore >= 6) {
        score++;
        framesSinceLastScore = 0;
        if (assets.sfx.score && score % 100 === 0) playSfx(assets.sfx.score);
        if (score % SPEED_INCREMENT_INTERVAL === 0) {
          speed = Math.min(MAX_SPEED, speed + SPEED_INCREMENT);
        }
      }

      updateBackgroundMusic();
    }

    player.display();
    for (let o of obstacles) o.display();
  } else if (gameState === 'gameOver') {
    // show player and obstacles static
    player.display();
    for (let o of obstacles) o.display();
  }

  // HUD
  drawHUD();
}

function drawHUD() {
  push();
  textFont(gameFont || 'sans-serif');
  fill(0);
  textSize(20);
  textAlign(LEFT, TOP);
  if (gameState === 'playing') {
    fill(35);
    text('Press P for Pause', 12, 10);
  }

  textSize(22);
  textAlign(RIGHT, TOP);
  if (gameState === 'title') {
    fill(0);
    text(`Best: ${highScore}`, width - 16, 10);
  } else if (gameState === 'playing' || gameState === 'gameOver') {
    fill(0);
    text(`Score: ${score}`, width - 16, 10);
    text(`Best: ${highScore}`, width - 16, 38);
  }

  if (gameState === 'title') {
    textAlign(CENTER, CENTER);
    textSize(36);
    fill(40);
    text('Jump to start', width / 2, height / 2 - 10);
    textSize(22);
    fill(60);
    text('Space or Up Arrow', width / 2, height / 2 + 22);
  } else if (gameState === 'gameOver') {
    textAlign(CENTER, CENTER);
    textSize(60);
    fill(50);
    text('GAME OVER', width / 2, height / 2 - 28);
    textSize(28);
    text('Press Enter or Return to restart', width / 2, height / 2 + 22);
  }

  if (isPaused && gameState === 'playing') {
    drawPauseOverlay();
  }
  pop();
}

function drawPauseOverlay() {
  push();
  fill(0, 0, 0, 140);
  rect(0, 0, width, height);
  textAlign(CENTER, CENTER);
  textSize(72);
  fill(255);
  text('Paused', width / 2, height / 2 - 48);
  textSize(26);
  fill(230);
  text('Continue — press C', width / 2, height / 2 + 18);
  text('Restart — press Enter or Return', width / 2, height / 2 + 52);
  pop();
}

function keyPressed() {
  if (gameState === 'title') {
    if (key === ' ' || keyCode === UP_ARROW) {
      if (player.canJump()) {
        player.jump();
        gameState = 'playing';
        startBackgroundMusic();
      }
    }
  } else if (gameState === 'playing') {
    if (isPaused) {
      if (key === 'c' || key === 'C') {
        isPaused = false;
        resumeBackgroundMusic();
      } else if (keyCode === ENTER) {
        resetGame();
      }
      return;
    }
    if (key === 'p' || key === 'P') {
      isPaused = true;
      pauseBackgroundMusic();
      return;
    }
    if (key === ' ' || keyCode === UP_ARROW) player.jump();
    if (keyCode === DOWN_ARROW) player.duck(true);
    if (keyCode === LEFT_ARROW || key.toLowerCase() === 'a') {
      speed = Math.max(INITIAL_SPEED, speed - SPEED_INCREMENT);
    }
    if (keyCode === RIGHT_ARROW || key.toLowerCase() === 'd') {
      speed = Math.min(MAX_SPEED, speed + SPEED_INCREMENT);
    }
  } else if (gameState === 'gameOver') {
    if (keyCode === ENTER) resetGame();
  }
}

function keyReleased() {
  if (gameState === 'playing' && !isPaused && keyCode === DOWN_ARROW && player) player.duck(false);
}

// --- Utilities & Entity classes ---

function loadImageSafe(path, cb) {
  try {
    loadImage(path, img => cb(img), err => {/* ignore */});
  } catch (e) {}
}

function loadSoundSafe(path, cb) {
  try {
    loadSound(path, s => cb(s), err => {/* ignore */});
  } catch (e) {}
}

function loadFontSafe(path, cb) {
  try {
    loadFont(path, f => cb(f), () => cb(null));
  } catch (e) {
    cb(null);
  }
}

function playSfx(s, volume = SFX_VOLUME) {
  if (!s) return;
  try {
    if (typeof s.setVolume === 'function') s.setVolume(volume);
    s.play();
  } catch (e) {}
}

function bgmReady(bgm) {
  if (!bgm) return false;
  if (typeof bgm.isLoaded === 'function') return bgm.isLoaded();
  return true;
}

function stopBackgroundMusic() {
  bgmFadeOutStarted = false;
  bgmRestartAt = 0;
  const bgm = assets.bgm;
  if (!bgmReady(bgm)) return;
  bgm.stop();
  if (typeof bgm.setVolume === 'function') bgm.setVolume(BGM_VOL);
}

function startBackgroundMusic() {
  bgmFadeOutStarted = false;
  bgmRestartAt = 0;
  const bgm = assets.bgm;
  if (!bgmReady(bgm)) return;
  bgm.stop();
  if (typeof bgm.setVolume === 'function') bgm.setVolume(0);
  bgm.play();
  if (typeof bgm.setVolume === 'function') bgm.setVolume(BGM_VOL, BGM_FADE_IN_SEC);
}

function pauseBackgroundMusic() {
  const bgm = assets.bgm;
  if (!bgmReady(bgm)) return;
  try {
    if (typeof bgm.pause === 'function') bgm.pause();
    else bgm.stop();
  } catch (e) {}
}

function resumeBackgroundMusic() {
  const bgm = assets.bgm;
  if (!bgmReady(bgm)) return;
  try {
    if (typeof bgm.isPlaying === 'function' && bgm.isPlaying()) return;
    bgm.play();
    if (typeof bgm.setVolume === 'function') bgm.setVolume(BGM_VOL);
  } catch (e) {}
}

function updateBackgroundMusic() {
  const bgm = assets.bgm;
  if (!bgmReady(bgm)) return;

  if (bgmRestartAt > 0 && millis() >= bgmRestartAt) {
    bgm.stop();
    if (typeof bgm.setVolume === 'function') bgm.setVolume(0);
    bgm.play();
    if (typeof bgm.setVolume === 'function') bgm.setVolume(BGM_VOL, BGM_FADE_IN_SEC);
    bgmFadeOutStarted = false;
    bgmRestartAt = 0;
    return;
  }

  const dur = bgm.duration();
  const t = bgm.currentTime();
  if (dur <= BGM_FADE_OUT_SEC || bgmFadeOutStarted || !(dur > 0)) return;

  const playing = typeof bgm.isPlaying !== 'function' || bgm.isPlaying();
  if (!playing) return;

  if (dur - t <= BGM_FADE_OUT_SEC) {
    bgmFadeOutStarted = true;
    if (typeof bgm.setVolume === 'function') bgm.setVolume(0, BGM_FADE_OUT_SEC);
    bgmRestartAt = millis() + BGM_FADE_OUT_SEC * 1000;
  }
}

function cloudsAnyLoaded() {
  for (let i = 0; i < assets.cloudFrames.length; i++) {
    if (assets.cloudFrames[i]) return true;
  }
  return false;
}

function initClouds() {
  clouds = [];
  if (!cloudsAnyLoaded()) return;
  const n = 7;
  for (let i = 0; i < n; i++) {
    clouds.push(new Cloud(true));
  }
}

class Cloud {
  constructor(seeded = false) {
    this.variant = floor(random(4));
    this.w = random(46, 128);
    this.h = this.w * random(0.36, 0.64);
    const maxBottom = groundY - 100;
    const maxY = maxBottom - this.h;
    const minY = 12;
    this.y = maxY >= minY ? random(minY, maxY) : minY;
    this.parallax = random(0.2, 0.62);
    if (seeded) {
      this.x = random(-this.w - 60, width + 100);
    } else {
      this.x = width + random(8, 160);
    }
  }

  update(baseScroll) {
    this.x -= baseScroll * this.parallax;
  }

  display() {
    const img = assets.cloudFrames[this.variant];
    if (!img) return;
    image(img, this.x, this.y, this.w, this.h);
  }

  offscreen() {
    return this.x + this.w < -50;
  }
}

/** Sets player.supportY / snap from platforms before gravity (must run before Player.update while playing). */
function syncPlatformLanding(player) {
  player.supportY = player.groundY;
  for (let o of obstacles) {
    if (o.type !== 'platform') continue;
    let pHitbox = o.getHitbox();
    let dHitbox = player.getHitbox();
    if (!(dHitbox.x < pHitbox.x + pHitbox.w && dHitbox.x + dHitbox.w > pHitbox.x)) continue;
    if (player.vy >= 0 && dHitbox.y + dHitbox.h >= pHitbox.y && dHitbox.y < pHitbox.y + pHitbox.h) {
      player.supportY = o.y;
      player.y = o.y - player.h;
      player.vy = 0;
    }
  }
}

class Player {
  constructor(x, groundY) {
    this.x = x;
    this.groundY = groundY;
    this.w = 44;
    this.h = 44;
    this.y = groundY - this.h;
    this.vy = 0;
    this.isDucking = false;
    this.supportY = groundY;
    this.frame = 0;
    this.coyoteFrames = 0;
  }

  canJump() {
    return this.onGround() || this.coyoteFrames > 0;
  }

  jump() {
    if (!this.canJump()) return;
    this.vy = -JUMP_POWER;
    this.coyoteFrames = 0;
    playSfx(assets.sfx.jump, SFX_JUMP_VOLUME);
  }

  duck(state) {
    this.isDucking = state;
    if (state) this.h = 28; else this.h = 44;
  }

  onGround() {
    return this.y >= this.supportY - this.h - 0.5;
  }

  update() {
    // During play, syncPlatformLanding() sets supportY before update (platform or sand).
    if (gameState !== 'playing') this.supportY = this.groundY;
    this.vy += GRAVITY;
    if (gameState === 'playing' && !this.onGround() && keyIsDown(DOWN_ARROW) && this.vy > 0) {
      this.vy += FAST_FALL_GRAVITY_BOOST;
    }
    this.y += this.vy;
    if (this.y > this.supportY - this.h) {
      this.y = this.supportY - this.h;
      this.vy = 0;
    }
    if (this.onGround()) this.coyoteFrames = JUMP_COYOTE_FRAMES;
    else if (this.coyoteFrames > 0) this.coyoteFrames--;
    // Select animation frame based on state
    let animFrame = 0;
    if (gameState === 'gameOver') {
      // Frame 5: death pose
      animFrame = 5;
    } else if (!this.onGround()) {
      // Frame 0: idle/jump pose (in the air)
      animFrame = 0;
    } else if (gameState === 'title') {
      // Idle on ground before run starts
      animFrame = 0;
    } else if (this.isDucking) {
      // Frames 3-4: crouch running animation
      animFrame = 3 + Math.floor((frameCount / 6) % 2);
    } else {
      // Frames 1-2: running animation
      animFrame = 1 + Math.floor((frameCount / 6) % 2);
    }
    this.frame = animFrame;
  }

  display() {
    if (assets.dinoFrames[this.frame]) {
      // use frame if available
      let img = assets.dinoFrames[this.frame];
      image(img, this.x, this.y, this.w, this.h);
    } else {
      // placeholder
      fill(30);
      rect(this.x, this.y, this.w, this.h, 6);
      if (this.isDucking) {
        fill(20);
        rect(this.x, this.y + this.h - 12, this.w, 12, 4);
      }
    }
  }

  getHitbox() {
    return { x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 6 };
  }
}

class Obstacle {
  constructor(type = 'small') {
    this.type = type;
    this.x = width + 20;
    this.passed = false;
    if (type === 'small') { this.w = 22; this.h = 40; this.y = groundY - this.h; }
    else if (type === 'large') { this.w = 34; this.h = 60; this.y = groundY - this.h; }
    else if (type === 'ptero') { this.w = 46; this.h = 34; this.y = groundY - 60; }  // Lower so ducking is required
    else if (type === 'platform') { this.w = PLATFORM_W; this.h = 20; this.y = groundY - 90; } // Clear cacti while staying jumpable
  }

  update() {
    this.x -= speed;
  }

  display() {
    if (this.type === 'small' && assets.cactusSmall) image(assets.cactusSmall, this.x, this.y, this.w, this.h);
    else if (this.type === 'large' && assets.cactusLarge) image(assets.cactusLarge, this.x, this.y, this.w, this.h);
    else if (this.type === 'ptero' && (assets.pteroFrames[0] || assets.pteroFrames[1])) {
      const wingFreeze = isPaused || gameState === 'gameOver';
      const wingFrame = wingFreeze ? 0 : Math.floor(frameCount / 8) % 2;
      const pteroImg = assets.pteroFrames[wingFrame] || assets.pteroFrames[0] || assets.pteroFrames[1];
      image(pteroImg, this.x, this.y, this.w, this.h);
    }
    else if (this.type === 'platform' && assets.platform) image(assets.platform, this.x, this.y, this.w, this.h);
    else {
      // placeholder
      push();
      noStroke();
      if (this.type === 'ptero') {
        fill(120, 30, 30);
        rect(this.x, this.y, this.w, this.h, 6);
        fill(200, 80, 80);
        triangle(this.x + 4, this.y + this.h / 2, this.x + this.w - 4, this.y + 4, this.x + this.w - 4, this.y + this.h - 4);
      } else if (this.type === 'platform') {
        fill(120, 90, 60);
        rect(this.x, this.y, this.w, this.h, 6);
        fill(180, 150, 110);
        rect(this.x + 8, this.y + 4, this.w - 16, 6, 3);
      } else {
        fill(20, 150, 20);
        rect(this.x, this.y, this.w, this.h, 4);
      }
      pop();
    }
  }

  offscreen() {
    return this.x + this.w < -50;
  }

  getHitbox() {
    if (this.type === 'small') {
      return { x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 10 };
    }
    if (this.type === 'large') {
      return { x: this.x + 8, y: this.y + 6, w: this.w - 16, h: this.h - 10 };
    }
    return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 4 };
  }
}

function spawnObstacle() {
  const r = random();
  // During platform event, disable flying enemies (ptero) for fairness
  if (platformEventActive) {
    if (r < 0.4) obstacles.push(new Obstacle('small'));
    else obstacles.push(new Obstacle('large'));
  } else {
    if (r < 0.1) obstacles.push(new Obstacle('ptero'));
    else if (r < 0.5) obstacles.push(new Obstacle('small'));
    else obstacles.push(new Obstacle('large'));
  }
}

function spawnPlatformSequence() {
  // spawn a single platform and activate event
  obstacles.push(new Obstacle('platform'));
  platformEventActive = true;
  platformEventDurationRemaining = PLATFORM_EVENT.durationFrames;
}

function checkCollision(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
