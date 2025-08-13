#!/usr/bin/env node
/* eslint-disable no-console */
// Gravity Sling level generator: expands levels to 100 entries
// Variety-focused, planets capped at 9, realistic star density (rare singles, very rare binaries)
// Inserts levels by appending ids; difficulty is non-monotonic to create bridge levels.

const fs = require('fs');
const path = require('path');

// --- Config ---
const LEVELS_PATH = path.join(__dirname, '..', 'levels', 'levels.json');
const TARGET_COUNT = 100; // total levels desired
const RNG_SEED = 1337;

// Star density controls (realistic: most systems are single-star or no star visible; binaries are rare)
const STAR_PROB_EARLY = 0.05;   // ids <= 40
const STAR_PROB_MID = 0.10;     // ids 41-80
const STAR_PROB_LATE = 0.18;    // ids 81-100
const BINARY_PROB_LATE = 0.04;  // very rare late-game binary star

const MAX_PLANETS = 9; // per preference
const MIN_PLANETS = 2;

// Collectible distributions
const COLLECT_TYPES = ['score', 'fuel', 'shield', 'time', 'gravity'];

// --- RNG ---
function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(RNG_SEED);
const rnd = (min, max) => min + (max - min) * rand();
const rndi = (min, max) => Math.floor(rnd(min, max + 1));
const chance = (p) => rand() < p;

