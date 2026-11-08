'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Forma de asteroide grande trazada de la imagen (coords normalizadas, radio máx ≈ 1)
const BIG_SHAPE = [
  [-0.05, -1.00], [ 0.53, -0.82], [ 0.41, -0.21], [ 0.99, -0.04], [ 0.82,  0.60],
  [ 0.31,  0.58], [ 0.07,  0.99], [-0.64,  0.64], [-0.97,  0.04], [-0.82, -0.59],
];
const BIG_SHAPE_CHANCE = 0.3; // probabilidad de que un asteroide grande use esta forma

// ── Power-up: Disparo Triple ──────────────────────────────────────────────────
const GLOW_CHANCE     = 0.15; // prob. de que un asteroide grande brille
const TRIPLE_DURATION = 8;    // s de duración del power-up
const TRIPLE_SPREAD   = 0.22; // rad entre balas del abanico
const POWERUP_TTL     = 8;    // s que el ítem permanece en pantalla
const MAGNET_DIST     = 45;   // px: distancia a la que la nave absorbe el ítem
const MAGNET_SPEED    = 900;  // px/s a los que el ítem vuela hacia la nave

// ── Power-up: Escudo Temporal ─────────────────────────────────────────────────
const SHIELD_DURATION = 8.3;   // s de duración del escudo
const SHIELD_HITS     = 3;    // impactos que absorbe

// ── Power-up: Cámara Lenta ────────────────────────────────────────────────────
const SLOW_DURATION   = 6;     // s de duración
const SLOW_FACTOR     = 0.5;   // los asteroides van a la mitad de velocidad

// ── Power-up: Hiperpropulsión ─────────────────────────────────────────────────
const HYPER_DURATION  = 8;     // s de duración
const HYPER_THRUST    = 560;   // px/s² (normal: 260)
const HYPER_MAX_SPEED = 650;   // px/s, tope de velocidad con hiperpropulsión
const POWER_TYPES     = ['triple', 'shield', 'slow', 'hyper'];
const POWER_COLORS    = { triple: '#4ff', shield: '#fc3', slow: '#c6f', nova: '#f55', hyper: '#6f6' };

