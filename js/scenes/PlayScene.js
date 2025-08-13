/* global Phaser, LevelManager */
class PlayScene extends Phaser.Scene {
  constructor() {
    super('PlayScene');
    this.planets = [];
    this.ship = null;
    this.graphics = null;
    this.dragStart = null;
    this.launched = false;
    this.fuel = 12; // default; can be overridden by level params
    this.statusText = null;
    this.target = null; // target planet
    this.params = {
      globalG: 0.02,
      maxSpeed: 20,
      frictionAir: 0.002,
      nearClampAdd: 16,
      captureExtra: 12,
      launch: { baseCost: 6, perPower: 0.5, scale: 0.012, cap: 8 },
      burn: { tapCost: 0.6, tapImpulse: 0.006, cooldownMs: 150 }
    };
    this.burnCooldownMs = 0; // cooldown timer for discrete burns
    this.elapsedMs = 0; // level timer
    this._hudMs = 0; // throttle HUD updates
    // Collectibles and effects
    this.collectibles = [];
    this.sessionScore = 0;
    this.shieldUntil = 0; // timestamp ms
    this.gravityMul = 1.0;
    this.gravityUntil = 0; // timestamp ms
    // Pause/UI
    this.paused = false;
    this.pauseUI = null;
    // FX emitters
    this.fx = { spark: null, pickup: null, launch: null };
    // VFX quality multiplier
    this.vfxQMul = 1.0;
  }