// --- Utilities ---
function pick(arr) { return arr[rndi(0, arr.length - 1)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Colors (decimal)
const COLORS = {
  star: 16769062,
  blue: 6736895,
  green: 8965631,
  red: 16733562,
  gray: 11184810,
  pink: 16744566,
  orange: 11382189,
  target: 11184895
};
const NON_STAR_COLORS = [COLORS.blue, COLORS.green, COLORS.red, COLORS.gray, COLORS.pink, COLORS.orange];

function makePlanet(x, y, r, mass, color, isStar = false, name = '') {
  const p = { name: name || (isStar ? 'Star' : 'P'), x: +x.toFixed(2), y: +y.toFixed(2), r, mass, color };
  if (isStar) p.isStar = true;
  return p;
}

function nonOverlap(pos, planets, minD) {
  for (const pl of planets) {
    const dx = pos.x - pl.x;
    const dy = pos.y - pl.y;
    const d = Math.hypot(dx, dy);
    if (d < minD) return false;
  }
  return true;
}

function spawnPoint(avoid, maxTry = 200) {
  // coordinates in normalized [0,1]
  for (let i = 0; i < maxTry; i++) {
    const x = rnd(0.12, 0.88);
    const y = rnd(0.12, 0.88);
    if (nonOverlap({ x, y }, avoid, 0.12)) return { x, y };
  }
  return { x: rnd(0.2, 0.8), y: rnd(0.2, 0.8) };
}

function starProbForId(id) {
  if (id <= 40) return STAR_PROB_EARLY;
  if (id <= 80) return STAR_PROB_MID;
  return STAR_PROB_LATE;
}

function buildParams(id) {
  // Baseline growth across IDs with periodic dips (bridge levels)
  const t = id / TARGET_COUNT;
  const bridge = (id % 4 === 0) ? -0.015 : 0; // every 4th level slightly gentler
  const globalG = 0.017 + t * 0.012 + bridge; // ~0.017..~0.029
  const maxSpeed = 24 + Math.round(t * 12) + (bridge < 0 ? -1 : 0); // 24..36
  const frictionAir = 0.002;
  const fuel = 11 + (id % 7 === 0 ? 1 : 0); // small oscillation to avoid monotony
  const nearClampAdd = 16 + (id >= 60 ? 2 : 0);
  const captureExtra = 14;
  const launch = {
    baseCost: 6,
    perPower: clamp(0.55 + t * 0.4 + (bridge < 0 ? -0.05 : 0), 0.55, 0.95),
    scale: 0.012,
    cap: 8
  };
  const burn = {
    tapCost: clamp(0.6 + t * 0.35 + (bridge < 0 ? -0.05 : 0), 0.6, 0.95),
    tapImpulse: 0.006,
    cooldownMs: Math.max(80, 150 - Math.floor(t * 70))
  };
  return { globalG: +globalG.toFixed(3), maxSpeed, frictionAir, fuel, nearClampAdd, captureExtra, launch, burn };
}

function makeCollectibles(id, planets) {
  const items = [];
  const add = (x, y, def) => items.push({ x: +x.toFixed(2), y: +y.toFixed(2), ...def });
  const want = (id < 35) ? rndi(0, 2) : (id < 70) ? rndi(1, 3) : rndi(2, 4);
  for (let i = 0; i < want; i++) {
    const type = (id < 30) ? pick(['score', 'fuel'])
      : (id < 60) ? pick(['score', 'fuel', 'time'])
      : pick(COLLECT_TYPES);
    const pos = spawnPoint(planets);
    if (type === 'score') add(pos.x, pos.y, { type, amount: rndi(100, 400) });
    else if (type === 'fuel') add(pos.x, pos.y, { type, amount: rndi(2, 4) });
    else if (type === 'time') add(pos.x, pos.y, { type, seconds: -rndi(3, 9) });
    else if (type === 'shield') add(pos.x, pos.y, { type, durationMs: rndi(5000, 9000) });
    else if (type === 'gravity') add(pos.x, pos.y, { type, mul: +rnd(0.6, 0.9).toFixed(2), durationMs: rndi(5000, 9000) });
  }
  return items;
}

function archetype(id) {
  // Choose an archetype by id band to ensure variety
  const bands = [
    'single', 'twin', 'triad', 'corridor', 'relay', 'ring', 'spiral', 'maze', 'binary', 'starSkim'
  ];
  // Weight late game towards complex archetypes
  const bias = id > 70 ? ['binary', 'ring', 'spiral', 'maze', 'relay'] : bands;
  return pick(bias);
}

function generatePlanets(id) {
  const planets = [];
  const at = archetype(id);

  // Decide stars
  let includeStar = chance(starProbForId(id));
  let binary = false;
  if (id > 70 && chance(BINARY_PROB_LATE)) {
    includeStar = true;
    binary = true;
  }

  const planetBudget = rndi(Math.max(MIN_PLANETS, includeStar ? 3 : 2), Math.min(MAX_PLANETS, 3 + Math.floor(id / 15)));

  const placed = [];
  const minD = 0.12;

  // Place stars first
  if (includeStar) {
    const c = spawnPoint(placed);
    const r = rndi(28, 42);
    const mass = r * 140; // proportional to radius
    placed.push({ x: c.x, y: c.y });
    planets.push(makePlanet(c.x, c.y, r, mass, COLORS.star, true, binary ? 'StarA' : 'Star'));
    if (binary) {
      const c2 = spawnPoint(placed);
      const r2 = rndi(26, 38);
      const mass2 = r2 * 135;
      placed.push({ x: c2.x, y: c2.y });
      planets.push(makePlanet(c2.x, c2.y, r2, mass2, COLORS.star, true, 'StarB'));
    }
  }

  // Place non-star planets according to archetype
  const need = Math.max(2, planetBudget - planets.length);
  for (let i = 0; i < need; i++) {
    let pos = spawnPoint(placed);
    let r = rndi(12, 22);
    let mass = r * rndi(35, 80);
    const color = pick(NON_STAR_COLORS);
    placed.push({ x: pos.x, y: pos.y });
    planets.push(makePlanet(pos.x, pos.y, r, mass, color, false, 'P'));
  }

  // Adjust pattern a bit by archetype
  if (at === 'ring' || at === 'spiral') {
    // try to roughly align a curve by sorting by angle around center
    const cx = 0.5, cy = 0.5;
    planets.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  }

  // Pick goal planet distinct color and slightly larger radius
  const goalIdx = planets.length - 1;
  planets[goalIdx].name = 'Goal';
  planets[goalIdx].color = COLORS.target;
  planets[goalIdx].r = clamp(planets[goalIdx].r + 2, 14, 24);
  planets[goalIdx].mass = Math.max(planets[goalIdx].mass, 1100);

  return planets;
}

function makeLevel(id) {
  const params = buildParams(id);
  const planets = generatePlanets(id);
  // Start away from the center to promote slings
  const start = spawnPoint(planets.map(p => ({ x: p.x, y: p.y })));
  const lvl = {
    id,
    name: levelName(id),
    params,
    start: { x: +start.x.toFixed(2), y: +start.y.toFixed(2) },
    targetIndex: planets.length - 1,
    planets
  };
  const col = makeCollectibles(id, planets);
  if (col.length) lvl.collectibles = col;
  return lvl;
}

function levelName(id) {
  const pool = [
    'Sling Path', 'Twin Pull', 'Tri Mesh', 'Star Skim', 'Corridor', 'Relay', 'Spiral Drift', 'Grav Garden',
    'Switchbacks', 'Orbit Chicane', 'Pendulum', 'Echo Orbits', 'Binary Dance', 'Rings', 'Maze Lane', 'Edge Line'
  ];
  return pool[(id + 3) % pool.length] + ' ' + id;
}

function main() {
  if (!fs.existsSync(LEVELS_PATH)) {
    console.error('levels.json not found at', LEVELS_PATH);
    process.exit(1);
  }
  const raw = fs.readFileSync(LEVELS_PATH, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) {
    console.error('Invalid JSON in levels.json');
    throw e;
  }
  if (!Array.isArray(data.levels)) {
    console.error('levels.json missing levels array');
    process.exit(1);
  }
  const curMax = data.levels.reduce((m, l) => Math.max(m, l.id || 0), 0);
  if (curMax >= TARGET_COUNT) {
    console.log('Already has', curMax, 'levels, no action.');
    return;
  }

  // Backup
  const backupPath = LEVELS_PATH.replace(/levels\.json$/, `levels.backup.${Date.now()}.json`);
  fs.writeFileSync(backupPath, raw);
  console.log('Backup created:', backupPath);

  const toCreate = [];
  for (let id = curMax + 1; id <= TARGET_COUNT; id++) {
    const lvl = makeLevel(id);
    toCreate.push(lvl);
  }
  data.levels.push(...toCreate);

  // Final pass: ensure all targetIndex values are last planet
  for (const l of data.levels) {
    if (Array.isArray(l.planets)) {
      l.targetIndex = l.planets.length - 1;
    }
  }

  fs.writeFileSync(LEVELS_PATH, JSON.stringify(data, null, 2));
  console.log(`Appended ${toCreate.length} levels. Total now: ${data.levels.length}`);
}

main();