// ── Power-up: Bomba Nova (ítem escaso, un solo uso, se activa con N) ──────────
const NOVA_CHANCE     = 0.12;  // prob. de que un asteroide brillante lleve Nova
const NOVA_FX_TIME    = 0.6;   // s de duración del destello
let novaFx = null;             // { x, y, t } efecto visual activo
const randPower = () => POWER_TYPES[randInt(0, POWER_TYPES.length - 1)];
const astDt = dt => (ship && ship.slowTimer > 0 ? dt * SLOW_FACTOR : dt);

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;
    this.glowing = size === 3 && Math.random() < GLOW_CHANCE;
    this.power   = randPower(); // color/habilidad aleatoria si brilla

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    this.verts = [];
    if (size === 3 && Math.random() < BIG_SHAPE_CHANCE) {
      // Variante fija (basada en imagen): muesca a la derecha
      for (const [px, py] of BIG_SHAPE)
        this.verts.push([px * this.radius, py * this.radius]);
    } else {
      // Polígono irregular
      const n = randInt(8, 13);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    const gc = POWER_COLORS[this.power];
    ctx.strokeStyle = this.glowing ? gc : '#fff';
    if (this.glowing) {
      ctx.shadowColor = gc;
      ctx.shadowBlur  = 8 + 6 * Math.sin(performance.now() / 150);
    }
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── PowerUp (ítem flotante) ───────────────────────────────────────────────────
class PowerUp {
  constructor(x, y, type = 'triple') {
    this.x = x;
    this.y = y;
    this.type = type;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(10, 30);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.ttl = POWERUP_TTL;
    this.radius = 10;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo durante los últimos 2 s
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const c = POWER_COLORS[this.type];
    ctx.strokeStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur  = 10;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    if (this.type === 'nova') {
      // Estrella de 8 rayos
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
        ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      }
    } else if (this.type === 'hyper') {
      // Doble chevron hacia arriba
      for (const o of [-3, 3]) {
        ctx.moveTo(-5, o + 4); ctx.lineTo(0, o - 2); ctx.lineTo(5, o + 4);
      }
    } else if (this.type === 'slow') {
      // Reloj de arena
      ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(-5, 6); ctx.lineTo(5, 6);
      ctx.closePath();
    } else if (this.type === 'shield') {
      // Escudo estilizado
      ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.lineTo(5, 1);
      ctx.quadraticCurveTo(5, 6, 0, 8); ctx.quadraticCurveTo(-5, 6, -5, 1);
      ctx.closePath();
    } else {
      // Tres líneas en abanico
      for (const a of [-0.5, 0, 0.5]) {
        const ang = -Math.PI / 2 + a;
        ctx.moveTo(0, 5);
        ctx.lineTo(Math.cos(ang) * 6, 5 + Math.sin(ang) * 10);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.tripleTimer   = 0;
    this.slowTimer     = 0;
    this.hyperTimer    = 0;
    this.shieldTimer   = 0;
    this.shieldHits    = 0;
    this.shieldCooldown = 0;
    this.novaReady     = false;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleTimer   > 0) this.tripleTimer   -= dt;
    if (this.slowTimer     > 0) this.slowTimer     -= dt;
    if (this.hyperTimer    > 0) this.hyperTimer    -= dt;
    if (this.shieldCooldown > 0) this.shieldCooldown -= dt;
    if (this.shieldTimer   > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) this.shieldHits = 0;
    }

    const ROT   = 3.5;   // rad/s
    const hyper  = this.hyperTimer > 0;
    const THRUST = hyper ? HYPER_THRUST : 260;  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    if (hyper) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > HYPER_MAX_SPEED) {
        this.vx *= HYPER_MAX_SPEED / sp;
        this.vy *= HYPER_MAX_SPEED / sp;
      }
    }
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleTimer > 0) {
      return [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD].map(d => new Bullet(ox, oy, this.angle + d));
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  hasShield() { return this.shieldTimer > 0 && this.shieldHits > 0; }

  drawShield() {
    // Parpadea al estar por expirar; la intensidad refleja los golpes restantes
    if (this.shieldTimer < 1.5 && Math.floor(this.shieldTimer * 8) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = POWER_COLORS.shield;
    ctx.shadowColor = POWER_COLORS.shield;
    ctx.shadowBlur  = 8 + 4 * Math.sin(performance.now() / 120);
    ctx.globalAlpha = 0.35 + 0.22 * this.shieldHits;
    ctx.lineWidth   = 1.5 + this.shieldHits * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  draw() {
    if (this.dead) return;
    if (this.hasShield()) this.drawShield();
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - (this.hyperTimer > 0 ? rand(16, 30) : rand(6, 14)), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = this.hyperTimer > 0 ? 'rgba(102, 255, 102, 0.9)' : 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerups;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
  // Habilidades por nivel: 1 (niveles 1-5), 2 (6-10), 3 (11-15), 4 (16-20)...
  // con tope en la cantidad de tipos de habilidad y de asteroides
  const nPowers = Math.min(1 + Math.floor((level - 1) / 5), POWER_TYPES.length, asteroids.length);
  asteroids.forEach(a => { a.glowing = false; });
  // Elige `nPowers` asteroides al azar, cada uno con una habilidad distinta
  const pool = [...asteroids];
  const powers = [...POWER_TYPES].sort(() => Math.random() - 0.5);
  for (let k = 0; k < nPowers; k++) {
    const a = pool.splice(randInt(0, pool.length - 1), 1)[0];
    a.glowing = true;
    a.power   = powers[k];
  }
  // Nova es escasa y se suma a las habilidades del nivel (no las reemplaza):
  // por cada habilidad del nivel hay NOVA_CHANCE de que otro asteroide lleve Nova
  for (let k = 0; k < nPowers && pool.length > 0; k++) {
    if (Math.random() < NOVA_CHANCE) {
      const a = pool.splice(randInt(0, pool.length - 1), 1)[0];
      a.glowing = true;
      a.power   = 'nova';
    }
  }
}

// Destruye todos los asteroides en pantalla (sin dividirlos). Un solo uso.
function triggerNova() {
  ship.novaReady = false;
  novaFx = { x: ship.x, y: ship.y, t: NOVA_FX_TIME };
  for (const a of asteroids) {
    a.dead = true;
    score += POINTS[a.size];
    if (a.glowing) powerups.push(new PowerUp(a.x, a.y, a.power));
    explode(a.x, a.y, a.size * 5);
  }
  asteroids = [];
}

function initGame() {
  novaFx    = null;
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerups  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerups  = [];
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (novaFx && (novaFx.t -= dt) <= 0) novaFx = null;

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(astDt(dt)));
    powerups.forEach(p => p.update(dt));
    powerups = powerups.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Activar Bomba Nova
  if (pressed('KeyN') && ship.novaReady) triggerNova();

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(astDt(dt)));
  particles.forEach(p => p.update(dt));
  powerups.forEach(p => p.update(dt));

  bullets  = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  powerups  = powerups.filter(p => !p.dead);

  // Imán: dentro de MAGNET_DIST el ítem es absorbido rápidamente hacia la nave
  if (!ship.dead) {
    for (const p of powerups) {
      const d = dist(ship, p);
      if (d < MAGNET_DIST && d > 0) {
        const step = Math.min(MAGNET_SPEED * dt, d);
        p.x += (ship.x - p.x) / d * step;
        p.y += (ship.y - p.y) / d * step;
      }
    }
  }

  // Nave recoge power-up
  for (const p of powerups) {
    if (dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      if (p.type === 'shield') {
        ship.shieldTimer = SHIELD_DURATION;
        ship.shieldHits  = SHIELD_HITS;
      } else if (p.type === 'nova') {
        ship.novaReady = true;
      } else if (p.type === 'slow') {
        ship.slowTimer = SLOW_DURATION;
      } else if (p.type === 'hyper') {
        ship.hyperTimer = HYPER_DURATION;
      } else {
        ship.tripleTimer = TRIPLE_DURATION;
      }
    }
  }
  powerups = powerups.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        if (a.glowing) powerups.push(new PowerUp(a.x, a.y, a.power));
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.hasShield()) {
          if (ship.shieldCooldown <= 0) {
            // El escudo absorbe el golpe y repele al asteroide
            ship.shieldHits--;
            ship.shieldCooldown = 0.4;
            if (ship.shieldHits <= 0) ship.shieldTimer = 0;
            const d = dist(ship, a) || 1;
            const sp = Math.hypot(a.vx, a.vy) || 40;
            a.vx = (a.x - ship.x) / d * sp;
            a.vy = (a.y - ship.y) / d * sp;
            explode(ship.x, ship.y, 6);
          }
          continue;
        }
        killShip();
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  let hy = 46;
  ctx.textAlign = 'left';
  if (ship.tripleTimer > 0) {
    ctx.fillStyle = POWER_COLORS.triple;
    ctx.fillText(`TRIPLE  ${Math.ceil(ship.tripleTimer)}s`, 14, hy);
    hy += 20;
  }

  if (ship.hasShield()) {
    ctx.fillStyle = POWER_COLORS.shield;
    ctx.fillText(`ESCUDO  ${ship.shieldTimer.toFixed(1)}s  x${ship.shieldHits}`, 14, hy);
    hy += 20;
  }

  if (ship.slowTimer > 0) {
    ctx.fillStyle = POWER_COLORS.slow;
    ctx.fillText(`LENTO  ${Math.ceil(ship.slowTimer)}s`, 14, hy);
    hy += 20;
  }

  if (ship.hyperTimer > 0) {
    ctx.fillStyle = POWER_COLORS.hyper;
    ctx.fillText(`HIPER  ${Math.ceil(ship.hyperTimer)}s`, 14, hy);
    hy += 20;
  }

  if (ship.novaReady) {
    ctx.fillStyle = POWER_COLORS.nova;
    ctx.fillText('NOVA  [N]', 14, hy);
  }

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  bullets.forEach(b => b.draw());
  powerups.forEach(p => p.draw());
  ship.draw();

  if (novaFx) {
    const k = novaFx.t / NOVA_FX_TIME;
    ctx.save();
    ctx.fillStyle = `rgba(255,90,90,${(0.35 * k).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = POWER_COLORS.nova;
    ctx.shadowColor = POWER_COLORS.nova;
    ctx.shadowBlur  = 15;
    ctx.globalAlpha = k;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(novaFx.x, novaFx.y, (1 - k) * 900, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