  create() {
    // World bounds as a large square
    const W = this.scale.width;
    const H = this.scale.height;

    // Read VFX quality setting
    try {
      const q = (window.Settings && Settings.get('vfxQuality')) || 'high';
      this.vfxQMul = (q === 'high') ? 1.0 : (q === 'med') ? 0.6 : 0.35;
    } catch(e) { this.vfxQMul = 1.0; }

    // Background
    this.add.rectangle(0, 0, W*2, H*2, 0x0b1020).setOrigin(0).setDepth(-30);
    // Starfield parallax layer (density by quality)
    if (window.Gfx) {
      const q = this.vfxQMul;
      const key = q >= 0.9 ? 'starfield_hi' : (q >= 0.5 ? 'starfield_med' : 'starfield_low');
      const count = q >= 0.9 ? 180 : (q >= 0.5 ? 130 : 90);
      Gfx.drawStarfield(this, key, W, H, count);
    }

    // Add graphics layer (for ship, UI guides)
    this.graphics = this.add.graphics();

    // Load current level
    const lvl = LevelManager.getCurrent();
    if (!lvl) {
      this.add.text(12, 12, 'No level loaded', { color: '#ff9aa8' });
      return;
    }

    // Build planets from level (percent positions to pixels)
    this.planets = (lvl.planets || []).map(p => ({
      name: p.name,
      x: Math.floor(p.x <= 1 ? p.x * W : p.x),
      y: Math.floor(p.y <= 1 ? p.y * H : p.y),
      r: p.r,
      mass: p.mass,
      color: p.color,
      isStar: !!p.isStar,
    }));

    // Params from level (with sane defaults)
    const lp = lvl.params || {};
    this.params = {
      globalG: lp.globalG ?? 0.02,
      maxSpeed: lp.maxSpeed ?? 20,
      frictionAir: lp.frictionAir ?? 0.002,
      fuel: lp.fuel ?? this.fuel,
      nearClampAdd: lp.nearClampAdd ?? 16,
      captureExtra: lp.captureExtra ?? 12,
      launch: {
        baseCost: lp.launch?.baseCost ?? 6,
        perPower: lp.launch?.perPower ?? 0.5,
        scale: lp.launch?.scale ?? 0.012,
        cap: lp.launch?.cap ?? 8,
      },
      burn: {
        tapCost: lp.burn?.tapCost ?? 0.6,
        tapImpulse: lp.burn?.tapImpulse ?? 0.006,
        cooldownMs: lp.burn?.cooldownMs ?? 150,
      },
    };
    this.fuel = this.params.fuel;

    // Choose target by index
    const tIdx = Math.min(Math.max(lvl.targetIndex || 0, 0), this.planets.length - 1);
    this.target = this.planets[tIdx];
    // Precompute capture radius squared
    this.targetCaptureR2 = (this.target.r + this.params.captureExtra) * (this.target.r + this.params.captureExtra);

    // Build collectibles (optional per level)
    this.collectibles = [];
    const colls = lvl.collectibles || [];
    for (const c of colls) {
      const cx = Math.floor((c.x <= 1 ? c.x * W : c.x));
      const cy = Math.floor((c.y <= 1 ? c.y * H : c.y));
      const key = this._collectibleKey(c.type);
      const img = this.add.image(cx, cy, key).setDepth(-2);
      img.setData('type', c.type);
      img.setData('data', c);
      this.collectibles.push({ x: cx, y: cy, type: c.type, data: c, img, active: true });
    }

    // Create ship as a Matter body from level start (percent to pixels)
    const sx = Math.floor((lvl.start?.x ?? 0.1) * W);
    const sy = Math.floor((lvl.start?.y ?? 0.2) * H);
    const shipR = 6;
    this.ship = this.matter.add.circle(sx, sy, shipR, { restitution: 0.1, frictionAir: this.params.frictionAir, friction: 0, frictionStatic: 0, mass: 1 });
    this.matter.body.setInertia(this.ship, Infinity);
    this.launched = false;
    // Thruster particles
    this.thrusterEmitter = null;
    try {
      if (window.Gfx) {
        const texKey = Gfx.ensureCircle(this, 'thrusterDot', 2, 0x9fb7ff, 2);
        const particles = this.add.particles(texKey).setDepth(-1);
        this.thrusterEmitter = particles.createEmitter({
          lifespan: 450,
          alpha: { start: 0.8, end: 0 },
          scale: { start: 1.0, end: 0.1 },
          speed: { min: 10, max: 30 },
          quantity: Math.max(1, Math.round(1 * this.vfxQMul)),
          frequency: Math.max(20, Math.round(60 / Math.max(0.35, this.vfxQMul))),
          blendMode: 'ADD',
          follow: this.ship,
          emitZone: undefined,
          on: false,
        });
      }
    } catch(e) { /* ignore */ }

    // Additional particle systems (spark, pickup, launch burst)
    try {
      if (window.Gfx) {
        const sparkKey = Gfx.ensureCircle(this, 'sparkDot', 2, 0x8fe9ff, 4);
        const pickKey = Gfx.ensureCircle(this, 'pickupDot', 2, 0xffe56b, 4);
        const launchKey = Gfx.ensureCircle(this, 'launchDot', 3, 0xaad4ff, 6);
        const sparkPM = this.add.particles(sparkKey).setDepth(5);
        const pickPM = this.add.particles(pickKey).setDepth(5);
        const launchPM = this.add.particles(launchKey).setDepth(5);
        this.fx.spark = sparkPM.createEmitter({
          lifespan: { min: 250, max: 550 },
          alpha: { start: 1, end: 0 },
          speed: { min: 40, max: 140 },
          angle: { min: 0, max: 360 },
          gravityY: 0,
          scale: { start: 0.9, end: 0.2 },
          quantity: Math.max(6, Math.round(12 * this.vfxQMul)),
          blendMode: 'ADD',
          on: false,
        });
        this.fx.pickup = pickPM.createEmitter({
          lifespan: { min: 300, max: 700 },
          alpha: { start: 1, end: 0 },
          speed: { min: 20, max: 80 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.0, end: 0.1 },
          quantity: Math.max(6, Math.round(16 * this.vfxQMul)),
          blendMode: 'ADD',
          on: false,
        });
        this.fx.launch = launchPM.createEmitter({
          lifespan: { min: 350, max: 700 },
          alpha: { start: 0.9, end: 0 },
          speed: { min: 60, max: 180 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.2, end: 0.2 },
          quantity: Math.max(10, Math.round(24 * this.vfxQMul)),
          blendMode: 'ADD',
          on: false,
        });
      }
    } catch(e) { /* ignore */ }

    // Slightly slow down the entire physics simulation for better control
    this.matter.world.engine.timing.timeScale = 0.8;

    // Precompute planet GM and near-field clamp^2 (static per level)
    for (const p of this.planets) {
      p.gm = this.params.globalG * p.mass;
      const clamp = (p.r + this.params.nearClampAdd);
      p.minDist2 = clamp * clamp;
    }

    // Pre-render planets and gravity rings once to a cached layer
    this._buildPlanetLayer();

    // Trail render texture and dot sprite for efficient persistent trail
    this.trailRT = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(-5);
    this.trailDotKey = (window.Gfx ? Gfx.ensureCircle(this, 'trailDot', 2, 0x9db2ff, 2) : null);
    this.trailDot = this.add.image(0, 0, this.trailDotKey || '').setVisible(false);

    // Input handling for drag-to-launch
    this.input.on('pointerdown', (p) => {
      if (!this.launched && this._withinShip(p)) {
        this.dragStart = new Phaser.Math.Vector2(p.worldX, p.worldY);
      }
    });

    this.input.on('pointermove', (p) => {
      // just redraw arrow in render
    });

    this.input.on('pointerup', (p) => {
      if (!this.launched && this.dragStart) {
        const dragEnd = new Phaser.Math.Vector2(p.worldX, p.worldY);
        const vec = this.dragStart.clone().subtract(dragEnd); // pull = power
        const launchPower = Phaser.Math.Clamp(vec.length() * this.params.launch.scale, 0, this.params.launch.cap);
        const dir = vec.normalize();
        // Fuel-gated launch: cost = base + proportional to power (per level)
        const baseCost = this.params.launch.baseCost;
        const perPower = this.params.launch.perPower;
        const maxPowerAffordable = Math.max(0, (this.fuel - baseCost) / perPower);
        const usePower = Math.min(launchPower, maxPowerAffordable);
        if (usePower > 0) {
          const vx = dir.x * usePower;
          const vy = dir.y * usePower;
          this.matter.body.setVelocity(this.ship, { x: vx, y: vy });
          this.fuel = Math.max(0, this.fuel - (baseCost + usePower * perPower));
          this.launched = true;
          this.dragStart = null;
          if (window.Sfx) Sfx.play('launch');
          // Launch VFX
          if (this.fx && this.fx.launch) {
            const n = Math.max(10, Math.round(24 * this.vfxQMul));
            this.fx.launch.explode(n, this.ship.position.x, this.ship.position.y);
          }
          if (this.vfxQMul > 0.4) this._shockwave(this.ship.position.x, this.ship.position.y, 0xaad4ff, 420, 18);
        } else {
          // Not enough fuel to launch at chosen power
          this.dragStart = null;
        }
      }
    });

    // Keyboard controls
    this.cursors = this.input.keyboard.addKeys({
      up: 'W', left: 'A', down: 'S', right: 'D', space: 'SPACE', reset: 'R'
    });
    this.pauseKeys = this.input.keyboard.addKeys({ pause: 'P', esc: 'ESC' });

    // Collision detection: simplistic using distances (since we use custom forces)
    this.events.on('update', this._checkCollisions, this);

    // Status text
    this.statusText = this.add.text(12, H - 24, '', { fontSize: 12, color: '#9fb7ff' }).setDepth(10).setScrollFactor(0);

    // On-screen mobile controls (tap burns)
    this._buildTouchControls();

    // Pause UI overlay
    this._buildPauseUI();

    // Ambient loop
    if (window.Sfx && Sfx.ambientStart) Sfx.ambientStart();
    this.events.once('shutdown', () => { if (window.Sfx && Sfx.ambientStop) Sfx.ambientStop(); });
    this.events.once('destroy', () => { if (window.Sfx && Sfx.ambientStop) Sfx.ambientStop(); });
  }

