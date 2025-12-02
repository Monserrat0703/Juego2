/**
 * LÓGICA DEL JUEGO ASTEROIDS
 * Estilo Vectorial de los 80s
 */

// --- CONFIGURACIÓN Y ESTADO GLOBAL ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('scoreDisplay');
const livesEl = document.getElementById('livesDisplay');
const overlay = document.getElementById('overlay');
const menuContent = document.getElementById('menuContent');
const gameOverContent = document.getElementById('gameOverContent');
const finalScoreEl = document.getElementById('finalScore');

let GAME = {
    state: 'MENU', // MENU, PLAYING, GAMEOVER
    width: 0,
    height: 0,
    score: 0,
    lives: 3,
    level: 1,
    lastTime: 0
};

const CONFIG = {
    FPS: 60,
    FRICTION: 0.98, // Inercia de la nave
    SHIP_THRUST: 0.15,
    SHIP_TURN_SPEED: 5, // Grados por frame
    BULLET_SPEED: 7,
    BULLET_LIFE: 60, // Frames
    ASTEROID_NUM: 3, // Asteroides iniciales
    ASTEROID_SIZE: 50,
    ASTEROID_VERTICES: 12,
    COLOR: '#33ff33',
    SAFE_TIME: 2000 // Tiempo de invulnerabilidad al reaparecer (ms)
};