  _withinShip(pointer) {
    const dx = pointer.worldX - this.ship.position.x;
    const dy = pointer.worldY - this.ship.position.y;
    return (dx*dx + dy*dy) <= (14*14);
  }

  _checkCollisions() {
    // Bounds fail
    const W = this.scale.width, H = this.scale.height;
    const pos = this.ship.position;
    if (pos.x < -200 || pos.y < -200 || pos.x > W + 200 || pos.y > H + 200) {
      this._fail('Out of bounds');
      return;
    }

    // Planet collisions and target capture
    for (const p of this.planets) {
      const dx = pos.x - p.x;
      const dy = pos.y - p.y;
      const d2 = dx*dx + dy*dy;
      const rr = p.r * p.r;

      // Win if within capture radius of target (slightly larger than body)
      if (p === this.target) {
        if (d2 <= this.targetCaptureR2) {
          this._win();
          return;
        }
      }

      // Crash on non-target bodies
      if (d2 <= rr) {
        // Shield check
        if (this.time.now < this.shieldUntil) {
          if (window.Sfx) Sfx.play('hit');
          // Nudge ship outward slightly to avoid immediate re-collision
          const dist = Math.max(1, Math.sqrt(d2));
          const nx = (pos.x - p.x) / dist, ny = (pos.y - p.y) / dist;
          this.matter.body.setPosition(this.ship, { x: p.x + nx * (p.r + 6), y: p.y + ny * (p.r + 6) });
          // Camera feedback (scale by VFX quality)
          this.cameras.main.shake(120, 0.006 * this.vfxQMul);
          // Shield spark VFX at impact edge
          if (this.fx && this.fx.spark) {
            const n = Math.max(6, Math.round(14 * this.vfxQMul));
            this.fx.spark.explode(n, p.x + nx * (p.r + 2), p.y + ny * (p.r + 2));
          }
          return;
        } else {
          this._fail(p.isStar ? 'Burned in the star' : `Crashed into ${p.name}`);
          return;
        }
      }
    }
  }

  _buildPlanetLayer() {
    const W = this.scale.width, H = this.scale.height;
    if (this.planetLayerRT) this.planetLayerRT.destroy();
    this.planetLayerRT = this.make.renderTexture({ width: W, height: H, add: true }).setDepth(-12);
    const g = this.add.graphics();
    for (const p of this.planets) {
      // Gravity rings
      g.lineStyle(1, p.color, 0.12);
      for (let r = p.r + 24; r <= p.r + 120; r += 24) g.strokeCircle(p.x, p.y, r);
      // Planet body with soft halo
      if (window.Gfx) {
        const key = Gfx.ensureCircle(this, `planet_${p.name}_${p.r}_${p.color}`, p.r, p.color, Math.floor(p.r*0.35));
        this.planetLayerRT.draw(key, p.x, p.y);
      } else {
        g.fillStyle(p.color, 1); g.fillCircle(p.x, p.y, p.r);
      }
      if (p === this.target) {
        g.lineStyle(2, 0xaaffaa, 0.8); g.strokeCircle(p.x, p.y, p.r + this.params.captureExtra);
      }
    }
    if (g) { this.planetLayerRT.draw(g); g.destroy(); }
  }

  _win() {
    const timeSec = Math.floor(this.elapsedMs / 1000);
    const base = 1000;
    const fuelBonus = Math.round(this.fuel * 50);
    const timePenalty = timeSec * 10;
    const score = Math.max(0, base + fuelBonus + (this.sessionScore||0) - timePenalty);
    if (window.Sfx) Sfx.play('win');
    this._flash(0xffffff, 260, 0.5);
    this.scene.start('WinScene', { fuel: this.fuel, timeSec, score });
  }