// Input Handling
const keys = {
    ArrowUp: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

// --- AUDIO SYNTHESIZER (Web Audio API) ---
// Generamos sonidos proceduralmente para no depender de archivos externos
const AudioSys = {
    ctx: null,
    
    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playShoot: function() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },

    playThrust: function() {
        // Ruido blanco para el motor es complejo sin buffers, usaremos una onda cuadrada baja
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(80, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    playExplosion: function(size) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        // Frecuencia más baja para objetos grandes
        const freq = size === 'L' ? 50 : (size === 'M' ? 100 : 200);
        const duration = size === 'L' ? 0.4 : 0.2;

        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);
        
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    playExtraLife: function() {
         if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
};

// --- CLASES DEL JUEGO ---

class Vector {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { this.x += v.x; this.y += v.y; }
    mult(n) { this.x *= n; this.y *= n; }
}

class Ship {
    constructor() {
        this.pos = new Vector(GAME.width / 2, GAME.height / 2);
        this.vel = new Vector(0, 0);
        this.angle = -Math.PI / 2; // Apunta hacia arriba
        this.radius = 15;
        this.rotation = 0;
        this.thrusting = false;
        this.visible = true;
        this.invulnerable = true;
        this.blinkTimer = 0;
        
        // Timer de invulnerabilidad
        setTimeout(() => { this.invulnerable = false; }, CONFIG.SAFE_TIME);
    }

    update() {
        if (!this.visible) return;

        // Rotación
        if (keys.ArrowLeft) this.angle -= (CONFIG.SHIP_TURN_SPEED * Math.PI / 180);
        if (keys.ArrowRight) this.angle += (CONFIG.SHIP_TURN_SPEED * Math.PI / 180);

        // Impulso
        this.thrusting = keys.ArrowUp;
        if (this.thrusting) {
            this.vel.x += Math.cos(this.angle) * CONFIG.SHIP_THRUST;
            this.vel.y += Math.sin(this.angle) * CONFIG.SHIP_THRUST;
            AudioSys.playThrust();
        }

        // Física
        this.pos.add(this.vel);
        this.vel.mult(CONFIG.FRICTION);

        // Envolver pantalla (Screen Wrapping)
        if (this.pos.x < 0 - this.radius) this.pos.x = GAME.width + this.radius;
        if (this.pos.x > GAME.width + this.radius) this.pos.x = 0 - this.radius;
        if (this.pos.y < 0 - this.radius) this.pos.y = GAME.height + this.radius;
        if (this.pos.y > GAME.height + this.radius) this.pos.y = 0 - this.radius;
    }

    draw() {
        if (!this.visible) return;
        
        // Efecto de parpadeo si es invulnerable
        if (this.invulnerable) {
            this.blinkTimer++;
            if (this.blinkTimer % 10 < 5) return;
        }

        ctx.strokeStyle = CONFIG.COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        // Puntas del triángulo de la nave
        // Punta delantera
        const noseX = this.pos.x + Math.cos(this.angle) * this.radius;
        const noseY = this.pos.y + Math.sin(this.angle) * this.radius;
        
        // Parte trasera izquierda
        const rearLeftX = this.pos.x + Math.cos(this.angle + 2.5) * this.radius;
        const rearLeftY = this.pos.y + Math.sin(this.angle + 2.5) * this.radius;

        // Parte trasera derecha
        const rearRightX = this.pos.x + Math.cos(this.angle - 2.5) * this.radius;
        const rearRightY = this.pos.y + Math.sin(this.angle - 2.5) * this.radius;

        ctx.moveTo(noseX, noseY);
        ctx.lineTo(rearLeftX, rearLeftY);
        // Indentación trasera (estilo clásico)
        ctx.lineTo(this.pos.x - Math.cos(this.angle) * (this.radius * 0.3), this.pos.y - Math.sin(this.angle) * (this.radius * 0.3));
        ctx.lineTo(rearRightX, rearRightY);
        ctx.closePath();
        ctx.stroke();

        // Llama del propulsor
        if (this.thrusting) {
            ctx.beginPath();
            ctx.moveTo(
                this.pos.x - Math.cos(this.angle) * (this.radius * 0.5), 
                this.pos.y - Math.sin(this.angle) * (this.radius * 0.5)
            );
            ctx.lineTo(
                this.pos.x + Math.cos(this.angle + 2.8) * (this.radius + 10),
                this.pos.y + Math.sin(this.angle + 2.8) * (this.radius + 10)
            );
            ctx.lineTo(
                this.pos.x + Math.cos(this.angle - 2.8) * (this.radius + 10),
                this.pos.y + Math.sin(this.angle - 2.8) * (this.radius + 10)
            );
            ctx.stroke();
        }
    }
}

class Bullet {
    constructor(x, y, angle) {
        this.pos = new Vector(x, y);
        this.vel = new Vector(
            Math.cos(angle) * CONFIG.BULLET_SPEED,
            Math.sin(angle) * CONFIG.BULLET_SPEED
        );
        this.life = CONFIG.BULLET_LIFE;
        this.dead = false;
    }

    update() {
        this.pos.add(this.vel);
        this.life--;
        
        // Envolver pantalla
        if (this.pos.x < 0) this.pos.x = GAME.width;
        if (this.pos.x > GAME.width) this.pos.x = 0;
        if (this.pos.y < 0) this.pos.y = GAME.height;
        if (this.pos.y > GAME.height) this.pos.y = 0;

        if (this.life <= 0) this.dead = true;
    }

    draw() {
        ctx.fillStyle = CONFIG.COLOR;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Asteroid {
    constructor(x, y, size) {
        this.pos = new Vector(x || Math.random() * GAME.width, y || Math.random() * GAME.height);
        
        // Si no se dan coordenadas, asegurar que no aparezca encima de la nave
        if (!x && !y && ship) {
             while (dist(this.pos.x, this.pos.y, ship.pos.x, ship.pos.y) < 200) {
                 this.pos = new Vector(Math.random() * GAME.width, Math.random() * GAME.height);
             }
        }

        this.sizeCategory = size || 'L'; // L, M, S
        
        // Definir radio y velocidad según tamaño
        let speedMult = 1;
        if (this.sizeCategory === 'L') { this.radius = 45; speedMult = 1; }
        else if (this.sizeCategory === 'M') { this.radius = 25; speedMult = 1.5; }
        else { this.radius = 12; speedMult = 2; }

        // Velocidad aleatoria
        const angle = Math.random() * Math.PI * 2;
        this.vel = new Vector(Math.cos(angle) * speedMult * (Math.random() + 0.5), Math.sin(angle) * speedMult * (Math.random() + 0.5));

        // Generación de forma irregular (Procedural)
        this.vertices = [];
        this.offsets = [];
        const numVerts = CONFIG.ASTEROID_VERTICES;
        for (let i = 0; i < numVerts; i++) {
            // Cada vértice tiene un offset aleatorio del radio perfecto para que se vea rocoso
            this.offsets.push((Math.random() * 0.4) + 0.8); // Entre 0.8x y 1.2x del radio
        }
        
        this.rotAngle = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.05;
        this.dead = false;
    }

    update() {
        this.pos.add(this.vel);
        this.rotAngle += this.rotSpeed;

        if (this.pos.x < 0 - this.radius) this.pos.x = GAME.width + this.radius;
        if (this.pos.x > GAME.width + this.radius) this.pos.x = 0 - this.radius;
        if (this.pos.y < 0 - this.radius) this.pos.y = GAME.height + this.radius;
        if (this.pos.y > GAME.height + this.radius) this.pos.y = 0 - this.radius;
    }

    draw() {
        ctx.strokeStyle = CONFIG.COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        const angleStep = (Math.PI * 2) / this.offsets.length;
        
        for (let i = 0; i < this.offsets.length; i++) {
            const r = this.radius * this.offsets[i];
            const a = this.rotAngle + (i * angleStep);
            const x = this.pos.x + Math.cos(a) * r;
            const y = this.pos.y + Math.sin(a) * r;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

class Particle {
    constructor(x, y) {
        this.pos = new Vector(x, y);
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3;
        this.vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.01;
    }
    
    update() {
        this.pos.add(this.vel);
        this.life -= this.decay;
    }
    
    draw() {
        ctx.fillStyle = `rgba(51, 255, 51, ${this.life})`;
        ctx.fillRect(this.pos.x, this.pos.y, 2, 2);
    }
}

// --- VARIABLES DEL JUEGO ---
let ship;
let bullets = [];
let asteroids = [];
let particles = [];
let animationId;
let lastShotTime = 0;

// --- FUNCIONES AUXILIARES ---
function dist(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function resize() {
    GAME.width = window.innerWidth;
    GAME.height = window.innerHeight;
    canvas.width = GAME.width;
    canvas.height = GAME.height;
}

function resetGame() {
    GAME.score = 0;
    GAME.lives = 3;
    GAME.level = 1;
    updateUI();
    bullets = [];
    particles = [];
    startLevel();
}

function startLevel() {
    ship = new Ship();
    asteroids = [];
    // Aumentar dificultad
    const numAsteroids = CONFIG.ASTEROID_NUM + (GAME.level - 1);
    for(let i = 0; i < numAsteroids; i++) {
        asteroids.push(new Asteroid(null, null, 'L'));
    }
}

function spawnParticles(x, y, count = 10) {
    for(let i = 0; i < count; i++) {
        particles.push(new Particle(x, y));
    }
}

function updateUI() {
    scoreEl.innerText = `PUNTOS: ${GAME.score.toString().padStart(5, '0')}`;
    let livesStr = 'VIDAS: ';
    for(let i=0; i<GAME.lives; i++) livesStr += '▲ ';
    livesEl.innerText = livesStr;
}

// --- BUCLE PRINCIPAL ---

function gameLoop() {
    // Limpiar pantalla
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Pequeño rastro para efecto retro
    ctx.fillRect(0, 0, GAME.width, GAME.height);

    if (GAME.state === 'PLAYING') {
        
        // 1. Manejar Nave
        if (ship) {
            ship.update();
            ship.draw();
        }

        // 2. Disparos
        if (keys.Space && Date.now() - lastShotTime > 250 && ship.visible) {
            bullets.push(new Bullet(
                ship.pos.x + Math.cos(ship.angle) * ship.radius,
                ship.pos.y + Math.sin(ship.angle) * ship.radius,
                ship.angle
            ));
            AudioSys.playShoot();
            lastShotTime = Date.now();
        }

        // 3. Actualizar Balas
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.update();
            b.draw();
            if (b.dead) bullets.splice(i, 1);
        }

        // 4. Actualizar Asteroides y Colisiones
        let nextLevel = true;
        
        for (let i = asteroids.length - 1; i >= 0; i--) {
            let a = asteroids[i];
            a.update();
            a.draw();
            nextLevel = false; // Si hay asteroides, no pasar de nivel

            // Colisión con Balas
            for (let j = bullets.length - 1; j >= 0; j--) {
                let b = bullets[j];
                if (dist(a.pos.x, a.pos.y, b.pos.x, b.pos.y) < a.radius) {
                    // IMPACTO!
                    AudioSys.playExplosion(a.sizeCategory);
                    spawnParticles(a.pos.x, a.pos.y);
                    
                    // Sumar puntos
                    if (a.sizeCategory === 'L') GAME.score += 20;
                    else if (a.sizeCategory === 'M') GAME.score += 50;
                    else GAME.score += 100;
                    updateUI();

                    // Dividir asteroide
                    if (a.sizeCategory === 'L') {
                        asteroids.push(new Asteroid(a.pos.x, a.pos.y, 'M'));
                        asteroids.push(new Asteroid(a.pos.x, a.pos.y, 'M'));
                    } else if (a.sizeCategory === 'M') {
                        asteroids.push(new Asteroid(a.pos.x, a.pos.y, 'S'));
                        asteroids.push(new Asteroid(a.pos.x, a.pos.y, 'S'));
                    }

                    a.dead = true;
                    b.dead = true;
                    bullets.splice(j, 1);
                    break;
                }
            }

            // Colisión con Nave
            if (!a.dead && ship.visible && !ship.invulnerable && dist(a.pos.x, a.pos.y, ship.pos.x, ship.pos.y) < a.radius + ship.radius - 5) {
                AudioSys.playExplosion('L');
                spawnParticles(ship.pos.x, ship.pos.y, 30);
                ship.visible = false;
                ship.pos.x = -1000; // Sacar de pantalla
                
                GAME.lives--;
                updateUI();

                if (GAME.lives > 0) {
                    setTimeout(() => {
                        ship = new Ship(); // Respawn
                    }, 1500);
                } else {
                    GAME.state = 'GAMEOVER';
                    setTimeout(() => {
                        overlay.style.display = 'flex';
                        menuContent.style.display = 'none';
                        gameOverContent.style.display = 'block';
                        finalScoreEl.innerText = 'PUNTUACIÓN FINAL: ' + GAME.score;
                    }, 1500);
                }
            }

            if (a.dead) asteroids.splice(i, 1);
        }

        // 5. Partículas
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].life <= 0) particles.splice(i, 1);
        }

        // 6. Verificar Nivel
        if (asteroids.length === 0 && ship.visible) {
            GAME.level++;
            AudioSys.playExtraLife(); // Sonido de victoria de nivel
            startLevel();
        }
    }

    animationId = requestAnimationFrame(gameLoop);
}

// --- EVENT LISTENERS ---

window.addEventListener('resize', resize);
resize();

// Teclado
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp') keys.ArrowUp = true;
    if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight') keys.ArrowRight = true;
    if (e.code === 'Space') keys.Space = true;
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp') keys.ArrowUp = false;
    if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight') keys.ArrowRight = false;
    if (e.code === 'Space') keys.Space = false;
});

// Botones UI
document.getElementById('startBtn').addEventListener('click', () => {
    AudioSys.init();
    overlay.style.display = 'none';
    GAME.state = 'PLAYING';
    resetGame();
    gameLoop();
});

document.getElementById('restartBtn').addEventListener('click', () => {
    overlay.style.display = 'none';
    GAME.state = 'PLAYING';
    resetGame();
});

// Controles Táctiles (Móvil)
const setupTouch = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    el.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    el.addEventListener('mousedown', (e) => { keys[key] = true; }); // Para probar con mouse
    el.addEventListener('mouseup', (e) => { keys[key] = false; });
};

setupTouch('btnUp', 'ArrowUp');
setupTouch('btnLeft', 'ArrowLeft');
setupTouch('btnRight', 'ArrowRight');
setupTouch('btnShoot', 'Space');

// Inicializar
updateUI();