  _fail(reason) {
    if (window.Sfx) Sfx.play('fail');
    this._flash(0xff3355, 320, 0.6);
    this.cameras.main.shake(220, 0.012 * this.vfxQMul);
    this.scene.start('LoseScene', { reason });
  }

  _applyMicroBurns(dtMs) {
    if (!this.launched || this.fuel <= 0) return;
    // Discrete taps with cooldown
    this.burnCooldownMs = Math.max(0, this.burnCooldownMs - dtMs);
    const canBurn = this.burnCooldownMs <= 0;
    if (canBurn) {
      if (Phaser.Input.Keyboard.JustDown(this.cursors.up))    this._tryTapBurn(0, -1, 1.0);
      if (Phaser.Input.Keyboard.JustDown(this.cursors.down))  this._tryTapBurn(0,  1, 1.0);
      if (Phaser.Input.Keyboard.JustDown(this.cursors.left))  this._tryTapBurn(-1, 0, 1.0);
      if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this._tryTapBurn( 1, 0, 1.0);
      if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) this._tryTapBurn(0, -1, 0.7);
    }
  }

  _tryTapBurn(dx, dy, scale) {
    const tapCost = this.params.burn.tapCost;
    const tapImpulse = this.params.burn.tapImpulse * (scale ?? 1);
    if (this.fuel >= tapCost) {
      this.matter.body.applyForce(this.ship, this.ship.position, { x: dx * tapImpulse, y: dy * tapImpulse });
      this.fuel = Math.max(0, this.fuel - tapCost);
      this.burnCooldownMs = this.params.burn.cooldownMs;
      if (window.Sfx) Sfx.play('burn');
      if (this.thrusterEmitter) this.thrusterEmitter.explode(8);
    }
  }

  _buildTouchControls() {
    const W = this.scale.width, H = this.scale.height;
    const s = 28, pad = 10;
    const ox = W - (s * 2 + pad * 3);
    const oy = H - (s * 2 + pad * 3);
    const style = { fillStyle: { color: 0x1f2a44, alpha: 0.35 }, lineStyle: { width: 1, color: 0x9fb7ff, alpha: 0.5 } };
    const mkBtn = (x, y, label, onTap) => {
      const g = this.add.graphics().setScrollFactor(0).setDepth(10);
      g.fillStyle(style.fillStyle.color, style.fillStyle.alpha);
      g.fillRoundedRect(x, y, s, s, 6);
      g.lineStyle(style.lineStyle.width, style.lineStyle.color, style.lineStyle.alpha);
      g.strokeRoundedRect(x, y, s, s, 6);
      const t = this.add.text(x + s/2, y + s/2, label, { fontSize: 12, color: '#cfe3ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(10);
      const zone = this.add.zone(x, y, s, s).setOrigin(0).setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(11);
      zone.on('pointerdown', onTap);
    };
    mkBtn(ox + pad + s, oy + pad,    '▲', () => this._tryTapBurn(0, -1, 1.0));
    mkBtn(ox + pad,       oy + pad + s, '◀', () => this._tryTapBurn(-1, 0, 1.0));
    mkBtn(ox + pad + s,   oy + pad + s, '▼', () => this._tryTapBurn(0, 1, 1.0));
    mkBtn(ox + pad + s*2, oy + pad + s, '▶', () => this._tryTapBurn(1, 0, 1.0));
    // Reset button
    mkBtn(ox + pad + s*3.2, oy + pad + s*0.2, 'R', () => this.scene.restart());
  }

  _applyGravity(dt) {
    // Simplified Newtonian gravity: F = G * m1 * m2 / r^2 towards planet
    const shipMass = this.ship.mass || 1;
    const pos = this.ship.position;

    for (const p of this.planets) {
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      const dist2 = dx*dx + dy*dy;
      const clamped = Math.max(dist2, p.minDist2);
      const invDist = 1 / Math.sqrt(clamped);
      const forceMag = (p.gm * this.gravityMul * shipMass) / clamped;
      const fx = forceMag * dx * invDist;
      const fy = forceMag * dy * invDist;
      this.matter.body.applyForce(this.ship, pos, { x: fx, y: fy });
    }
  }

  _draw() {
    const g = this.graphics;
    g.clear();

    // Planets are pre-rendered once into planetLayerRT for performance

    // Ship
    g.fillStyle(0xd7e1ff, 1);
    g.fillCircle(this.ship.position.x, this.ship.position.y, 6);

    // Shield visual
    if (this.time.now < this.shieldUntil) {
      g.lineStyle(2, 0x8fe9ff, 0.9);
      g.strokeCircle(this.ship.position.x, this.ship.position.y, 10);
    }

    // Trail is drawn into trailRT for low-cost persistence with fade

    // Drag arrow
    if (!this.launched && this.dragStart) {
      const p = this.input.activePointer;
      const end = new Phaser.Math.Vector2(p.worldX, p.worldY);
      const vec = this.dragStart.clone().subtract(end);
      const dir = vec.clone().normalize();
      const mag = Phaser.Math.Clamp(vec.length(), 0, 200);
      const tip = this.dragStart.clone().add(dir.scale(mag));

      g.lineStyle(2, 0xffffff, 0.9);
      g.beginPath(); g.moveTo(this.ship.position.x, this.ship.position.y); g.lineTo(tip.x, tip.y); g.strokePath();
      // arrow head
      const left = dir.clone().rotate(Math.PI * 0.85).scale(10);
      const right = dir.clone().rotate(-Math.PI * 0.85).scale(10);
      g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(tip.x + left.x, tip.y + left.y); g.lineTo(tip.x + right.x, tip.y + right.y); g.strokePath();

      // Launch power indicator
      const scale = this.params.launch.scale, cap = this.params.launch.cap;
      const power = Math.min(cap, vec.length() * scale);
      const ratio = Phaser.Math.Clamp(power / cap, 0, 1);
      const bx = this.ship.position.x + 14, by = this.ship.position.y - 18, bw = 46, bh = 5;
      g.lineStyle(1, 0x9fb7ff, 0.6); g.strokeRect(bx, by, bw, bh);
      g.fillStyle(0xaad4ff, 0.85); g.fillRect(bx+1, by+1, Math.floor((bw-2)*ratio), bh-2);
    }
  }

  update(time, delta) {
    const dt = delta / 16.6667; // relative to 60fps

    // Reset
    if (Phaser.Input.Keyboard.JustDown(this.cursors.reset)) {
      this.scene.restart();
      return;
    }

    // Pause toggle
    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.pause) || Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc)) {
      this._togglePause();
    }
    if (this.paused) {
      // Update HUD occasionally while paused
      this._hudMs += delta;
      if (this._hudMs >= 400) {
        this._hudMs = 0;
        const timeSec = Math.floor(this.elapsedMs / 1000);
        this.statusText.setText(`paused  t:${timeSec}s  fuel:${this.fuel.toFixed(1)}  score:${this.sessionScore}`);
      }
      return;
    }

    // Physics and controls
    if (this.launched) {
      this.elapsedMs += delta;
      this._applyGravity(dt);
      this._applyMicroBurns(delta);

      // Optional: relaxed max speed clamp (allow higher speeds for orbits)
      const v = this.ship.velocity;
      const speed = Math.hypot(v.x, v.y);
      const maxSpeed = this.params.maxSpeed;
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        this.matter.body.setVelocity(this.ship, { x: v.x * scale, y: v.y * scale });
      }

      // Trail: fade previous and stamp current position
      if (this.trailRT && this.trailDotKey) {
        // Stronger fade on lower quality to reduce overdraw persistence
        const fade = 0.06 * (1 / Math.max(0.35, this.vfxQMul));
        this.trailRT.fill(0x0b1020, Math.min(0.2, fade));
        this.trailRT.draw(this.trailDot, this.ship.position.x, this.ship.position.y);
      }
    }

    // Timed effects expiry
    if (this.gravityMul !== 1 && this.time.now >= this.gravityUntil) this.gravityMul = 1;

    // Collectibles pickup check
    this._checkCollectibles();

    // Camera polish: slight zoom when near a planet
    const cam = this.cameras.main;
    let minD = Infinity;
    for (const p of this.planets) {
      const dx = p.x - this.ship.position.x;
      const dy = p.y - this.ship.position.y;
      const d = Math.hypot(dx, dy) - p.r;
      if (d < minD) minD = d;
    }
    const targetZoom = (minD < 120) ? 1.12 : 1.0;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.05));

    // Thruster emitter activation based on speed when launched
    if (this.thrusterEmitter) {
      const v = this.ship.velocity;
      const sp = Math.hypot(v.x, v.y);
      this.thrusterEmitter.on = this.launched && sp > 4;
      this.thrusterEmitter.setFrequency(Phaser.Math.Linear(80, 25, Phaser.Math.Clamp((sp-4)/12, 0, 1)));
      // Heat tint by speed
      const t = Phaser.Math.Clamp((sp-4)/12, 0, 1);
      const c1 = { r: 159, g: 183, b: 255 };
      const c2 = { r: 255, g: 170, b: 102 };
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      const tint = (r<<16) | (g<<8) | b;
      this.thrusterEmitter.setTint(tint);
    }

    // HUD bottom-left (throttled to ~5Hz)
    this._hudMs += delta;
    if (this._hudMs >= 200) {
      this._hudMs = 0;
      const v2 = this.ship.velocity;
      const speed2 = Math.hypot(v2.x, v2.y).toFixed(2);
      const timeSec = Math.floor(this.elapsedMs / 1000);
      const shieldLeft = Math.max(0, Math.ceil((this.shieldUntil - this.time.now)/1000));
      const shieldTxt = (shieldLeft > 0) ? ` shield:${shieldLeft}s` : '';
      this.statusText.setText(`t:${timeSec}s  v:${speed2}  fuel:${this.fuel.toFixed(1)}  score:${this.sessionScore}  target:${this.target.name}${shieldTxt}`);
    }

    this._draw();
  }

  _buildPauseUI() {
    const W = this.scale.width, H = this.scale.height;
    const cont = this.add.container(0,0).setDepth(50).setScrollFactor(0);
    const bg = this.add.rectangle(0,0,W,H,0x020615,0.75).setOrigin(0);
    const title = this.add.text(W/2, H/2-40, 'Paused', { fontSize: 28, color: '#cfe3ff' }).setOrigin(0.5);
    const resume = this.add.text(W/2, H/2+4, '[ Resume ]', { fontSize: 18, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const restart = this.add.text(W/2, H/2+34, '[ Restart ]', { fontSize: 18, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const levels = this.add.text(W/2, H/2+64, '[ Level Select ]', { fontSize: 18, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const menu = this.add.text(W/2, H/2+94, '[ Menu ]', { fontSize: 18, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    resume.on('pointerdown', ()=> this._togglePause(false));
    restart.on('pointerdown', ()=> { this._togglePause(false); this.scene.restart(); });
    levels.on('pointerdown', ()=> { this._togglePause(false); this.scene.start('LevelSelectScene'); });
    menu.on('pointerdown', ()=> { this._togglePause(false); this.scene.start('MenuScene'); });
    cont.add([bg,title,resume,restart,levels,menu]);
    cont.setVisible(false);
    this.pauseUI = cont;
  }

  _togglePause(forceState) {
    const to = (typeof forceState === 'boolean') ? forceState : !this.paused;
    this.paused = to;
    if (this.pauseUI) this.pauseUI.setVisible(this.paused);
    // Disable physics while paused
    this.matter.world.enabled = !this.paused;
    if (this.thrusterEmitter) this.thrusterEmitter.on = !this.paused && this.thrusterEmitter.on;
    if (window.Sfx && Sfx.ambientMute) Sfx.ambientMute(this.paused);
  }

  _flash(color=0xffffff, duration=220, alpha=0.6) {
    const W = this.scale.width, H = this.scale.height;
    const rect = this.add.rectangle(0,0,W,H,color,alpha).setOrigin(0).setDepth(40).setScrollFactor(0);
    this.tweens.add({ targets: rect, alpha: 0, duration, ease: 'Quad.easeOut', onComplete: ()=> rect.destroy() });
  }

  _shockwave(x, y, color=0xaad4ff, duration=380, radius=16) {
    const g = this.add.graphics().setDepth(30);
    g.lineStyle(2, color, 0.9);
    const obj = { r: Math.max(2, radius * 0.5), a: 1 };
    const draw = () => { g.clear(); g.lineStyle(2, color, obj.a); g.strokeCircle(x, y, obj.r); };
    draw();
    this.tweens.add({
      targets: obj,
      r: radius * 2.2,
      a: 0,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: draw,
      onComplete: ()=> g.destroy(),
    });
  }

  _toast(x, y, text, color='#ffffff') {
    const t = this.add.text(x, y, text, { fontSize: 12, color }).setDepth(35);
    this.tweens.add({ targets: t, y: y-18, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: ()=> t.destroy() });
  }

  _collectibleKey(type) {
    if (!window.Gfx) return '';
    switch (type) {
      case 'fuel': return Gfx.ensureCircle(this, 'c_fuel', 6, 0x74ff95, 6);
      case 'score': return Gfx.ensureCircle(this, 'c_score', 6, 0xffe56b, 6);
      case 'shield': return Gfx.ensureCircle(this, 'c_shield', 6, 0x8fe9ff, 6);
      case 'time': return Gfx.ensureCircle(this, 'c_time', 6, 0xd0a5ff, 6);
      case 'gravity': return Gfx.ensureCircle(this, 'c_grav', 6, 0xffa365, 6);
    }
    return Gfx.ensureCircle(this, 'c_default', 6, 0xffffff, 6);
  }

  _checkCollectibles() {
    if (!this.collectibles || this.collectibles.length === 0) return;
    const pos = this.ship.position;
    for (const c of this.collectibles) {
      if (!c.active) continue;
      const dx = pos.x - c.x, dy = pos.y - c.y;
      if ((dx*dx + dy*dy) <= (12*12)) {
        c.active = false;
        c.img.setVisible(false);
        const msg = this._applyCollectible(c.type, c.data) || '';
        if (window.Sfx) Sfx.play('pickup');
        if (this.fx && this.fx.pickup) {
          const n = Math.max(6, Math.round(18 * this.vfxQMul));
          this.fx.pickup.explode(n, c.x, c.y);
        }
        if (msg) this._toast(c.x, c.y - 10, msg, '#cfe3ff');
      }
    }
  }

  _applyCollectible(type, data) {
    switch (type) {
      case 'fuel': {
        const add = data?.amount ?? 3;
        this.fuel += add;
        return `+${add.toFixed(0)} fuel`;
      }
      case 'score': {
        const add = data?.amount ?? 100;
        this.sessionScore += add;
        return `+${add} score`;
      }
      case 'time': {
        const sec = data?.seconds ?? -3;
        this.elapsedMs = Math.max(0, this.elapsedMs + sec * 1000);
        return (sec < 0) ? `${-sec}s bonus` : `+${sec}s`;
      }
      case 'shield': {
        const dur = data?.durationMs ?? 6000;
        this.shieldUntil = Math.max(this.time.now + dur, this.shieldUntil);
        return `shield ${Math.round(dur/1000)}s`;
      }
      case 'gravity': {
        const mul = data?.mul ?? 0.8; // lower = lighter gravity
        const dur = data?.durationMs ?? 5000;
        this.gravityMul = mul;
        this.gravityUntil = this.time.now + dur;
        return `gravity x${mul}`;
      }
    }
    return '';
  }
}
