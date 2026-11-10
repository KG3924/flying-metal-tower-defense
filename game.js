/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FLYING METAL TOWER DEFENSE — Future Warfare Edition
 *  Sci-fi tower defense inspired by Bloons TD
 *  Pure HTML5 Canvas + vanilla JavaScript — no dependencies
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  HOW TO PLAY
 *  ───────────
 *  1. Place towers on terrain beside the transit lane (not on the lane).
 *  2. Press START WAVE (or Space) to release the next hostile column.
 *  3. Earn credits from kills; spend on towers & upgrades. Survive 50 waves.
 *  4. Special structures: Force Fields, Teleporters, Rovers, Drone Hives, Mech Bays.
 *  5. Leaked hostiles damage Core Integrity. Game over at 0.
 *
 *  CONTROLS
 *  ────────
 *  1–9 / 0   Select tower type (10 arsenal slots)
 *  Esc       Cancel placement / deselect
 *  Space     Start wave  OR  Pause/Resume
 *  S         Speed 1× / 2×
 *  M         Mute
 *  R         Toggle all range circles
 *
 *  COUNTERS (decisions matter)
 *  ───────────────────────────
 *  • Kinetic shreds unarmored flesh/bots; weak vs armor & shields.
 *  • Plasma melts ENERGY SHIELDS and barriers.
 *  • Missiles/explosives crack heavy armor.
 *  • Rail pierces single high-value targets (hits air).
 *  • AA / Point Defense is mandatory for drone swarms.
 *  • Force Fields slow & strip shields — heavies resist.
 *  • Teleporters send units BACK along the path — bosses & phase units immune.
 *  • Rovers patrol the lane; great coverage, fragile placement choices.
 *  • Hives & Mech Bays spend upkeep-like deploy cooldowns for mobile DPS.
 *
 *  Open index.html in any modern browser. No build step required.
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use strict";

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  logicalW: 960,
  logicalH: 640,
  startCredits: 550,
  startIntegrity: 100,
  totalWaves: 50,
  sellRefund: 0.65,
  pathWidth: 36,
  placementPadding: 22,
  towerPlaceRadius: 18,
  maxParticles: 320,
  maxProjectiles: 220,
  maxFloatingText: 48,
  maxAllies: 40,
  roverPathOffset: 42, // distance off-lane for roving platforms
};

// Pulse Turret pixel sprite (assets/pulse-turret.png). Native 16×16.
// The barrel sits on the right edge of the image (+X). Canvas aim angle 0 is
// also +X, and the old procedural barrel was drawn toward +X, so aiming uses
// tower.angle with no extra rotation. Change the offset (radians) if the art
// faces a different direction.
const PULSE_SPRITE_SRC = "assets/pulse-turret.png";
const PULSE_SPRITE_AIM_OFFSET = 0;
const PULSE_SPRITE_DRAW_SIZE = 32; // 16×16 ×2, nearest-neighbor

const STATE = {
  MENU: "menu",
  PLAYING: "playing",
  INTERMISSION: "intermission",
  PAUSED: "paused",
  GAME_OVER: "game_over",
  VICTORY: "victory",
};

const DMG = {
  KINETIC: "kinetic",
  PLASMA: "plasma",
  EXPLOSIVE: "explosive",
  RAIL: "rail",
  AA: "aa",
  ENERGY: "energy", // force fields, beams
};

// ═══════════════════════════════════════════════════════════════════════════
//  PATH
// ═══════════════════════════════════════════════════════════════════════════

const PATH = [
  { x: -20, y: 120 },
  { x: 160, y: 120 },
  { x: 160, y: 280 },
  { x: 340, y: 280 },
  { x: 340, y: 100 },
  { x: 520, y: 100 },
  { x: 520, y: 380 },
  { x: 200, y: 380 },
  { x: 200, y: 520 },
  { x: 480, y: 520 },
  { x: 480, y: 440 },
  { x: 720, y: 440 },
  { x: 720, y: 200 },
  { x: 880, y: 200 },
  { x: 880, y: 560 },
  { x: 980, y: 560 },
];

const PATH_DATA = (() => {
  const segs = [];
  let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { segs, total };
})();

function pathPointAt(dist) {
  if (dist <= 0) return { x: PATH[0].x, y: PATH[0].y, angle: 0 };
  if (dist >= PATH_DATA.total) {
    const last = PATH[PATH.length - 1];
    const prev = PATH[PATH.length - 2];
    return {
      x: last.x,
      y: last.y,
      angle: Math.atan2(last.y - prev.y, last.x - prev.x),
    };
  }
  for (const seg of PATH_DATA.segs) {
    if (dist <= seg.start + seg.len) {
      const t = (dist - seg.start) / seg.len;
      return {
        x: seg.a.x + (seg.b.x - seg.a.x) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t,
        angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x),
      };
    }
  }
  return { x: PATH[0].x, y: PATH[0].y, angle: 0 };
}

/** Point offset perpendicular to path direction (for rovers). */
function pathPointOffset(dist, offset) {
  const p = pathPointAt(dist);
  const nx = -Math.sin(p.angle);
  const ny = Math.cos(p.angle);
  return { x: p.x + nx * offset, y: p.y + ny * offset, angle: p.angle };
}

function distToPath(px, py) {
  let min = Infinity;
  for (const seg of PATH_DATA.segs) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - seg.a.x) * dx + (py - seg.a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = seg.a.x + t * dx;
    const cy = seg.a.y + t * dy;
    min = Math.min(min, Math.hypot(px - cx, py - cy));
  }
  return min;
}

/** Closest path distance (progress along path) for a world point. */
function nearestPathDist(px, py) {
  let best = 0;
  let min = Infinity;
  for (const seg of PATH_DATA.segs) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - seg.a.x) * dx + (py - seg.a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = seg.a.x + t * dx;
    const cy = seg.a.y + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < min) {
      min = d;
      best = seg.start + t * seg.len;
    }
  }
  return { dist: best, separation: min };
}

function isValidPlacement(x, y, towers, typeId = null, ignoreId = null) {
  if (x < 20 || y < 20 || x > CONFIG.logicalW - 20 || y > CONFIG.logicalH - 20) {
    return false;
  }
  const def = typeId ? TOWER_TYPES[typeId] : null;
  const near = nearestPathDist(x, y);

  // Rovers must be near the lane (they snap onto a patrol rail)
  if (def && def.behavior === "rover") {
    if (near.separation > 70 || near.separation < CONFIG.pathWidth / 2 + 8) return false;
  } else {
    if (distToPath(x, y) < CONFIG.pathWidth / 2 + CONFIG.placementPadding) return false;
  }

  const base = PATH[PATH.length - 1];
  if (Math.hypot(x - (base.x - 40), y - base.y) < 55) return false;

  for (const t of towers) {
    if (ignoreId !== null && t.id === ignoreId) continue;
    if (Math.hypot(x - t.x, y - t.y) < CONFIG.towerPlaceRadius * 2 + 4) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ENEMIES — futuristic hostiles (data-driven)
//  armor: kinetic mult (low = resistant)
//  shield: energy barrier; plasma/energy shreds it; kinetic weak vs shield
//  teleportImmune / fieldResist: counter special towers
// ═══════════════════════════════════════════════════════════════════════════

const ENEMY_TYPES = {
  // ── Early swarm ──
  grunt: {
    id: "grunt",
    name: "Raider Grunt",
    hp: 14,
    shield: 0,
    speed: 72,
    reward: 6,
    leak: 1,
    radius: 8,
    armor: 1.0,
    flying: false,
    color: "#5a8a6a",
    accent: "#9ad4a8",
    shape: "grunt",
    score: 8,
  },
  shielded: {
    id: "shielded",
    name: "Shield Troop",
    hp: 18,
    shield: 28,
    speed: 58,
    reward: 12,
    leak: 2,
    radius: 9,
    armor: 0.85,
    flying: false,
    color: "#4a7a9a",
    accent: "#66d4ff",
    shape: "grunt",
    score: 18,
  },
  scoutBot: {
    id: "scoutBot",
    name: "Scout Bot",
    hp: 22,
    shield: 0,
    speed: 105,
    reward: 10,
    leak: 2,
    radius: 9,
    armor: 0.9,
    flying: false,
    color: "#7a8a50",
    accent: "#c8e060",
    shape: "bot",
    score: 14,
  },
  assaultBot: {
    id: "assaultBot",
    name: "Assault Robot",
    hp: 70,
    shield: 15,
    speed: 48,
    reward: 22,
    leak: 4,
    radius: 12,
    armor: 0.45,
    flying: false,
    fieldResist: 0.5,
    color: "#5a6068",
    accent: "#ff6644",
    shape: "botHeavy",
    score: 35,
  },
  // ── Air ──
  swarmDrone: {
    id: "swarmDrone",
    name: "Swarm Drone",
    hp: 16,
    shield: 0,
    speed: 95,
    reward: 9,
    leak: 2,
    radius: 8,
    armor: 1.0,
    flying: true,
    color: "#6a7080",
    accent: "#aaccff",
    shape: "drone",
    score: 14,
  },
  gunship: {
    id: "gunship",
    name: "Gunship",
    hp: 95,
    shield: 40,
    speed: 62,
    reward: 38,
    leak: 7,
    radius: 15,
    armor: 0.7,
    flying: true,
    color: "#3a4a55",
    accent: "#44aaff",
    shape: "gunship",
    score: 55,
  },
  stealthDrone: {
    id: "stealthDrone",
    name: "Stealth Drone",
    hp: 36,
    shield: 10,
    speed: 110,
    reward: 24,
    leak: 4,
    radius: 9,
    armor: 0.95,
    flying: true,
    stealth: true,
    color: "#4a5568",
    accent: "#8899bb",
    shape: "drone",
    score: 40,
  },
  // ── Vehicles / heavy ──
  hoverbike: {
    id: "hoverbike",
    name: "Hoverbike",
    hp: 40,
    shield: 0,
    speed: 118,
    reward: 16,
    leak: 3,
    radius: 11,
    armor: 0.8,
    flying: false,
    color: "#6b5a8a",
    accent: "#d4a0ff",
    shape: "hover",
    score: 22,
  },
  carrier: {
    id: "carrier",
    name: "Troop Carrier",
    hp: 110,
    shield: 20,
    speed: 42,
    reward: 40,
    leak: 6,
    radius: 16,
    armor: 0.55,
    flying: false,
    color: "#4a5550",
    accent: "#88aa99",
    shape: "carrier",
    score: 50,
    children: [
      { type: "grunt", count: 3 },
      { type: "scoutBot", count: 2 },
    ],
  },
  siegeTank: {
    id: "siegeTank",
    name: "Siege Walker",
    hp: 320,
    shield: 50,
    speed: 28,
    reward: 75,
    leak: 10,
    radius: 17,
    armor: 0.25,
    flying: false,
    teleportImmune: true,
    fieldResist: 0.7,
    color: "#3a4a38",
    accent: "#c44536",
    shape: "walker",
    score: 110,
  },
  plasmaArtillery: {
    id: "plasmaArtillery",
    name: "Plasma Artillery",
    hp: 140,
    shield: 30,
    speed: 36,
    reward: 55,
    leak: 14,
    radius: 14,
    armor: 0.5,
    flying: false,
    color: "#5a3858",
    accent: "#ff44cc",
    shape: "artillery",
    score: 80,
  },
  // ── Special ──
  phaseRunner: {
    id: "phaseRunner",
    name: "Phase Runner",
    hp: 45,
    shield: 0,
    speed: 88,
    reward: 28,
    leak: 5,
    radius: 10,
    armor: 0.9,
    flying: false,
    teleportImmune: true, // already phases — can't shove them
    phaseChance: 0.35, // chance to ignore a hit
    color: "#4a3a6a",
    accent: "#c080ff",
    shape: "phase",
    score: 45,
  },
  shieldBearer: {
    id: "shieldBearer",
    name: "Shield Bearer",
    hp: 80,
    shield: 120,
    speed: 40,
    reward: 48,
    leak: 6,
    radius: 14,
    armor: 0.6,
    flying: false,
    fieldResist: 0.3,
    color: "#3a5a7a",
    accent: "#00e0ff",
    shape: "bearer",
    score: 70,
  },
  eliteMech: {
    id: "eliteMech",
    name: "Elite Mech",
    hp: 200,
    shield: 60,
    speed: 44,
    reward: 65,
    leak: 8,
    radius: 13,
    armor: 0.35,
    flying: false,
    fieldResist: 0.4,
    color: "#2a3a4a",
    accent: "#ffaa33",
    shape: "botHeavy",
    score: 95,
  },
  // ── Bosses ──
  colossus: {
    id: "colossus",
    name: "Colossus",
    hp: 1400,
    shield: 200,
    speed: 18,
    reward: 400,
    leak: 28,
    radius: 24,
    armor: 0.18,
    flying: false,
    teleportImmune: true,
    fieldResist: 0.85,
    color: "#2a3530",
    accent: "#ff3344",
    shape: "colossus",
    score: 600,
  },
  mothership: {
    id: "mothership",
    name: "Drone Mothership",
    hp: 700,
    shield: 180,
    speed: 24,
    reward: 280,
    leak: 20,
    radius: 20,
    armor: 0.4,
    flying: true,
    teleportImmune: true,
    color: "#2a3040",
    accent: "#66aaff",
    shape: "mothership",
    score: 400,
    children: [
      { type: "swarmDrone", count: 8 },
      { type: "stealthDrone", count: 3 },
    ],
  },
  commandNode: {
    id: "commandNode",
    name: "Command Node",
    hp: 550,
    shield: 100,
    speed: 26,
    reward: 220,
    leak: 16,
    radius: 18,
    armor: 0.4,
    flying: false,
    teleportImmune: true,
    color: "#2a3a45",
    accent: "#44ffcc",
    shape: "command",
    score: 320,
    children: [
      { type: "eliteMech", count: 2 },
      { type: "assaultBot", count: 3 },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  TOWERS — 10 futuristic defenses, 3 upgrade paths each
//  behavior: standard | force | teleport | rover | hive | mech
// ═══════════════════════════════════════════════════════════════════════════

const TOWER_TYPES = {
  pulse: {
    id: "pulse",
    name: "Pulse Turret",
    short: "Pulse",
    cost: 140,
    range: 105,
    fireRate: 5.0,
    damage: 3.5,
    projectileSpeed: 450,
    dmgType: DMG.KINETIC,
    canHitFlying: false,
    splash: 0,
    pierce: 1,
    color: "#6bdf8a",
    icon: "▣",
    desc: "Fast kinetic. Weak vs shields.",
    targeting: "first",
    behavior: "standard",
    upgrades: {
      A: [
        { name: "Overclock", cost: 110, desc: "+45% fire rate", apply: (t) => { t.fireRate *= 1.45; } },
        { name: "Tri-Barrel", cost: 260, desc: "+rate, +1 pierce", apply: (t) => { t.fireRate *= 1.5; t.pierce += 1; } },
        { name: "Gatling Core", cost: 520, desc: "Blazing ROF + dmg", apply: (t) => { t.fireRate *= 1.55; t.damage += 3; t.pierce += 1; } },
      ],
      B: [
        { name: "AP Slugs", cost: 130, desc: "Better vs armor", apply: (t) => { t.armorShred = 0.3; t.damage += 2; } },
        { name: "Stabilizer", cost: 280, desc: "+range +dmg", apply: (t) => { t.range += 30; t.damage += 4; } },
        { name: "Shredder", cost: 480, desc: "Anti-bot bonus", apply: (t) => { t.damage += 7; t.botBonus = 1.6; } },
      ],
      C: [
        { name: "Sensor Suite", cost: 100, desc: "+range, detect stealth", apply: (t) => { t.range += 25; t.detectStealth = true; } },
        { name: "Suppression", cost: 240, desc: "Slow 22%", apply: (t) => { t.slow = 0.22; t.slowDuration = 1.0; } },
        { name: "Split Fire", cost: 460, desc: "Hit 2 targets", apply: (t) => { t.multiTarget = 2; } },
      ],
    },
  },

  plasma: {
    id: "plasma",
    name: "Plasma Blaster",
    short: "Plasma",
    cost: 280,
    range: 120,
    fireRate: 1.4,
    damage: 22,
    projectileSpeed: 420,
    dmgType: DMG.PLASMA,
    canHitFlying: true,
    splash: 18,
    pierce: 1,
    homing: true, // energy bolts track — misses were a bug, not a feature
    color: "#44ddff",
    icon: "◈",
    desc: "Melts shields. Solid vs everything.",
    targeting: "strong",
    behavior: "standard",
    upgrades: {
      A: [
        { name: "Hot Coil", cost: 180, desc: "+dmg, +splash", apply: (t) => { t.damage += 14; t.splash += 10; } },
        { name: "Plasma Storm", cost: 400, desc: "Large splash", apply: (t) => { t.splash += 22; t.damage += 12; } },
        { name: "Star Core", cost: 780, desc: "Massive plasma burst", apply: (t) => { t.splash += 28; t.damage += 40; } },
      ],
      B: [
        { name: "Fast Cycle", cost: 160, desc: "+40% fire rate", apply: (t) => { t.fireRate *= 1.4; } },
        { name: "Twin Stream", cost: 380, desc: "Dual target", apply: (t) => { t.fireRate *= 1.25; t.multiTarget = 2; } },
        { name: "Cascade", cost: 720, desc: "Rapid plasma", apply: (t) => { t.fireRate *= 1.7; t.damage += 8; } },
      ],
      C: [
        { name: "Shield Sap", cost: 200, desc: "Bonus vs shields", apply: (t) => { t.shieldBonus = 2.0; t.damage += 6; } },
        { name: "Ion Burn", cost: 420, desc: "Burn DoT", apply: (t) => { t.burn = 10; t.burnDuration = 2.5; } },
        { name: "Disruptor", cost: 800, desc: "Stun + shield crush", apply: (t) => { t.stun = 0.45; t.shieldBonus = 2.5; t.damage += 20; } },
      ],
    },
  },

  missile: {
    id: "missile",
    name: "Missile Pod",
    short: "Missile",
    cost: 320,
    range: 135,
    fireRate: 0.65,
    damage: 48,
    projectileSpeed: 260,
    dmgType: DMG.EXPLOSIVE,
    canHitFlying: false,
    splash: 30,
    pierce: 1,
    color: "#ff6644",
    icon: "➹",
    desc: "Anti-armor explosives. Splash.",
    targeting: "strong",
    behavior: "standard",
    upgrades: {
      A: [
        { name: "HE Tips", cost: 200, desc: "+dmg +splash", apply: (t) => { t.damage += 22; t.splash += 12; } },
        { name: "Cluster", cost: 440, desc: "Wide splash", apply: (t) => { t.splash += 28; t.damage += 18; } },
        { name: "Thermobaric", cost: 820, desc: "Huge AoE", apply: (t) => { t.splash += 32; t.damage += 55; } },
      ],
      B: [
        { name: "Quick Rack", cost: 180, desc: "+40% rate", apply: (t) => { t.fireRate *= 1.4; } },
        { name: "Dual Pod", cost: 400, desc: "2 targets", apply: (t) => { t.fireRate *= 1.25; t.multiTarget = 2; } },
        { name: "MLRS", cost: 760, desc: "Barrage mode", apply: (t) => { t.fireRate *= 1.85; t.damage += 12; } },
      ],
      C: [
        { name: "Lock-On", cost: 170, desc: "+range, homing", apply: (t) => { t.range += 40; t.homing = true; } },
        { name: "Tandem", cost: 400, desc: "Armor shred", apply: (t) => { t.armorShred = 0.55; t.damage += 28; } },
        { name: "Bunker Buster", cost: 750, desc: "Devastates walkers", apply: (t) => { t.damage += 85; t.heavyBonus = 1.9; t.armorShred = 0.65; } },
      ],
    },
  },

  rail: {
    id: "rail",
    name: "Rail Sniper",
    short: "Rail",
    cost: 420,
    range: 230,
    fireRate: 0.5,
    damage: 62,
    projectileSpeed: 1000,
    dmgType: DMG.RAIL,
    canHitFlying: true,
    splash: 0,
    pierce: 1,
    color: "#88aaff",
    icon: "◎",
    desc: "Long-range pierce. High ST dmg.",
    targeting: "strong",
    behavior: "standard",
    upgrades: {
      A: [
        { name: "Capacitor", cost: 260, desc: "+dmg, armor shred", apply: (t) => { t.damage += 35; t.armorShred = 0.35; } },
        { name: "Heavy Coil", cost: 520, desc: "Huge ST dmg", apply: (t) => { t.damage += 70; t.armorShred = 0.5; } },
        { name: "Singularity", cost: 1050, desc: "Extreme dmg, pierce 3", apply: (t) => { t.damage += 110; t.pierce = 3; } },
      ],
      B: [
        { name: "Scope AI", cost: 190, desc: "+range, stealth detect", apply: (t) => { t.range += 55; t.detectStealth = true; } },
        { name: "Semi-Auto", cost: 440, desc: "+fire rate", apply: (t) => { t.fireRate *= 1.75; } },
        { name: "Crit Matrix", cost: 800, desc: "Crits + rate", apply: (t) => { t.fireRate *= 1.35; t.critChance = 0.28; t.critMult = 2.6; } },
      ],
      C: [
        { name: "Cryo Tip", cost: 210, desc: "Slow on hit", apply: (t) => { t.slow = 0.35; t.slowDuration = 2; } },
        { name: "Mark Target", cost: 460, desc: "Marked take +25% dmg", apply: (t) => { t.mark = 0.25; t.markDuration = 3; } },
        { name: "Execute", cost: 880, desc: "Finish low-HP units", apply: (t) => { t.executePct = 0.18; t.damage += 45; } },
      ],
    },
  },

  aa: {
    id: "aa",
    name: "AA Point Defense",
    short: "AA",
    cost: 340,
    range: 155,
    fireRate: 2.4,
    damage: 20,
    projectileSpeed: 520,
    dmgType: DMG.AA,
    canHitFlying: true,
    airOnly: true,
    splash: 0,
    pierce: 1,
    color: "#a0b0c8",
    icon: "✈",
    desc: "Air only. Mandatory vs drones.",
    targeting: "first",
    behavior: "standard",
    upgrades: {
      A: [
        { name: "Flak", cost: 190, desc: "Splash vs air", apply: (t) => { t.splash = 28; t.damage += 8; } },
        { name: "Proximity", cost: 400, desc: "Larger flak", apply: (t) => { t.splash += 24; t.damage += 14; } },
        { name: "Skyfire", cost: 740, desc: "AA storm", apply: (t) => { t.splash += 28; t.damage += 32; t.fireRate *= 1.3; } },
      ],
      B: [
        { name: "Radar", cost: 150, desc: "+range, stealth", apply: (t) => { t.range += 50; t.detectStealth = true; } },
        { name: "Twin Mount", cost: 380, desc: "+rate, multi", apply: (t) => { t.fireRate *= 1.55; t.multiTarget = 2; } },
        { name: "CIWS", cost: 720, desc: "Point-defense wall", apply: (t) => { t.fireRate *= 2.1; t.multiTarget = 3; t.damage += 8; } },
      ],
      C: [
        { name: "SAM Lock", cost: 220, desc: "Homing missiles", apply: (t) => { t.homing = true; t.damage += 16; } },
        { name: "Interceptor", cost: 480, desc: "High dmg SAM", apply: (t) => { t.damage += 42; t.homing = true; } },
        { name: "Patriot", cost: 920, desc: "Execute light air", apply: (t) => { t.damage += 75; t.executePct = 0.28; t.homing = true; } },
      ],
    },
  },

  mortar: {
    id: "mortar",
    name: "Arc Mortar",
    short: "Mortar",
    cost: 400,
    range: 175,
    fireRate: 0.38,
    damage: 32,
    projectileSpeed: 190,
    dmgType: DMG.EXPLOSIVE,
    canHitFlying: false,
    splash: 48,
    pierce: 1,
    arcing: true,
    color: "#c8a050",
    icon: "◉",
    desc: "Arcing AoE. Slow but brutal.",
    targeting: "close",
    behavior: "standard",
    upgrades: {
      A: [
        { name: "HE Shells", cost: 210, desc: "+dmg +splash", apply: (t) => { t.damage += 18; t.splash += 14; } },
        { name: "Napalm", cost: 460, desc: "Burn in zone", apply: (t) => { t.burn = 12; t.burnDuration = 3; t.damage += 10; } },
        { name: "Fusion Shell", cost: 900, desc: "Heavy burn + splash", apply: (t) => { t.burn = 20; t.burnDuration = 4; t.splash += 22; t.damage += 28; } },
      ],
      B: [
        { name: "Loader", cost: 190, desc: "+fire rate", apply: (t) => { t.fireRate *= 1.5; } },
        { name: "Long Barrel", cost: 440, desc: "+range +rate", apply: (t) => { t.range += 50; t.fireRate *= 1.3; } },
        { name: "Battery", cost: 840, desc: "Rapid arcs", apply: (t) => { t.fireRate *= 1.85; t.damage += 14; } },
      ],
      C: [
        { name: "Concussive", cost: 240, desc: "Stun on hit", apply: (t) => { t.stun = 0.55; } },
        { name: "Shockwave", cost: 500, desc: "Long stun + shred", apply: (t) => { t.stun = 1.0; t.armorShred = 0.25; } },
        { name: "Quake", cost: 960, desc: "Mass CC", apply: (t) => { t.stun = 1.4; t.armorShred = 0.4; t.splash += 18; } },
      ],
    },
  },

  // ── SPECIAL STRUCTURES ──
  force: {
    id: "force",
    name: "Force Field",
    short: "Field",
    cost: 380,
    range: 95,
    fireRate: 0, // aura
    damage: 6, // DPS to shields / light
    projectileSpeed: 0,
    dmgType: DMG.ENERGY,
    canHitFlying: true,
    splash: 0,
    pierce: 1,
    color: "#66ffcc",
    icon: "⬡",
    desc: "Aura: slow + shield drain. Heavies resist.",
    targeting: "first",
    behavior: "force",
    upgrades: {
      A: [
        { name: "Wider Field", cost: 200, desc: "+range", apply: (t) => { t.range += 30; } },
        { name: "Deep Field", cost: 420, desc: "+range + slow", apply: (t) => { t.range += 25; t.fieldSlow = Math.min(0.7, (t.fieldSlow || 0.3) + 0.15); } },
        { name: "Dome", cost: 800, desc: "Huge control zone", apply: (t) => { t.range += 40; t.fieldSlow = 0.55; } },
      ],
      B: [
        { name: "Drain Amp", cost: 220, desc: "+shield DPS", apply: (t) => { t.damage += 8; t.shieldBonus = 1.5; } },
        { name: "Plasma Mesh", cost: 460, desc: "Damages HP too", apply: (t) => { t.damage += 10; t.fieldHurtHp = true; } },
        { name: "Annihilator", cost: 880, desc: "High aura DPS", apply: (t) => { t.damage += 18; t.fieldHurtHp = true; t.shieldBonus = 2; } },
      ],
      C: [
        { name: "Stasis Pulse", cost: 250, desc: "Brief stun ticks", apply: (t) => { t.fieldStun = 0.15; t.fieldStunCd = 2.5; } },
        { name: "Gravity Well", cost: 520, desc: "Stronger slow + pushback", apply: (t) => { t.fieldSlow = Math.min(0.65, (t.fieldSlow || 0.3) + 0.2); t.fieldPush = 18; } },
        { name: "Null Zone", cost: 980, desc: "Strip stealth, hard CC", apply: (t) => { t.detectStealth = true; t.fieldStun = 0.35; t.fieldStunCd = 1.8; t.fieldSlow = 0.5; } },
      ],
    },
  },

  teleport: {
    id: "teleport",
    name: "Teleport Station",
    short: "Teleport",
    cost: 500,
    range: 110,
    fireRate: 0.35, // teleports per second (base slow)
    damage: 0,
    projectileSpeed: 0,
    dmgType: DMG.ENERGY,
    canHitFlying: true,
    splash: 0,
    pierce: 1,
    color: "#c080ff",
    icon: "↯",
    desc: "Sends hostiles BACK along path. Bosses immune.",
    targeting: "first",
    behavior: "teleport",
    teleportDist: 140,
    upgrades: {
      A: [
        { name: "Long Jump", cost: 280, desc: "+teleport distance", apply: (t) => { t.teleportDist += 70; } },
        { name: "Deep Recall", cost: 560, desc: "Far displacement", apply: (t) => { t.teleportDist += 100; } },
        { name: "Exile Gate", cost: 1100, desc: "Massive shove back", apply: (t) => { t.teleportDist += 140; } },
      ],
      B: [
        { name: "Fast Cycle", cost: 240, desc: "+teleport rate", apply: (t) => { t.fireRate *= 1.5; } },
        { name: "Twin Gate", cost: 500, desc: "2 targets / pulse", apply: (t) => { t.fireRate *= 1.25; t.multiTarget = 2; } },
        { name: "Rift Storm", cost: 980, desc: "Rapid multi-gate", apply: (t) => { t.fireRate *= 1.6; t.multiTarget = 3; } },
      ],
      C: [
        { name: "Rift Burn", cost: 260, desc: "Damage on teleport", apply: (t) => { t.damage = 25; t.dmgType = DMG.PLASMA; } },
        { name: "Disorient", cost: 520, desc: "Stun after blink", apply: (t) => { t.stun = 0.8; t.damage = Math.max(t.damage, 20); } },
        { name: "Phase Trap", cost: 1000, desc: "Can hit phase runners", apply: (t) => { t.bypassTeleportImmune = true; t.damage = Math.max(t.damage, 40); t.stun = 1.0; } },
      ],
    },
  },

  rover: {
    id: "rover",
    name: "Roving Platform",
    short: "Rover",
    cost: 360,
    range: 100,
    fireRate: 2.2,
    damage: 10,
    projectileSpeed: 400,
    dmgType: DMG.KINETIC,
    canHitFlying: true,
    splash: 0,
    pierce: 1,
    color: "#ffaa44",
    icon: "⬢",
    desc: "Patrols the lane. Place near path.",
    targeting: "first",
    behavior: "rover",
    roverSpeed: 55,
    upgrades: {
      A: [
        { name: "Servo Motors", cost: 180, desc: "+patrol speed", apply: (t) => { t.roverSpeed *= 1.4; } },
        { name: "Turbo Rail", cost: 380, desc: "Fast patrol", apply: (t) => { t.roverSpeed *= 1.5; t.range += 15; } },
        { name: "Blink Drive", cost: 700, desc: "Very fast + range", apply: (t) => { t.roverSpeed *= 1.5; t.range += 25; t.fireRate *= 1.2; } },
      ],
      B: [
        { name: "Pulse Guns", cost: 200, desc: "+dmg +rate", apply: (t) => { t.damage += 6; t.fireRate *= 1.3; } },
        { name: "Plasma Mount", cost: 440, desc: "Plasma rounds", apply: (t) => { t.dmgType = DMG.PLASMA; t.damage += 10; t.splash = 12; } },
        { name: "Assault Rig", cost: 820, desc: "Heavy mobile DPS", apply: (t) => { t.damage += 18; t.fireRate *= 1.4; t.multiTarget = 2; } },
      ],
      C: [
        { name: "AA Array", cost: 220, desc: "Bonus vs air", apply: (t) => { t.airBonus = 1.8; t.detectStealth = true; } },
        { name: "Wide Sweep", cost: 460, desc: "+range, multi", apply: (t) => { t.range += 35; t.multiTarget = 2; } },
        { name: "Hunter AI", cost: 860, desc: "Homing + execute", apply: (t) => { t.homing = true; t.executePct = 0.12; t.damage += 12; } },
      ],
    },
  },

  hive: {
    id: "hive",
    name: "Drone Hive",
    short: "Hive",
    cost: 450,
    range: 160,
    fireRate: 0.9, // deploy rate
    damage: 8, // per drone hit
    projectileSpeed: 180,
    dmgType: DMG.KINETIC,
    canHitFlying: true,
    splash: 0,
    pierce: 1,
    color: "#70c0ff",
    icon: "⬡",
    desc: "Launches attack drones. Soft air cover.",
    targeting: "first",
    behavior: "hive",
    maxDrones: 4,
    droneLife: 6,
    upgrades: {
      A: [
        { name: "Larger Swarm", cost: 240, desc: "+max drones", apply: (t) => { t.maxDrones += 2; } },
        { name: "Hive Mind", cost: 500, desc: "+2 drones, +life", apply: (t) => { t.maxDrones += 2; t.droneLife += 3; } },
        { name: "Cloud", cost: 950, desc: "Big swarm", apply: (t) => { t.maxDrones += 3; t.droneLife += 3; t.fireRate *= 1.3; } },
      ],
      B: [
        { name: "Armed Drones", cost: 220, desc: "+drone damage", apply: (t) => { t.damage += 6; } },
        { name: "Plasma Drones", cost: 480, desc: "Plasma + dmg", apply: (t) => { t.dmgType = DMG.PLASMA; t.damage += 8; t.shieldBonus = 1.4; } },
        { name: "Kamikaze", cost: 900, desc: "High dmg drones", apply: (t) => { t.damage += 16; t.droneLife += 2; t.splash = 20; } },
      ],
      C: [
        { name: "Interceptor AI", cost: 200, desc: "Prioritize air", apply: (t) => { t.airBonus = 1.6; t.detectStealth = true; } },
        { name: "Fast Fab", cost: 450, desc: "+deploy rate", apply: (t) => { t.fireRate *= 1.7; } },
        { name: "Net Link", cost: 880, desc: "Slow on hit + multi", apply: (t) => { t.slow = 0.25; t.slowDuration = 1.2; t.fireRate *= 1.3; } },
      ],
    },
  },

  mech: {
    id: "mech",
    name: "Mech Bay",
    short: "Mech",
    cost: 480,
    range: 140,
    fireRate: 0.35, // deploy rate
    damage: 18,
    projectileSpeed: 0,
    dmgType: DMG.KINETIC,
    canHitFlying: false,
    splash: 0,
    pierce: 1,
    color: "#d08050",
    icon: "⚒",
    desc: "Deploys combat mechs onto the lane.",
    targeting: "first",
    behavior: "mech",
    maxMechs: 2,
    mechLife: 12,
    mechHp: 80,
    upgrades: {
      A: [
        { name: "Assembly Line", cost: 260, desc: "+max mechs", apply: (t) => { t.maxMechs += 1; } },
        { name: "Platoon", cost: 540, desc: "+1 mech, +life", apply: (t) => { t.maxMechs += 1; t.mechLife += 5; } },
        { name: "Battalion", cost: 1000, desc: "3+ mechs", apply: (t) => { t.maxMechs += 1; t.mechLife += 5; t.fireRate *= 1.3; } },
      ],
      B: [
        { name: "Armor Plate", cost: 240, desc: "+mech HP", apply: (t) => { t.mechHp += 50; } },
        { name: "Assault Kit", cost: 500, desc: "+mech dmg +HP", apply: (t) => { t.damage += 12; t.mechHp += 40; } },
        { name: "Siege Frame", cost: 960, desc: "Tanky high dmg", apply: (t) => { t.damage += 22; t.mechHp += 80; t.armorShred = 0.3; } },
      ],
      C: [
        { name: "Plasma Arms", cost: 280, desc: "Plasma attacks", apply: (t) => { t.dmgType = DMG.PLASMA; t.shieldBonus = 1.5; } },
        { name: "Rocket Pods", cost: 520, desc: "Explosive splash", apply: (t) => { t.dmgType = DMG.EXPLOSIVE; t.splash = 24; t.damage += 10; } },
        { name: "Titan Link", cost: 1000, desc: "Heavy bonus + stun", apply: (t) => { t.heavyBonus = 1.5; t.stun = 0.4; t.damage += 15; } },
      ],
    },
  },
};

const TOWER_ORDER = [
  "pulse", "plasma", "missile", "rail", "aa",
  "mortar", "force", "teleport", "rover", "hive", "mech",
];

/** Longer help text for arsenal / intel panel */
const TOWER_HELP = {
  pulse: {
    blurb: "Cheap rapid-fire gun. Best early swarm clearer. Damage type is kinetic — great on bare HP, poor against energy shields and heavy armor.",
    goodVs: "Grunts · Scout bots · unarmored packs",
    weakVs: "Shields · Siege walkers · aircraft",
    placeTip: "Line several along tight path bends.",
  },
  plasma: {
    blurb: "Energy weapon that melts shields first, then HP. Hits air and ground. Your answer when the wave intel shows SHD tags.",
    goodVs: "Shield troops · Bearers · mixed armor",
    weakVs: "Very high armor without upgrades",
    placeTip: "Cover mid-path where shield units bunch up.",
  },
  missile: {
    blurb: "Slow, hard-hitting explosives with splash. Built to crack walkers, carriers, and bot clusters. Does not hit aircraft.",
    goodVs: "Walkers · Carriers · bot groups",
    weakVs: "Air · fast single runners",
    placeTip: "Place where path loops so splash hits multiple.",
  },
  rail: {
    blurb: "Long-range sniper. Huge single-target damage, hits air, and partially pierces shields. Ideal for elites and bosses.",
    goodVs: "Elites · bosses · gunships",
    weakVs: "Dense swarms (too slow alone)",
    placeTip: "Park in a corner with long sightlines.",
  },
  aa: {
    blurb: "Point defense — only fires at flying units. Without AA (or other air-capable towers), drone waves will leak hard.",
    goodVs: "Swarm drones · Gunships · Motherships",
    weakVs: "Everything on the ground (ignored)",
    placeTip: "Cover the whole lane; air can appear early (wave 5).",
  },
  mortar: {
    blurb: "Lobs shells in an arc for large area damage. Slow fire rate, excellent for packed ground groups on chokepoints.",
    goodVs: "Clumped infantry · bots on curves",
    weakVs: "Air · spread-out fast units",
    placeTip: "Aim range to cover a U-turn or bottleneck.",
  },
  force: {
    blurb: "Always-on field: slows enemies and drains shields inside the circle. Heavy units resist. Great support, not a solo DPS.",
    goodVs: "Shield packs · speeding swarms",
    weakVs: "Colossus / high field-resist heavies",
    placeTip: "Stack with plasma or missiles on the same bend.",
  },
  teleport: {
    blurb: "Utility structure. Each pulse sends the furthest enemy in range BACK along the path, buying time. Bosses and some specials are immune.",
    goodVs: "Stalling mid-tier units · emergency leaks",
    weakVs: "TP-IMM tags · over-reliance without DPS",
    placeTip: "Near the core as a last-line delay tool.",
  },
  rover: {
    blurb: "Mobile platform. Place beside the lane (not on it); it patrols automatically and shoots while moving. Covers long stretches.",
    goodVs: "Flexible coverage · mixed early threats",
    weakVs: "Needs upgrades for serious armor/air",
    placeTip: "Tap near the path edge — it snaps to a patrol rail.",
  },
  hive: {
    blurb: "Spawns attack drones that chase targets. Soft air coverage and extra DPS. Drones expire after a few seconds.",
    goodVs: "Air support · chasing stragglers",
    weakVs: "High-HP singles without upgrades",
    placeTip: "Central map so drones reach more of the path.",
  },
  mech: {
    blurb: "Deploys combat mechs onto the lane. Mechs walk the path and fight ground units in melee range. Temporary but tanky.",
    goodVs: "Ground pressure · soaking path space",
    weakVs: "Air (mechs can't hit flying)",
    placeTip: "Near busy path segments to intercept walkers.",
  },
};

function isCoarsePointer() {
  try {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 820;
  } catch (_) {
    return window.innerWidth <= 820;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  WAVES — harder early curve; mixed compositions force counters
// ═══════════════════════════════════════════════════════════════════════════

function buildWaves(total) {
  const waves = [];

  // Hand-tuned scripts: introduce threats early so single-strategy fails
  const scripts = {
    1: [
      { type: "grunt", count: 16, spacing: 0.38 },
    ],
    2: [
      { type: "grunt", count: 14, spacing: 0.32 },
      { type: "scoutBot", count: 6, spacing: 0.4 },
    ],
    3: [
      { type: "grunt", count: 12, spacing: 0.3 },
      { type: "shielded", count: 8, spacing: 0.45 }, // need plasma or patience
    ],
    4: [
      { type: "scoutBot", count: 10, spacing: 0.35 },
      { type: "hoverbike", count: 6, spacing: 0.4 },
      { type: "shielded", count: 6, spacing: 0.45 },
    ],
    5: [
      { type: "swarmDrone", count: 10, spacing: 0.35 }, // AA pressure early
      { type: "grunt", count: 14, spacing: 0.28 },
      { type: "scoutBot", count: 6, spacing: 0.35 },
    ],
    6: [
      { type: "assaultBot", count: 5, spacing: 0.65 },
      { type: "shielded", count: 10, spacing: 0.38 },
      { type: "swarmDrone", count: 8, spacing: 0.32 },
    ],
    7: [
      { type: "carrier", count: 2, spacing: 1.1 },
      { type: "hoverbike", count: 8, spacing: 0.35 },
      { type: "swarmDrone", count: 10, spacing: 0.3 },
    ],
    8: [
      { type: "gunship", count: 3, spacing: 0.9 },
      { type: "assaultBot", count: 6, spacing: 0.55 },
      { type: "shielded", count: 10, spacing: 0.35 },
    ],
    9: [
      { type: "siegeTank", count: 1, spacing: 0 },
      { type: "assaultBot", count: 6, spacing: 0.5 },
      { type: "swarmDrone", count: 12, spacing: 0.28 },
    ],
    10: [
      { type: "siegeTank", count: 2, spacing: 1.4 },
      { type: "phaseRunner", count: 6, spacing: 0.5 },
      { type: "gunship", count: 3, spacing: 0.75 },
      { type: "carrier", count: 2, spacing: 1.0 },
    ],
    11: [
      { type: "shieldBearer", count: 3, spacing: 1.0 },
      { type: "assaultBot", count: 8, spacing: 0.45 },
      { type: "stealthDrone", count: 6, spacing: 0.4 },
      { type: "hoverbike", count: 10, spacing: 0.3 },
    ],
    12: [
      { type: "plasmaArtillery", count: 3, spacing: 0.9 },
      { type: "siegeTank", count: 2, spacing: 1.2 },
      { type: "swarmDrone", count: 14, spacing: 0.25 },
      { type: "phaseRunner", count: 8, spacing: 0.4 },
    ],
    13: [
      { type: "eliteMech", count: 4, spacing: 0.7 },
      { type: "shieldBearer", count: 3, spacing: 0.9 },
      { type: "gunship", count: 4, spacing: 0.65 },
      { type: "carrier", count: 3, spacing: 0.85 },
    ],
    14: [
      { type: "commandNode", count: 1, spacing: 0 },
      { type: "siegeTank", count: 2, spacing: 1.0 },
      { type: "stealthDrone", count: 10, spacing: 0.32 },
      { type: "phaseRunner", count: 8, spacing: 0.38 },
    ],
    15: [
      { type: "mothership", count: 1, spacing: 0 },
      { type: "gunship", count: 4, spacing: 0.7 },
      { type: "shieldBearer", count: 4, spacing: 0.8 },
      { type: "assaultBot", count: 10, spacing: 0.4 },
    ],
    20: [
      { type: "colossus", count: 1, spacing: 0 },
      { type: "eliteMech", count: 6, spacing: 0.55 },
      { type: "gunship", count: 6, spacing: 0.55 },
      { type: "phaseRunner", count: 12, spacing: 0.32 },
    ],
    25: [
      { type: "mothership", count: 2, spacing: 2.5 },
      { type: "stealthDrone", count: 18, spacing: 0.22 },
      { type: "plasmaArtillery", count: 6, spacing: 0.7 },
      { type: "shieldBearer", count: 5, spacing: 0.7 },
    ],
    30: [
      { type: "colossus", count: 2, spacing: 3.0 },
      { type: "commandNode", count: 2, spacing: 2.0 },
      { type: "eliteMech", count: 10, spacing: 0.45 },
      { type: "gunship", count: 8, spacing: 0.45 },
    ],
    40: [
      { type: "colossus", count: 3, spacing: 2.5 },
      { type: "mothership", count: 2, spacing: 2.0 },
      { type: "plasmaArtillery", count: 10, spacing: 0.5 },
      { type: "stealthDrone", count: 24, spacing: 0.18 },
    ],
    50: [
      { type: "colossus", count: 4, spacing: 2.0 },
      { type: "mothership", count: 3, spacing: 1.8 },
      { type: "commandNode", count: 3, spacing: 1.5 },
      { type: "eliteMech", count: 16, spacing: 0.35 },
      { type: "phaseRunner", count: 20, spacing: 0.25 },
      { type: "stealthDrone", count: 30, spacing: 0.15 },
    ],
  };

  for (let w = 1; w <= total; w++) {
    const hpScale = 1 + (w - 1) * 0.1 + (w > 15 ? (w - 15) * 0.04 : 0);

    if (scripts[w]) {
      waves.push({
        number: w,
        groups: scripts[w],
        reward: 35 + w * 7,
        hpScale: w <= 15 ? 1 + (w - 1) * 0.06 : hpScale,
      });
      continue;
    }

    const groups = [];
    groups.push({
      type: "grunt",
      count: Math.floor(12 + w * 1.4),
      spacing: Math.max(0.18, 0.36 - w * 0.004),
    });
    groups.push({
      type: "scoutBot",
      count: Math.floor(4 + w * 0.45),
      spacing: 0.32,
    });
    if (w >= 3) {
      groups.push({ type: "shielded", count: Math.floor(4 + w * 0.5), spacing: 0.4 });
    }
    if (w >= 4) {
      groups.push({ type: "hoverbike", count: Math.floor(3 + w * 0.3), spacing: 0.35 });
    }
    if (w >= 5) {
      groups.push({
        type: "swarmDrone",
        count: Math.floor(6 + w * 0.45),
        spacing: Math.max(0.18, 0.32 - w * 0.003),
      });
    }
    if (w >= 6) {
      groups.push({ type: "assaultBot", count: Math.floor(3 + w * 0.28), spacing: 0.5 });
    }
    if (w >= 7 && w % 2 === 0) {
      groups.push({ type: "carrier", count: Math.floor(1 + w * 0.1), spacing: 0.9 });
    }
    if (w >= 8) {
      groups.push({ type: "gunship", count: Math.floor(2 + w * 0.15), spacing: 0.7 });
    }
    if (w >= 9 && w % 3 === 0) {
      groups.push({ type: "siegeTank", count: Math.floor(1 + (w - 9) * 0.12), spacing: 1.2 });
    }
    if (w >= 10) {
      groups.push({ type: "phaseRunner", count: Math.floor(3 + w * 0.2), spacing: 0.4 });
    }
    if (w >= 11) {
      groups.push({ type: "stealthDrone", count: Math.floor(3 + w * 0.22), spacing: 0.35 });
    }
    if (w >= 12 && w % 2 === 0) {
      groups.push({ type: "plasmaArtillery", count: Math.floor(1 + w * 0.1), spacing: 0.85 });
    }
    if (w >= 13) {
      groups.push({ type: "eliteMech", count: Math.floor(2 + w * 0.15), spacing: 0.55 });
    }
    if (w >= 14 && w % 4 === 0) {
      groups.push({ type: "shieldBearer", count: Math.floor(2 + w * 0.08), spacing: 0.9 });
    }

    waves.push({
      number: w,
      groups,
      reward: 30 + w * 8,
      hpScale,
    });
  }
  return waves;
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIO
// ═══════════════════════════════════════════════════════════════════════════

const AudioFX = {
  ctx: null,
  muted: false,
  master: null,

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (_) {
      this.ctx = null;
    }
  },
  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.22;
  },
  beep(freq, dur, type = "square", vol = 0.3) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur);
  },
  shot() { this.beep(200 + Math.random() * 60, 0.05, "square", 0.1); },
  plasma() { this.beep(420, 0.08, "sawtooth", 0.1); this.beep(280, 0.1, "sine", 0.08); },
  rocket() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.22);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.22);
  },
  explosion() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.sampleRate * 0.18;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    src.buffer = buf;
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  },
  teleport() { this.beep(600, 0.06, "sine", 0.15); this.beep(200, 0.12, "triangle", 0.12); },
  place() { this.beep(280, 0.07, "triangle", 0.15); this.beep(420, 0.09, "triangle", 0.12); },
  ui() { this.beep(520, 0.04, "sine", 0.1); },
  leak() { this.beep(90, 0.2, "sawtooth", 0.18); },
  wave() { this.beep(360, 0.08, "square", 0.12); this.beep(480, 0.1, "square", 0.1); },
};

// ═══════════════════════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════════════════════

let _nextId = 1;
const nextId = () => _nextId++;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// ═══════════════════════════════════════════════════════════════════════════
//  GAME
// ═══════════════════════════════════════════════════════════════════════════

class Game {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.state = STATE.MENU;
    this.credits = CONFIG.startCredits;
    this.integrity = CONFIG.startIntegrity;
    this.score = 0;
    this.waveIndex = 0;
    this.speed = 1;
    this.showAllRanges = false;

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.allies = []; // hive drones + mech bay units

    this.waves = buildWaves(CONFIG.totalWaves);
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveActive = false;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.hoverPos = { x: 0, y: 0 };
    /** Ghost placement awaiting confirm: { x, y, valid } or null */
    this.pendingPlace = null;
    this._touchPlacing = false;

    this.lastTime = 0;
    this.accum = 0;
    this.fixedDt = 1 / 60;
    this.time = 0;

    this.highWave = parseInt(localStorage.getItem("fmtd_highWave") || "0", 10);
    this.highScore = parseInt(localStorage.getItem("fmtd_highScore") || "0", 10);
    this.tutorialSeen = localStorage.getItem("fmtd_tutorial_v2") === "1";

    this._pulseSprite = new Image();
    this._pulseSpriteFailed = false;
    this._pulseSpriteCanvas = null;
    this._pulseSprite.addEventListener("error", () => {
      this._pulseSpriteFailed = true;
    });
    this._pulseSprite.src = PULSE_SPRITE_SRC;

    this._bindUI();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._buildTowerButtons();
    this._updateHUD();
    this._showMenu();
    requestAnimationFrame((t) => this._loop(t));
  }

  // ── Setup ──────────────────────────────────────────────────────────────

  _resize() {
    const wrap = document.getElementById("canvas-wrap");
    const scale = Math.min(wrap.clientWidth / CONFIG.logicalW, wrap.clientHeight / CONFIG.logicalH);
    const w = Math.floor(CONFIG.logicalW * scale);
    const h = Math.floor(CONFIG.logicalH * scale);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.width = Math.floor(CONFIG.logicalW * this.dpr);
    this.canvas.height = Math.floor(CONFIG.logicalH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _canvasToLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CONFIG.logicalW,
      y: ((clientY - rect.top) / rect.height) * CONFIG.logicalH,
    };
  }

  _bindUI() {
    const c = this.canvas;

    c.addEventListener("mousemove", (e) => {
      this.hoverPos = this._canvasToLogical(e.clientX, e.clientY);
      if (this.selectedTowerType && !this.pendingPlace) {
        // free-move ghost only before first pin (desktop hover)
      }
    });

    c.addEventListener("click", (e) => {
      AudioFX.resume();
      const p = this._canvasToLogical(e.clientX, e.clientY);
      this._onCanvasClick(p.x, p.y);
    });

    // Touch: drag to reposition pending site
    c.addEventListener("touchstart", (e) => {
      if (!this.selectedTowerType || e.touches.length !== 1) return;
      AudioFX.resume();
      const t = e.touches[0];
      const p = this._canvasToLogical(t.clientX, t.clientY);
      this._touchPlacing = true;
      this._setPendingPlace(p.x, p.y);
      e.preventDefault();
    }, { passive: false });

    c.addEventListener("touchmove", (e) => {
      if (!this._touchPlacing || !this.selectedTowerType || e.touches.length !== 1) return;
      const t = e.touches[0];
      const p = this._canvasToLogical(t.clientX, t.clientY);
      this.hoverPos = p;
      this._setPendingPlace(p.x, p.y);
      e.preventDefault();
    }, { passive: false });

    c.addEventListener("touchend", (e) => {
      this._touchPlacing = false;
      if (this.selectedTowerType) e.preventDefault();
    }, { passive: false });

    c.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._deselect();
    });

    const startWave = () => {
      AudioFX.resume();
      this.startWave();
    };
    document.getElementById("btn-start-wave").addEventListener("click", startWave);
    document.getElementById("btn-start-wave-float").addEventListener("click", startWave);

    document.getElementById("btn-pause").addEventListener("click", () => this.togglePause());
    document.getElementById("btn-speed").addEventListener("click", () => this.cycleSpeed());
    document.getElementById("btn-mute").addEventListener("click", () => this.toggleMute());

    document.getElementById("btn-place-cancel").addEventListener("click", () => {
      AudioFX.ui();
      this._deselect();
    });
    document.getElementById("btn-place-confirm").addEventListener("click", () => {
      AudioFX.resume();
      this._confirmPlacement();
    });

    document.getElementById("btn-sheet").addEventListener("click", () => this._openSheet());
    document.getElementById("btn-close-sheet").addEventListener("click", () => this._closeSheet());
    document.getElementById("sheet-backdrop").addEventListener("click", () => this._closeSheet());

    window.addEventListener("keydown", (e) => this._onKey(e));
    window.addEventListener("resize", () => this._syncPlaceBar());
  }

  _buildTowerButtons() {
    const host = document.getElementById("tower-buttons");
    host.innerHTML = "";
    TOWER_ORDER.forEach((id, i) => {
      const def = TOWER_TYPES[id];
      const key = i < 9 ? String(i + 1) : i === 9 ? "0" : "";
      const btn = document.createElement("button");
      btn.className = "tower-btn";
      btn.type = "button";
      btn.dataset.tower = id;
      btn.title = `${def.name}: ${def.desc}`;
      btn.innerHTML = `
        <div class="icon" style="color:${def.color}">${def.icon}</div>
        <div class="meta">
          <div class="name">${key ? key + ". " : ""}${def.short}</div>
          <div class="cost">¤ ${def.cost}</div>
          <div class="desc">${def.desc}</div>
        </div>`;
      btn.addEventListener("click", () => {
        AudioFX.resume();
        this.selectTowerType(id);
      });
      host.appendChild(btn);
    });
  }

  _openSheet() {
    document.getElementById("info-panel").classList.add("open");
    document.getElementById("sheet-backdrop").classList.remove("hidden");
  }

  _closeSheet() {
    document.getElementById("info-panel").classList.remove("open");
    document.getElementById("sheet-backdrop").classList.add("hidden");
  }

  _setPendingPlace(x, y) {
    if (!this.selectedTowerType) return;
    let px = x, py = y;
    const def = TOWER_TYPES[this.selectedTowerType];
    if (def.behavior === "rover") {
      const n = nearestPathDist(x, y);
      const p = pathPointAt(n.dist);
      const nx = -Math.sin(p.angle);
      const ny = Math.cos(p.angle);
      const side = Math.sign((x - p.x) * nx + (y - p.y) * ny) || 1;
      const off = pathPointOffset(n.dist, side * CONFIG.roverPathOffset);
      px = off.x;
      py = off.y;
    }
    const valid = isValidPlacement(x, y, this.towers, this.selectedTowerType);
    this.pendingPlace = { x: px, y: py, rawX: x, rawY: y, valid };
    this.hoverPos = { x: px, y: py };
    this._syncPlaceBar();
  }

  _confirmPlacement() {
    if (!this.selectedTowerType || !this.pendingPlace || !this.pendingPlace.valid) {
      this._setStatus("Pick a valid green spot on the map first.");
      return;
    }
    const type = this.selectedTowerType;
    const { rawX, rawY, x, y } = this.pendingPlace;
    // Use raw click for rover side choice; final coords for others
    const def = TOWER_TYPES[type];
    if (def.behavior === "rover") this._placeTower(type, rawX, rawY);
    else this._placeTower(type, x, y);
  }

  _syncPlaceBar() {
    const bar = document.getElementById("place-bar");
    const confirm = document.getElementById("btn-place-confirm");
    if (!this.selectedTowerType) {
      bar.classList.add("hidden");
      return;
    }
    const def = TOWER_TYPES[this.selectedTowerType];
    bar.classList.remove("hidden");
    document.getElementById("place-bar-icon").textContent = def.icon;
    document.getElementById("place-bar-icon").style.color = def.color;
    document.getElementById("place-bar-name").textContent = `${def.name} · ¤${def.cost}`;

    if (!this.pendingPlace) {
      bar.classList.remove("invalid");
      document.getElementById("place-bar-hint").textContent =
        def.behavior === "rover"
          ? "Tap beside the glowing lane to set patrol start"
          : "Tap the map to set location, then Deploy";
      confirm.disabled = true;
      confirm.textContent = "Deploy";
    } else if (this.pendingPlace.valid) {
      bar.classList.remove("invalid");
      document.getElementById("place-bar-hint").textContent = "Location OK — press Deploy (or tap elsewhere to move)";
      confirm.disabled = false;
      confirm.textContent = "✓ Deploy";
    } else {
      bar.classList.add("invalid");
      document.getElementById("place-bar-hint").textContent = "Invalid — off path grass only (not on lane / other towers)";
      confirm.disabled = true;
      confirm.textContent = "Deploy";
    }
  }

  _syncWaveFloat() {
    const floatBtn = document.getElementById("btn-start-wave-float");
    const ready =
      this.state === STATE.INTERMISSION &&
      !this.waveActive &&
      this.waveIndex < this.waves.length;
    floatBtn.classList.toggle("hidden", !ready);
    document.getElementById("btn-start-wave").disabled = !ready;
  }

  // ── Input ──────────────────────────────────────────────────────────────

  _onKey(e) {
    if (e.target.matches("input, textarea")) return;
    const key = e.key.toLowerCase();
    if (key === " " || e.code === "Space") {
      e.preventDefault();
      if (this.state === STATE.MENU || this.state === STATE.GAME_OVER || this.state === STATE.VICTORY) return;
      if (this.state === STATE.INTERMISSION) this.startWave();
      else this.togglePause();
      return;
    }
    if (key === "s") return this.cycleSpeed();
    if (key === "m") return this.toggleMute();
    if (key === "r") { this.showAllRanges = !this.showAllRanges; return; }
    if (key === "escape") return this._deselect();
    if (key === "enter" && this.selectedTowerType) {
      e.preventDefault();
      this._confirmPlacement();
      return;
    }

    if (key === "0") {
      this.selectTowerType(TOWER_ORDER[9]);
      return;
    }
    const num = parseInt(key, 10);
    if (num >= 1 && num <= 9) this.selectTowerType(TOWER_ORDER[num - 1]);
  }

  _onCanvasClick(x, y) {
    if (this.state === STATE.MENU || this.state === STATE.GAME_OVER || this.state === STATE.VICTORY) return;

    // Placement mode: pin ghost (confirm separately)
    if (this.selectedTowerType) {
      this._setPendingPlace(x, y);
      if (this.pendingPlace && this.pendingPlace.valid) {
        this._setStatus("Location set. Press Deploy to build (or tap again to move).");
      } else {
        this._setStatus("Can't build there — stay off the lane and clear of other towers.");
      }
      return;
    }

    // Select existing tower (larger hit area on touch)
    const hitR = isCoarsePointer() ? 36 : 26;
    let nearest = null;
    let nearestD = hitR;
    for (const t of this.towers) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = t;
      }
    }
    this.selectedTower = nearest;
    this._refreshInfoPanel();
    if (nearest && isCoarsePointer()) this._openSheet();
  }

  selectTowerType(id) {
    if (this.state === STATE.MENU || this.state === STATE.GAME_OVER || this.state === STATE.VICTORY) return;
    const def = TOWER_TYPES[id];
    if (!def) return;
    if (this.selectedTowerType === id && !this.pendingPlace) {
      this._deselect();
      return;
    }
    this.selectedTowerType = id;
    this.selectedTower = null;
    this.pendingPlace = null;
    AudioFX.ui();
    document.querySelectorAll(".tower-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.tower === id);
    });
    this._refreshInfoPanel();
    this._syncPlaceBar();
    if (isCoarsePointer()) this._openSheet();
    const help = TOWER_HELP[id];
    this._setStatus(
      `${def.name} selected (¤${def.cost}). ${help ? help.placeTip : "Tap map, then Deploy."}`
    );
  }

  _deselect() {
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.pendingPlace = null;
    document.querySelectorAll(".tower-btn").forEach((b) => b.classList.remove("selected"));
    this._refreshInfoPanel();
    this._syncPlaceBar();
    this.canvas.style.cursor = "crosshair";
  }

  // ── Towers ─────────────────────────────────────────────────────────────

  _placeTower(typeId, x, y) {
    const def = TOWER_TYPES[typeId];
    if (this.credits < def.cost) {
      this._setStatus("Insufficient credits.");
      return;
    }
    this.credits -= def.cost;

    let px = x, py = y;
    let pathDist = 0;
    let pathSide = CONFIG.roverPathOffset;
    let roverDir = 1;

    if (def.behavior === "rover") {
      const n = nearestPathDist(x, y);
      pathDist = n.dist;
      // Choose side based on which side click was on
      const p = pathPointAt(pathDist);
      const nx = -Math.sin(p.angle);
      const ny = Math.cos(p.angle);
      const side = Math.sign((x - p.x) * nx + (y - p.y) * ny) || 1;
      pathSide = side * CONFIG.roverPathOffset;
      const off = pathPointOffset(pathDist, pathSide);
      px = off.x;
      py = off.y;
    }

    const tower = {
      id: nextId(),
      type: typeId,
      x: px,
      y: py,
      range: def.range,
      fireRate: def.fireRate,
      damage: def.damage,
      projectileSpeed: def.projectileSpeed,
      dmgType: def.dmgType,
      canHitFlying: def.canHitFlying,
      airOnly: !!def.airOnly,
      splash: def.splash,
      pierce: def.pierce,
      arcing: !!def.arcing,
      targeting: def.targeting,
      behavior: def.behavior || "standard",
      cooldown: 0,
      angle: 0,
      totalInvested: def.cost,
      pathLevel: { A: 0, B: 0, C: 0 },
      armorShred: 0,
      slow: 0,
      slowDuration: 0,
      stun: 0,
      burn: 0,
      burnDuration: 0,
      multiTarget: 1,
      detectStealth: false,
      homing: !!def.homing,
      botBonus: 1,
      heavyBonus: 1,
      airBonus: 1,
      shieldBonus: 1,
      critChance: 0,
      critMult: 2,
      mark: 0,
      markDuration: 0,
      executePct: 0,
      kills: 0,
      // special
      fieldSlow: def.behavior === "force" ? 0.32 : 0,
      fieldHurtHp: false,
      fieldStun: 0,
      fieldStunCd: 0,
      fieldStunTimer: 0,
      fieldPush: 0,
      teleportDist: def.teleportDist || 0,
      bypassTeleportImmune: false,
      pathDist,
      pathSide,
      roverDir,
      roverSpeed: def.roverSpeed || 0,
      maxDrones: def.maxDrones || 0,
      droneLife: def.droneLife || 0,
      maxMechs: def.maxMechs || 0,
      mechLife: def.mechLife || 0,
      mechHp: def.mechHp || 0,
      pulse: 0,
    };

    this.towers.push(tower);
    this.selectedTower = tower;
    this.selectedTowerType = null;
    this.pendingPlace = null;
    document.querySelectorAll(".tower-btn").forEach((b) => b.classList.remove("selected"));
    AudioFX.place();
    this._spawnParticles(px, py, def.color, 10, 1.5);
    this._refreshInfoPanel();
    this._syncPlaceBar();
    this._updateHUD();
    this._setStatus(`${def.name} online. Tap it to upgrade.`);
    if (isCoarsePointer()) this._openSheet();
  }

  _upgradeTower(tower, path) {
    const def = TOWER_TYPES[tower.type];
    const level = tower.pathLevel[path];
    if (level >= 3) return;
    const totalUp = tower.pathLevel.A + tower.pathLevel.B + tower.pathLevel.C;
    if (totalUp >= 5) {
      this._setStatus("Max upgrades on this structure (5).");
      return;
    }
    if (level === 2) {
      const otherMax = Math.max(
        ...["A", "B", "C"].filter((p) => p !== path).map((p) => tower.pathLevel[p])
      );
      if (otherMax >= 2) {
        this._setStatus("Only one path can reach rank 3 when another is rank 2+.");
        return;
      }
    }
    const up = def.upgrades[path][level];
    if (this.credits < up.cost) {
      this._setStatus("Insufficient credits.");
      return;
    }
    this.credits -= up.cost;
    tower.totalInvested += up.cost;
    up.apply(tower);
    tower.pathLevel[path]++;
    AudioFX.ui();
    this._spawnParticles(tower.x, tower.y, "#d4a84b", 12, 2);
    this._refreshInfoPanel();
    this._updateHUD();
    this._setStatus(`Upgraded: ${up.name}`);
  }

  _sellTower(tower) {
    const refund = Math.floor(tower.totalInvested * CONFIG.sellRefund);
    this.credits += refund;
    // Remove allies from this tower
    this.allies = this.allies.filter((a) => a.ownerId !== tower.id);
    this.towers = this.towers.filter((t) => t.id !== tower.id);
    if (this.selectedTower && this.selectedTower.id === tower.id) this.selectedTower = null;
    AudioFX.explosion();
    this._spawnParticles(tower.x, tower.y, "#ff6644", 16, 2.5);
    this._refreshInfoPanel();
    this._updateHUD();
    this._setStatus(`Decommissioned for ¤${refund}.`);
  }

  // ── Enemies ────────────────────────────────────────────────────────────

  _spawnEnemy(typeId, hpScale = 1, distOffset = 0) {
    const def = ENEMY_TYPES[typeId];
    if (!def) return null;
    const e = {
      id: nextId(),
      type: typeId,
      hp: def.hp * hpScale,
      maxHp: def.hp * hpScale,
      shield: (def.shield || 0) * hpScale,
      maxShield: (def.shield || 0) * hpScale,
      speed: def.speed,
      baseSpeed: def.speed,
      reward: Math.floor(def.reward * (0.85 + hpScale * 0.15)),
      leak: def.leak,
      radius: def.radius,
      armor: def.armor,
      flying: def.flying,
      stealth: !!def.stealth,
      teleportImmune: !!def.teleportImmune,
      fieldResist: def.fieldResist || 0,
      phaseChance: def.phaseChance || 0,
      color: def.color,
      accent: def.accent,
      shape: def.shape,
      score: def.score,
      children: def.children || null,
      dist: distOffset,
      alive: true,
      slowTimer: 0,
      slowAmount: 0,
      stunTimer: 0,
      burnTimer: 0,
      burnDps: 0,
      markTimer: 0,
      markAmount: 0,
      hitFlash: 0,
      fieldSlowNow: 0,
    };
    const pos = pathPointAt(e.dist);
    e.x = pos.x;
    e.y = pos.y;
    e.angle = pos.angle;
    this.enemies.push(e);
    return e;
  }

  _killEnemy(e, fromTower = null) {
    if (!e.alive) return;
    e.alive = false;
    this.credits += e.reward;
    this.score += e.score;
    if (fromTower) fromTower.kills++;
    AudioFX.explosion();
    this._spawnParticles(e.x, e.y, e.color, 12, 2.2);
    this._spawnParticles(e.x, e.y, e.accent, 8, 1.8);
    this._floatText(e.x, e.y - 12, `+${e.reward}`, "#d4a84b");

    if (e.children) {
      let offset = 0;
      for (const group of e.children) {
        for (let i = 0; i < group.count; i++) {
          this._spawnEnemy(group.type, 1, Math.max(0, e.dist - 8 - offset));
          offset += 10;
        }
      }
    }
    this._updateHUD();
    if (this.selectedTower) this._refreshInfoPanel();
  }

  /**
   * Damage pipeline: shields first (except rail partial pierce), type multipliers.
   */
  _damageEnemy(e, rawDmg, dmgType, sourceTower) {
    if (!e.alive) return;

    // Phase dodge
    if (e.phaseChance > 0 && Math.random() < e.phaseChance) {
      this._floatText(e.x, e.y - 10, "PHASE", "#c080ff");
      return;
    }

    let dmg = rawDmg;

    // Type vs armor / role
    if (dmgType === DMG.KINETIC) {
      dmg *= e.armor;
      if (e.shield > 0) dmg *= 0.35; // kinetic poor vs shields
    } else if (dmgType === DMG.PLASMA) {
      dmg *= Math.min(1.2, e.armor + 0.5);
      if (e.shield > 0) dmg *= 1.65; // plasma melts shields
    } else if (dmgType === DMG.EXPLOSIVE) {
      dmg *= Math.min(1.2, e.armor + 0.5);
      if (e.shield > 0) dmg *= 0.7;
    } else if (dmgType === DMG.RAIL) {
      dmg *= Math.min(1.15, e.armor + 0.6);
      // rail partially bypasses shields
    } else if (dmgType === DMG.AA) {
      dmg *= e.flying ? 1.25 : 0.12;
    } else if (dmgType === DMG.ENERGY) {
      dmg *= 0.9;
      if (e.shield > 0) dmg *= 1.8;
    }

    if (sourceTower) {
      if (sourceTower.armorShred) dmg *= 1 + sourceTower.armorShred * (1 - e.armor);
      if (sourceTower.shieldBonus > 1 && e.shield > 0) dmg *= sourceTower.shieldBonus;
      if (sourceTower.botBonus > 1 && (e.shape === "bot" || e.shape === "botHeavy" || e.type.includes("Bot") || e.type.includes("Mech"))) {
        dmg *= sourceTower.botBonus;
      }
      if (sourceTower.heavyBonus > 1 && (e.type === "siegeTank" || e.type === "colossus" || e.type === "carrier" || e.type === "commandNode")) {
        dmg *= sourceTower.heavyBonus;
      }
      if (sourceTower.airBonus > 1 && e.flying) dmg *= sourceTower.airBonus;
      if (sourceTower.critChance && Math.random() < sourceTower.critChance) {
        dmg *= sourceTower.critMult;
        this._floatText(e.x, e.y - 18, "CRIT!", "#ff6644");
      }
      if (sourceTower.slow > 0) {
        e.slowAmount = Math.max(e.slowAmount, sourceTower.slow);
        e.slowTimer = Math.max(e.slowTimer, sourceTower.slowDuration);
      }
      if (sourceTower.stun > 0) e.stunTimer = Math.max(e.stunTimer, sourceTower.stun);
      if (sourceTower.burn > 0) {
        e.burnDps = Math.max(e.burnDps, sourceTower.burn);
        e.burnTimer = Math.max(e.burnTimer, sourceTower.burnDuration);
      }
      if (sourceTower.mark > 0) {
        e.markAmount = Math.max(e.markAmount, sourceTower.mark);
        e.markTimer = Math.max(e.markTimer, sourceTower.markDuration);
      }
      if (sourceTower.executePct > 0 && e.hp / e.maxHp <= sourceTower.executePct && e.shield <= 0) {
        dmg = e.hp + 1;
        this._floatText(e.x, e.y - 20, "EXEC", "#ff2244");
      }
    }

    if (e.markAmount > 0) dmg *= 1 + e.markAmount;

    // Apply to shield then HP
    e.hitFlash = 0.1;
    if (e.shield > 0 && dmgType !== DMG.RAIL) {
      const toShield = Math.min(e.shield, dmg);
      e.shield -= toShield;
      dmg -= toShield;
      if (toShield > 0) this._floatText(e.x + rand(-4, 4), e.y - 14, `${Math.round(toShield)}`, "#66d4ff");
    } else if (e.shield > 0 && dmgType === DMG.RAIL) {
      // 40% to shield, 60% bleeds through
      const toShield = Math.min(e.shield, dmg * 0.4);
      e.shield -= toShield;
      dmg = dmg * 0.6 + (dmg * 0.4 - toShield);
    }

    if (dmg > 0) {
      e.hp -= dmg;
      this._floatText(e.x + rand(-6, 6), e.y - 6, `${Math.round(dmg)}`, "#ffe0a0");
    }

    if (e.hp <= 0) this._killEnemy(e, sourceTower);
  }

  // ── Projectiles & targeting ────────────────────────────────────────────

  _getTowerTargets(tower) {
    const candidates = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.flying && !tower.canHitFlying) continue;
      if (tower.airOnly && !e.flying) continue;
      if (e.stealth && !tower.detectStealth) continue;
      const d = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (d <= tower.range) {
        candidates.push({ e, d, dist: e.dist, hp: e.hp + e.shield });
      }
    }
    if (!candidates.length) return [];
    const mode = tower.targeting;
    candidates.sort((a, b) => {
      if (mode === "strong") return b.hp - a.hp || b.dist - a.dist;
      if (mode === "close") return a.d - b.d;
      if (mode === "last") return a.dist - b.dist;
      return b.dist - a.dist;
    });
    return candidates.slice(0, tower.multiTarget || 1).map((c) => c.e);
  }

  /**
   * Aim at where the target will be when the shot arrives (path lead).
   * Prevents "fake misses" from slow bolts + moving enemies.
   */
  _aimPoint(tower, target) {
    const dist = Math.hypot(target.x - tower.x, target.y - tower.y);
    const spd = Math.max(tower.projectileSpeed, 1);
    let eta = dist / spd;
    // Iterate lead along the path a couple times
    let leadDist = target.dist;
    for (let i = 0; i < 3; i++) {
      const pos = pathPointAt(leadDist);
      eta = Math.hypot(pos.x - tower.x, pos.y - tower.y) / spd;
      const moveSpd = target.stunTimer > 0 ? 0 : target.baseSpeed * (1 - (target.slowAmount || 0) * (target.slowTimer > 0 ? 1 : 0));
      const fieldSlow = target.fieldSlowNow || 0;
      leadDist = target.dist + moveSpd * (1 - fieldSlow) * eta;
    }
    const aim = pathPointAt(leadDist);
    // Flying units sit above the path
    if (target.flying) aim.y -= 16;
    return aim;
  }

  _fireTower(tower, targets) {
    const def = TOWER_TYPES[tower.type];
    // Prefer tower instance flags (upgrades), fall back to type def
    const isHoming = !!(tower.homing || def.homing);
    for (const target of targets) {
      if (this.projectiles.length >= CONFIG.maxProjectiles) break;
      const aim = this._aimPoint(tower, target);
      const angle = Math.atan2(aim.y - tower.y, aim.x - tower.x);
      tower.angle = angle;
      this.projectiles.push({
        id: nextId(),
        x: tower.x,
        y: tower.y,
        tx: aim.x,
        ty: aim.y,
        targetId: target.id,
        vx: Math.cos(angle) * tower.projectileSpeed,
        vy: Math.sin(angle) * tower.projectileSpeed,
        speed: tower.projectileSpeed,
        damage: tower.damage,
        dmgType: tower.dmgType,
        splash: tower.splash,
        pierce: tower.pierce,
        pierced: 0,
        homing: isHoming,
        arcing: tower.arcing,
        age: 0,
        maxAge: tower.arcing ? 1.8 : 2.5,
        towerRef: tower,
        color: def.color,
        radius: tower.arcing ? 5 : tower.dmgType === DMG.PLASMA ? 5 : tower.dmgType === DMG.EXPLOSIVE ? 4 : 2.5,
        startX: tower.x,
        startY: tower.y,
        arcT: 0,
        arcDuration: tower.arcing
          ? clamp(Math.hypot(aim.x - tower.x, aim.y - tower.y) / Math.max(tower.projectileSpeed, 1), 0.4, 1.6)
          : 0,
        dead: false,
      });
    }
    if (tower.dmgType === DMG.PLASMA) AudioFX.plasma();
    else if (tower.dmgType === DMG.EXPLOSIVE || tower.arcing) AudioFX.rocket();
    else AudioFX.shot();
  }

  _countAllies(ownerId, kind) {
    let n = 0;
    for (const a of this.allies) {
      if (a.ownerId === ownerId && a.kind === kind && a.alive) n++;
    }
    return n;
  }

  _spawnAllyDrone(tower) {
    if (this.allies.length >= CONFIG.maxAllies) return;
    if (this._countAllies(tower.id, "drone") >= tower.maxDrones) return;
    const targets = this._getTowerTargets(tower);
    const aim = targets[0];
    this.allies.push({
      id: nextId(),
      kind: "drone",
      ownerId: tower.id,
      x: tower.x + rand(-8, 8),
      y: tower.y + rand(-8, 8),
      vx: 0,
      vy: 0,
      speed: tower.projectileSpeed || 180,
      damage: tower.damage,
      dmgType: tower.dmgType,
      splash: tower.splash || 0,
      life: tower.droneLife,
      maxLife: tower.droneLife,
      targetId: aim ? aim.id : null,
      alive: true,
      towerRef: tower,
      radius: 5,
      color: TOWER_TYPES.hive.color,
    });
  }

  _spawnAllyMech(tower) {
    if (this.allies.length >= CONFIG.maxAllies) return;
    if (this._countAllies(tower.id, "mech") >= tower.maxMechs) return;
    const near = nearestPathDist(tower.x, tower.y);
    this.allies.push({
      id: nextId(),
      kind: "mech",
      ownerId: tower.id,
      dist: Math.max(0, near.dist - 20),
      x: tower.x,
      y: tower.y,
      speed: 50,
      damage: tower.damage,
      dmgType: tower.dmgType,
      splash: tower.splash || 0,
      hp: tower.mechHp,
      maxHp: tower.mechHp,
      life: tower.mechLife,
      maxLife: tower.mechLife,
      alive: true,
      towerRef: tower,
      radius: 11,
      cooldown: 0,
      color: TOWER_TYPES.mech.color,
      armorShred: tower.armorShred,
      shieldBonus: tower.shieldBonus,
      heavyBonus: tower.heavyBonus,
      stun: tower.stun,
    });
  }

  // ── Waves ──────────────────────────────────────────────────────────────

  startWave() {
    if (this.state !== STATE.INTERMISSION && this.state !== STATE.PLAYING) return;
    if (this.waveActive) return;
    if (this.waveIndex >= this.waves.length) {
      this._victory();
      return;
    }

    const wave = this.waves[this.waveIndex];
    this.spawnQueue = [];
    let t = 0.25;
    const hpScale = wave.hpScale || 1;

    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({ type: group.type, time: t, hpScale });
        t += group.spacing || 0.45;
      }
      t += 0.35;
    }

    this.spawnTimer = 0;
    this.waveActive = true;
    this.state = STATE.PLAYING;
    this.waveIndex++;
    AudioFX.wave();
    this._setStatus(`Wave ${wave.number} — hostiles inbound.`);
    this._updateHUD();
    this._updateWaveInfo();
    document.getElementById("btn-start-wave").disabled = true;
    this._syncWaveFloat();
    this._hideOverlay();
  }

  _checkWaveComplete() {
    if (!this.waveActive) return;
    if (this.spawnQueue.length > 0) return;
    if (this.enemies.some((e) => e.alive)) return;

    this.waveActive = false;
    const completed = this.waveIndex;
    const wave = this.waves[completed - 1];
    if (wave) {
      this.credits += wave.reward;
      this._floatText(CONFIG.logicalW / 2, 80, `Wave Clear +¤${wave.reward}`, "#66ffcc");
    }

    if (completed > this.highWave) {
      this.highWave = completed;
      localStorage.setItem("fmtd_highWave", String(this.highWave));
    }
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("fmtd_highScore", String(this.highScore));
    }

    if (completed >= this.waves.length) {
      this._victory();
      return;
    }

    this.state = STATE.INTERMISSION;
    document.getElementById("btn-start-wave").disabled = false;
    this._setStatus(`Wave ${completed} cleared. Re-arm. Check next wave tags.`);
    this._updateHUD();
    this._updateWaveInfo();
    this._syncWaveFloat();
    if (this.selectedTower) this._refreshInfoPanel();
  }

  // ── Flow ───────────────────────────────────────────────────────────────

  _showMenu() {
    this.state = STATE.MENU;
    const el = document.getElementById("overlay-content");
    el.innerHTML = `
      <h1>FLYING METAL TOWER DEFENSE</h1>
      <p style="color:var(--olive-bright);letter-spacing:0.15em;font-size:0.75rem;margin-bottom:0.75rem">FUTURE WARFARE</p>
      <p>Hold the transit corridor. Deploy kinetic turrets, plasma, force fields,
      teleporters, roving platforms, drone hives, and mechs. Survive
      <strong>${CONFIG.totalWaves} waves</strong>.</p>
      <p style="color:var(--tan);font-size:0.8rem">Best Wave: ${this.highWave || "—"} · High Score: ${this.highScore || "—"}</p>
      <div class="btn-row">
        <button class="primary-btn" id="btn-new-game" style="width:auto;min-width:160px">DEPLOY</button>
      </div>`;
    document.getElementById("overlay").classList.remove("hidden");
    document.getElementById("btn-new-game").onclick = () => {
      if (!this.tutorialSeen) this._showTutorial();
      else this._newGame();
    };
  }

  _showTutorial() {
    const el = document.getElementById("overlay-content");
    el.innerHTML = `
      <h2>TACTICAL BRIEF</h2>
      <p style="text-align:left;font-size:0.84rem">
        <strong>1. Build</strong> — Pick a tower from the arsenal strip. Tap the map to pin a green spot, then press <strong>Deploy</strong>.<br/><br/>
        <strong>2. Counters</strong> — Cyan HP bars are <em>shields</em> (use Plasma). Flying units need AA. Wave list shows AIR / SHD tags.<br/><br/>
        <strong>3. Upgrade</strong> — Tap a built tower (or ☰ Intel) for paths A/B/C.<br/><br/>
        <strong>4. Specials</strong> — Force Field slows; Teleport delays; Rover patrols the lane; Hive/Mech spawn helpers.
      </p>
      <div class="btn-row">
        <button class="primary-btn" id="btn-tut-ok" type="button" style="width:auto;min-width:160px">GOT IT</button>
      </div>`;
    document.getElementById("overlay").classList.remove("hidden");
    document.getElementById("btn-tut-ok").onclick = () => {
      this.tutorialSeen = true;
      localStorage.setItem("fmtd_tutorial_v2", "1");
      this._newGame();
    };
  }

  _newGame() {
    AudioFX.init();
    AudioFX.resume();
    this.credits = CONFIG.startCredits;
    this.integrity = CONFIG.startIntegrity;
    this.score = 0;
    this.waveIndex = 0;
    this.speed = 1;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.allies = [];
    this.spawnQueue = [];
    this.waveActive = false;
    this.selectedTower = null;
    this.selectedTowerType = null;
    this.state = STATE.INTERMISSION;
    this.pendingPlace = null;
    document.getElementById("btn-speed").textContent = "1×";
    document.getElementById("btn-start-wave").disabled = false;
    document.querySelectorAll(".tower-btn").forEach((b) => b.classList.remove("selected"));
    this._hideOverlay();
    this._updateHUD();
    this._updateWaveInfo();
    this._refreshInfoPanel();
    this._syncPlaceBar();
    this._syncWaveFloat();
    this._setStatus("Pick towers → pin on map → Deploy. Wave 3 shields · Wave 5 air.");
  }

  _gameOver() {
    this.state = STATE.GAME_OVER;
    this.selectedTowerType = null;
    this.pendingPlace = null;
    this._syncPlaceBar();
    this._syncWaveFloat();
    this._closeSheet();
    if (this.waveIndex > this.highWave) {
      this.highWave = this.waveIndex;
      localStorage.setItem("fmtd_highWave", String(this.highWave));
    }
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("fmtd_highScore", String(this.highScore));
    }
    const el = document.getElementById("overlay-content");
    el.innerHTML = `
      <h1 style="color:var(--red)">CORE BREACH</h1>
      <p>Integrity depleted. Sector lost.</p>
      <p>Wave: <strong>${this.waveIndex}</strong> · Score: <strong>${this.score}</strong></p>
      <div class="btn-row">
        <button class="primary-btn" id="btn-retry" style="width:auto;min-width:160px">RETRY</button>
        <button class="secondary-btn" id="btn-menu">MAIN MENU</button>
      </div>`;
    document.getElementById("overlay").classList.remove("hidden");
    document.getElementById("btn-retry").onclick = () => this._newGame();
    document.getElementById("btn-menu").onclick = () => this._showMenu();
  }

  _victory() {
    this.state = STATE.VICTORY;
    this.selectedTowerType = null;
    this.pendingPlace = null;
    this._syncPlaceBar();
    this._syncWaveFloat();
    this._closeSheet();
    this.score += 8000;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("fmtd_highScore", String(this.highScore));
    }
    localStorage.setItem("fmtd_highWave", String(CONFIG.totalWaves));
    this.highWave = CONFIG.totalWaves;
    const el = document.getElementById("overlay-content");
    el.innerHTML = `
      <h1>SECTOR SECURED</h1>
      <p>All ${CONFIG.totalWaves} waves repelled.</p>
      <p>Score: <strong style="color:var(--gold)">${this.score}</strong></p>
      <div class="btn-row">
        <button class="primary-btn" id="btn-retry" style="width:auto;min-width:160px">PLAY AGAIN</button>
        <button class="secondary-btn" id="btn-menu">MAIN MENU</button>
      </div>`;
    document.getElementById("overlay").classList.remove("hidden");
    document.getElementById("btn-retry").onclick = () => this._newGame();
    document.getElementById("btn-menu").onclick = () => this._showMenu();
  }

  togglePause() {
    if (this.state === STATE.PLAYING) {
      this.state = STATE.PAUSED;
      document.getElementById("btn-pause").textContent = "▶";
      document.getElementById("btn-pause").classList.add("active");
      this._setStatus("Paused.");
    } else if (this.state === STATE.PAUSED) {
      this.state = STATE.PLAYING;
      document.getElementById("btn-pause").textContent = "❚❚";
      document.getElementById("btn-pause").classList.remove("active");
      this._setStatus("Resumed.");
    }
  }

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    document.getElementById("btn-speed").textContent = this.speed + "×";
    document.getElementById("btn-speed").classList.toggle("active", this.speed === 2);
  }

  toggleMute() {
    AudioFX.setMuted(!AudioFX.muted);
    document.getElementById("btn-mute").textContent = AudioFX.muted ? "🔇" : "🔊";
  }

  _hideOverlay() {
    document.getElementById("overlay").classList.add("hidden");
  }

  // ── UI ─────────────────────────────────────────────────────────────────

  _updateHUD() {
    document.getElementById("credits-display").textContent = Math.floor(this.credits);
    document.getElementById("integrity-display").textContent = Math.max(0, Math.ceil(this.integrity));
    document.getElementById("integrity-bar").style.setProperty(
      "--pct",
      clamp(this.integrity / CONFIG.startIntegrity, 0, 1) * 100 + "%"
    );
    document.getElementById("wave-display").textContent =
      `${Math.min(this.waveIndex, CONFIG.totalWaves)} / ${CONFIG.totalWaves}`;
    document.getElementById("score-display").textContent = this.score;
    document.getElementById("high-score").textContent =
      `Best Wave: ${this.highWave || "—"} · HS: ${this.highScore || "—"}`;
    document.querySelectorAll(".tower-btn").forEach((b) => {
      const def = TOWER_TYPES[b.dataset.tower];
      b.disabled = this.credits < def.cost && this.selectedTowerType !== def.id;
    });
    this._syncWaveFloat();
  }

  _updateWaveInfo() {
    const el = document.getElementById("wave-composition");
    const nextIdx = this.waveIndex;
    if (nextIdx >= this.waves.length) {
      el.innerHTML = "<em>All waves complete.</em>";
      return;
    }
    const wave = this.waves[nextIdx];
    const counts = {};
    for (const g of wave.groups) counts[g.type] = (counts[g.type] || 0) + g.count;
    const lines = Object.entries(counts).map(([type, n]) => {
      const def = ENEMY_TYPES[type];
      const tags = [];
      if (def.flying) tags.push("AIR");
      if (def.shield > 0) tags.push("SHD");
      if (def.teleportImmune) tags.push("TP-IMM");
      if (def.stealth) tags.push("STL");
      return `<div>• ${def.name}: <strong>${n}</strong>${tags.length ? ` <span style="color:var(--tan);font-size:0.65rem">[${tags.join(" ")}]</span>` : ""}</div>`;
    });
    el.innerHTML = `<div style="margin-bottom:0.25rem;color:var(--tan)">Wave ${wave.number}</div>${lines.join("")}`;
  }

  _towerHelpHtml(def) {
    const help = TOWER_HELP[def.id] || {};
    const tags = [];
    if (def.airOnly) tags.push(`<span class="tag air">AIR ONLY</span>`);
    else if (def.canHitFlying) tags.push(`<span class="tag air">HITS AIR</span>`);
    else tags.push(`<span class="tag">GROUND ONLY</span>`);
    if (def.behavior === "force") tags.push(`<span class="tag special">AURA</span>`);
    if (def.behavior === "teleport") tags.push(`<span class="tag special">UTILITY</span>`);
    if (def.behavior === "rover") tags.push(`<span class="tag special">MOBILE</span>`);
    if (def.behavior === "hive" || def.behavior === "mech") tags.push(`<span class="tag special">SPAWNS UNITS</span>`);
    if (def.dmgType === DMG.PLASMA) tags.push(`<span class="tag good">ANTI-SHIELD</span>`);
    if (def.dmgType === DMG.EXPLOSIVE) tags.push(`<span class="tag good">ANTI-ARMOR</span>`);
    if (def.dmgType === DMG.KINETIC) tags.push(`<span class="tag bad">WEAK VS SHIELDS</span>`);

    return `
      <div class="tag-row">${tags.join("")}</div>
      <div class="how-it-works">${help.blurb || def.desc}</div>
      ${help.goodVs ? `<div class="stat-row"><span class="label">Strong vs</span><span style="color:#6bdf8a;text-align:right;font-size:0.72rem">${help.goodVs}</span></div>` : ""}
      ${help.weakVs ? `<div class="stat-row"><span class="label">Weak vs</span><span style="color:#ff8899;text-align:right;font-size:0.72rem">${help.weakVs}</span></div>` : ""}
      ${help.placeTip ? `<p class="muted" style="margin-top:0.45rem;font-size:0.72rem">📍 ${help.placeTip}</p>` : ""}
    `;
  }

  _refreshInfoPanel() {
    const el = document.getElementById("info-content");

    if (this.selectedTowerType && !this.selectedTower) {
      const def = TOWER_TYPES[this.selectedTowerType];
      el.innerHTML = `
        <div class="tower-title" style="color:${def.color}">${def.icon} ${def.name}</div>
        <div class="stat-row"><span class="label">Cost</span><span>¤ ${def.cost}</span></div>
        <div class="stat-row"><span class="label">Damage type</span><span>${def.dmgType}</span></div>
        ${def.fireRate ? `<div class="stat-row"><span class="label">Fire rate</span><span>${def.fireRate}/s</span></div>` : `<div class="stat-row"><span class="label">Mode</span><span>${def.behavior}</span></div>`}
        ${def.damage ? `<div class="stat-row"><span class="label">Damage</span><span>${def.damage}</span></div>` : ""}
        <div class="stat-row"><span class="label">Range</span><span>${def.range}</span></div>
        ${this._towerHelpHtml(def)}
        <p class="muted" style="margin-top:0.55rem;font-size:0.72rem">
          <strong>How to place:</strong> Tap the map to pin a spot (green = OK), then press <strong>Deploy</strong>.
          After building, open Intel (☰) and upgrade paths A/B/C.
        </p>`;
      return;
    }

    if (this.selectedTower) {
      const t = this.selectedTower;
      const def = TOWER_TYPES[t.type];
      let ups = "";
      for (const path of ["A", "B", "C"]) {
        const level = t.pathLevel[path];
        const pathUps = def.upgrades[path];
        if (level >= 3) {
          ups += `<div class="upgrade-btn" disabled style="opacity:0.5">
            <div class="up-name">Path ${path} — MAX</div>
            <div class="up-desc">${pathUps[2].name}</div>
          </div>`;
        } else {
          const up = pathUps[level];
          ups += `<button class="upgrade-btn" type="button" data-path="${path}" ${this.credits >= up.cost ? "" : "disabled"}>
            <div><span class="up-name">Path ${path}: ${up.name}</span>
            <span class="up-cost"> ¤${up.cost}</span></div>
            <div class="up-desc">${up.desc} <em>(${level}/3)</em></div>
          </button>`;
        }
      }
      const sell = Math.floor(t.totalInvested * CONFIG.sellRefund);
      el.innerHTML = `
        <div class="tower-title" style="color:${def.color}">${def.icon} ${def.name}</div>
        ${this._towerHelpHtml(def)}
        <div class="stat-row"><span class="label">Damage</span><span>${t.damage.toFixed(0)}</span></div>
        <div class="stat-row"><span class="label">Rate</span><span>${t.fireRate ? t.fireRate.toFixed(2) + "/s" : "aura / deploy"}</span></div>
        <div class="stat-row"><span class="label">Range</span><span>${t.range.toFixed(0)}</span></div>
        <div class="stat-row"><span class="label">Kills</span><span>${t.kills}</span></div>
        <div class="stat-row"><span class="label">Upgrades</span><span>A${t.pathLevel.A} B${t.pathLevel.B} C${t.pathLevel.C} (max 5)</span></div>
        <div class="upgrade-section"><h3 style="font-size:0.7rem;letter-spacing:0.1em;color:var(--tan);margin-bottom:0.35rem">UPGRADE PATHS</h3>
        <p class="muted" style="font-size:0.68rem;margin-bottom:0.4rem">Pick a specialty. Only one path can hit rank 3 if another is already rank 2+.</p>
        ${ups}</div>
        <button class="sell-btn" id="btn-sell" type="button">SELL (¤${sell})</button>`;
      el.querySelectorAll(".upgrade-btn[data-path]").forEach((btn) => {
        btn.addEventListener("click", () => this._upgradeTower(t, btn.dataset.path));
      });
      const sellBtn = document.getElementById("btn-sell");
      if (sellBtn) sellBtn.onclick = () => this._sellTower(t);
      return;
    }

    el.innerHTML = `<p class="muted" style="margin-bottom:0.6rem">Select a tower in the arsenal for a full breakdown, or tap one on the map to upgrade / sell.</p>
      <div class="how-it-works">
        <strong>Quick counters</strong><br/>
        <span style="color:#44ddff">Plasma</span> melts shields ·
        <span style="color:#ff6644">Missiles</span> crack armor ·
        <span style="color:#a0b0c8">AA</span> stops drones ·
        <span style="color:#66ffcc">Force Field</span> slows packs ·
        <span style="color:#c080ff">Teleport</span> stalls (not bosses)
      </div>
      <p class="muted" style="margin-top:0.55rem;font-size:0.72rem">Wave tags: AIR · SHD (shield) · TP-IMM · STL (stealth)</p>`;
  }

  _setStatus(msg) {
    document.getElementById("status-text").textContent = msg;
  }

  _spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count && this.particles.length < CONFIG.maxParticles; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(20, 80) * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.3, 0.7), maxLife: 0.7, color, size: rand(2, 5),
      });
    }
  }

  _floatText(x, y, text, color) {
    if (this.floatingTexts.length >= CONFIG.maxFloatingText) this.floatingTexts.shift();
    this.floatingTexts.push({ x, y, text, color, life: 0.75, vy: -32 });
  }

  // ── Update ─────────────────────────────────────────────────────────────

  _update(dt) {
    if (this.state !== STATE.PLAYING && this.state !== STATE.INTERMISSION) return;
    this.time += dt;
    const sim = this.state === STATE.PLAYING;

    if (sim) {
      // Spawns
      if (this.waveActive && this.spawnQueue.length) {
        this.spawnTimer += dt;
        while (this.spawnQueue.length && this.spawnQueue[0].time <= this.spawnTimer) {
          const s = this.spawnQueue.shift();
          this._spawnEnemy(s.type, s.hpScale);
        }
      }

      // Reset per-frame field slow
      for (const e of this.enemies) e.fieldSlowNow = 0;

      // Towers: special behaviors + fire
      for (const tower of this.towers) {
        tower.pulse += dt;
        this._updateTowerBehavior(tower, dt);
      }

      // Enemies move
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.hitFlash > 0) e.hitFlash -= dt;

        if (e.stunTimer > 0) {
          e.stunTimer -= dt;
        } else {
          let spd = e.baseSpeed;
          if (e.slowTimer > 0) {
            e.slowTimer -= dt;
            spd *= 1 - e.slowAmount;
          }
          if (e.fieldSlowNow > 0) spd *= 1 - e.fieldSlowNow;
          e.dist += spd * dt;
          const pos = pathPointAt(e.dist);
          e.x = pos.x;
          e.y = pos.y - (e.flying ? 16 : 0);
          e.angle = pos.angle;
        }

        if (e.burnTimer > 0) {
          e.burnTimer -= dt;
          e.hp -= e.burnDps * dt;
          if (Math.random() < dt * 8) this._spawnParticles(e.x, e.y, "#ff6622", 1, 0.5);
          if (e.hp <= 0) this._killEnemy(e);
        }
        if (e.markTimer > 0) e.markTimer -= dt;
        else e.markAmount = 0;

        if (e.alive && e.dist >= PATH_DATA.total) {
          e.alive = false;
          this.integrity -= e.leak;
          AudioFX.leak();
          this._floatText(e.x, e.y, `-${e.leak}`, "#ff4466");
          this._spawnParticles(e.x, e.y, "#ff4466", 10, 2);
          this._updateHUD();
          if (this.integrity <= 0) {
            this.integrity = 0;
            this._gameOver();
            return;
          }
        }
      }
      this.enemies = this.enemies.filter((e) => e.alive);

      // Allies
      this._updateAllies(dt);

      // Projectiles
      this._updateProjectiles(dt);

      this._checkWaveComplete();
    }

    // Cosmetics
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 40 * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const ft of this.floatingTexts) {
      ft.y += ft.vy * dt;
      ft.life -= dt;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);
  }

  _updateTowerBehavior(tower, dt) {
    const beh = tower.behavior;

    // Rover patrol
    if (beh === "rover") {
      tower.pathDist += tower.roverDir * tower.roverSpeed * dt;
      if (tower.pathDist >= PATH_DATA.total - 40) {
        tower.pathDist = PATH_DATA.total - 40;
        tower.roverDir = -1;
      } else if (tower.pathDist <= 40) {
        tower.pathDist = 40;
        tower.roverDir = 1;
      }
      const off = pathPointOffset(tower.pathDist, tower.pathSide);
      tower.x = off.x;
      tower.y = off.y;
    }

    // Force field aura
    if (beh === "force") {
      if (tower.fieldStunTimer > 0) tower.fieldStunTimer -= dt;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.stealth && !tower.detectStealth) continue;
        const d = Math.hypot(e.x - tower.x, e.y - tower.y);
        if (d > tower.range) continue;

        const resist = e.fieldResist || 0;
        const slow = (tower.fieldSlow || 0.3) * (1 - resist);
        e.fieldSlowNow = Math.max(e.fieldSlowNow, slow);

        // Shield / HP drain
        let dps = tower.damage * (1 - resist * 0.5);
        if (sourceShieldBonus(tower) && e.shield > 0) dps *= tower.shieldBonus || 1;
        if (e.shield > 0) {
          e.shield = Math.max(0, e.shield - dps * dt * 1.5);
        } else if (tower.fieldHurtHp) {
          e.hp -= dps * dt * 0.6;
          if (e.hp <= 0) this._killEnemy(e, tower);
        }

        // Push light units back slightly
        if (tower.fieldPush && resist < 0.6 && e.stunTimer <= 0) {
          e.dist = Math.max(0, e.dist - tower.fieldPush * (1 - resist) * dt);
        }

        // Stun ticks
        if (tower.fieldStun && tower.fieldStunTimer <= 0 && resist < 0.75) {
          e.stunTimer = Math.max(e.stunTimer, tower.fieldStun * (1 - resist));
        }

        if (Math.random() < dt * 3) {
          this._spawnParticles(e.x, e.y, tower.color || "#66ffcc", 1, 0.4);
        }
      }
      if (tower.fieldStun && tower.fieldStunTimer <= 0) {
        tower.fieldStunTimer = tower.fieldStunCd || 2.5;
      }
      return; // no projectiles
    }

    // Teleport station
    if (beh === "teleport") {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) return;
      const targets = this._getTowerTargets(tower).filter((e) => {
        if (e.teleportImmune && !tower.bypassTeleportImmune) return false;
        return true;
      });
      if (!targets.length) return;

      const n = Math.min(tower.multiTarget || 1, targets.length);
      for (let i = 0; i < n; i++) {
        const e = targets[i];
        const from = { x: e.x, y: e.y };
        e.dist = Math.max(0, e.dist - (tower.teleportDist || 140));
        const pos = pathPointAt(e.dist);
        e.x = pos.x;
        e.y = pos.y - (e.flying ? 16 : 0);
        e.angle = pos.angle;
        if (tower.stun) e.stunTimer = Math.max(e.stunTimer, tower.stun);
        if (tower.damage > 0) this._damageEnemy(e, tower.damage, tower.dmgType || DMG.PLASMA, tower);
        this._spawnParticles(from.x, from.y, "#c080ff", 10, 2);
        this._spawnParticles(e.x, e.y, "#66ffcc", 10, 2);
        this._floatText(e.x, e.y - 16, "BLINK", "#c080ff");
      }
      AudioFX.teleport();
      tower.cooldown = 1 / Math.max(tower.fireRate, 0.05);
      tower.kills += 0; // utility
      return;
    }

    // Hive deploy
    if (beh === "hive") {
      tower.cooldown -= dt;
      if (tower.cooldown <= 0) {
        const hasTargets = this.enemies.some((e) => e.alive);
        if (hasTargets && this._countAllies(tower.id, "drone") < tower.maxDrones) {
          this._spawnAllyDrone(tower);
          tower.cooldown = 1 / Math.max(tower.fireRate, 0.05);
          AudioFX.shot();
        }
      }
      return;
    }

    // Mech bay deploy
    if (beh === "mech") {
      tower.cooldown -= dt;
      if (tower.cooldown <= 0) {
        const hasTargets = this.enemies.some((e) => e.alive);
        if (hasTargets && this._countAllies(tower.id, "mech") < tower.maxMechs) {
          this._spawnAllyMech(tower);
          tower.cooldown = 1 / Math.max(tower.fireRate, 0.05);
          AudioFX.place();
        }
      }
      return;
    }

    // Standard / rover shooting
    if (tower.fireRate <= 0) return;
    tower.cooldown -= dt;
    if (tower.cooldown <= 0) {
      const targets = this._getTowerTargets(tower);
      if (targets.length) {
        this._fireTower(tower, targets);
        tower.cooldown = 1 / tower.fireRate;
      }
    }
  }

  _updateAllies(dt) {
    for (const a of this.allies) {
      if (!a.alive) continue;
      a.life -= dt;
      if (a.life <= 0) {
        a.alive = false;
        continue;
      }

      if (a.kind === "drone") {
        let target = this.enemies.find((e) => e.id === a.targetId && e.alive);
        if (!target) {
          let best = null;
          let bestD = Infinity;
          for (const e of this.enemies) {
            if (!e.alive) continue;
            if (e.stealth && !(a.towerRef && a.towerRef.detectStealth)) continue;
            const d = Math.hypot(e.x - a.x, e.y - a.y);
            if (d < bestD) {
              bestD = d;
              best = e;
            }
          }
          target = best;
          a.targetId = target ? target.id : null;
        }
        if (target) {
          const ang = Math.atan2(target.y - a.y, target.x - a.x);
          a.vx = Math.cos(ang) * a.speed;
          a.vy = Math.sin(ang) * a.speed;
          a.x += a.vx * dt;
          a.y += a.vy * dt;
          if (Math.hypot(target.x - a.x, target.y - a.y) < target.radius + a.radius + 4) {
            this._damageEnemy(target, a.damage, a.dmgType, a.towerRef);
            if (a.splash > 0) {
              for (const e of this.enemies) {
                if (!e.alive || e === target) continue;
                if (Math.hypot(e.x - target.x, e.y - target.y) < a.splash) {
                  this._damageEnemy(e, a.damage * 0.5, a.dmgType, a.towerRef);
                }
              }
            }
            // drones persist and keep attacking (small cooldown via brief push)
            a.x -= Math.cos(ang) * 12;
            a.y -= Math.sin(ang) * 12;
          }
        }
      } else if (a.kind === "mech") {
        // Advance along path toward base, fight nearest enemy in range
        let nearest = null;
        let nd = 70;
        for (const e of this.enemies) {
          if (!e.alive || e.flying) continue;
          const d = Math.hypot(e.x - a.x, e.y - a.y);
          if (d < nd) {
            nd = d;
            nearest = e;
          }
        }
        if (nearest) {
          a.cooldown -= dt;
          if (a.cooldown <= 0) {
            this._damageEnemy(nearest, a.damage, a.dmgType, a);
            a.cooldown = 0.55;
            this._spawnParticles(nearest.x, nearest.y, a.color, 3, 1);
          }
        } else {
          a.dist += a.speed * dt;
          if (a.dist > PATH_DATA.total - 30) a.dist = PATH_DATA.total - 30;
        }
        // Always stay on path
        if (!nearest) {
          /* moved above */
        } else {
          // step slowly toward enemy along path
          if (nearest.dist > a.dist) a.dist += a.speed * 0.4 * dt;
          else a.dist -= a.speed * 0.4 * dt;
        }
        const pos = pathPointAt(a.dist);
        a.x = pos.x;
        a.y = pos.y;
        a.angle = pos.angle;
      }
    }
    this.allies = this.allies.filter((a) => a.alive);
  }

  _updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.age += dt;
      if (p.arcing) {
        p.arcT += dt / p.arcDuration;
        const t = clamp(p.arcT, 0, 1);
        const tgt = this.enemies.find((e) => e.id === p.targetId && e.alive);
        if (tgt) {
          p.tx = tgt.x;
          p.ty = tgt.y;
        }
        p.x = lerp(p.startX, p.tx, t);
        p.y = lerp(p.startY, p.ty, t) - Math.sin(t * Math.PI) * 80;
        if (t >= 1) {
          this._projectileImpact(p);
          p.dead = true;
        }
      } else {
        const tgt = this.enemies.find((e) => e.id === p.targetId && e.alive);

        if (p.homing && tgt) {
          const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          const cur = Math.atan2(p.vy, p.vx);
          let diff = ang - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          // Plasma / guided: turn hard enough to stay locked
          const turnRate = p.dmgType === DMG.PLASMA ? 14 : 10;
          const na = cur + clamp(diff, -turnRate * dt, turnRate * dt);
          p.vx = Math.cos(na) * p.speed;
          p.vy = Math.sin(na) * p.speed;
          p.tx = tgt.x;
          p.ty = tgt.y;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Hit test vs enemies
        let hit = false;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (e.flying && !p.towerRef.canHitFlying) continue;
          if (p.towerRef.airOnly && !e.flying) continue;
          // Generous hit box so slow/splash shots don't "ghost" past units
          const pad = p.splash > 0 ? 4 : 3;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < e.radius + p.radius + pad) {
            if (p.splash > 0) {
              this._projectileImpact(p, e);
              p.dead = true;
            } else {
              this._damageEnemy(e, p.damage, p.dmgType, p.towerRef);
              p.pierced++;
              if (p.pierced >= p.pierce) p.dead = true;
            }
            hit = true;
            if (p.dead) break;
          }
        }

        // Splash bolts: detonate when close to the locked target (or aim point)
        // so they don't sail into the void if they barely miss the hitbox
        if (!hit && !p.dead && p.splash > 0) {
          if (tgt) {
            const dT = Math.hypot(tgt.x - p.x, tgt.y - p.y);
            if (dT < Math.max(p.splash, tgt.radius + p.radius + 6)) {
              this._projectileImpact(p, tgt);
              p.dead = true;
              hit = true;
            }
          } else {
            const dAim = Math.hypot(p.tx - p.x, p.ty - p.y);
            if (dAim < p.splash + 8) {
              this._projectileImpact(p);
              p.dead = true;
              hit = true;
            }
          }
        }

        // Homing: if still no hit and we overshot past target, snap-impact once very close
        if (!hit && !p.dead && p.homing && tgt) {
          const dT = Math.hypot(tgt.x - p.x, tgt.y - p.y);
          if (dT < tgt.radius + p.radius + 10) {
            if (p.splash > 0) this._projectileImpact(p, tgt);
            else this._damageEnemy(tgt, p.damage, p.dmgType, p.towerRef);
            p.dead = true;
          }
        }

        if (p.age > p.maxAge) p.dead = true;
        if (p.x < -60 || p.y < -60 || p.x > CONFIG.logicalW + 60 || p.y > CONFIG.logicalH + 60) p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  _projectileImpact(p, directHit = null) {
    const cx = directHit ? directHit.x : p.x;
    const cy = directHit ? directHit.y : p.y;
    this._spawnParticles(cx, cy, p.color, 10, 2);
    this._spawnParticles(cx, cy, "#ffaa44", 5, 1.5);
    AudioFX.explosion();
    if (p.splash > 0) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.flying && !p.towerRef.canHitFlying && p.dmgType !== DMG.AA) continue;
        if (p.towerRef.airOnly && !e.flying) continue;
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d <= p.splash + e.radius) {
          const falloff = 1 - (d / (p.splash + e.radius)) * 0.4;
          this._damageEnemy(e, p.damage * falloff, p.dmgType, p.towerRef);
        }
      }
    } else if (directHit) {
      this._damageEnemy(directHit, p.damage, p.dmgType, p.towerRef);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    const W = CONFIG.logicalW;
    const H = CONFIG.logicalH;

    this._drawTerrain(ctx, W, H);
    this._drawPath(ctx);
    this._drawBase(ctx);

    // Force field zones under units
    for (const t of this.towers) {
      if (t.behavior === "force") this._drawForceField(ctx, t);
    }

    if (this.selectedTowerType && this.state !== STATE.MENU) {
      this._drawPlacementPreview(ctx);
    }

    for (const t of this.towers) {
      if (this.showAllRanges || this.selectedTower === t) {
        this._drawRange(ctx, t.x, t.y, t.range, t === this.selectedTower, t.color || TOWER_TYPES[t.type].color);
      }
    }

    for (const t of this.towers) this._drawTower(ctx, t);
    for (const a of this.allies) this._drawAlly(ctx, a);
    for (const e of this.enemies) if (e.alive) this._drawEnemy(ctx, e);
    for (const p of this.projectiles) this._drawProjectile(ctx, p);

    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (pt.life / pt.maxLife), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = "bold 12px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    for (const ft of this.floatingTexts) {
      ctx.globalAlpha = clamp(ft.life / 0.75, 0, 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    if (this.state === STATE.PAUSED) {
      ctx.fillStyle = "rgba(0,10,20,0.4)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8f0ff";
      ctx.font = "bold 32px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, H / 2);
      ctx.font = "14px Segoe UI, sans-serif";
      ctx.fillStyle = "#88aacc";
      ctx.fillText("Space to resume", W / 2, H / 2 + 28);
    }
  }

  _drawTerrain(ctx, W, H) {
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#1a2830");
    grd.addColorStop(0.4, "#1e2a28");
    grd.addColorStop(1, "#162028");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Hex-ish tech grid
    ctx.strokeStyle = "rgba(60,120,140,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Soft neon patches
    for (let i = 0; i < 18; i++) {
      const x = (i * 137 + 50) % W;
      const y = (i * 89 + 30) % H;
      ctx.fillStyle = i % 2 ? "rgba(40,100,120,0.12)" : "rgba(60,40,90,0.1)";
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + (i % 4) * 10, 28, i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPath(ctx) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#0a1520";
    ctx.lineWidth = CONFIG.pathWidth + 10;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Glowing transit lane
    ctx.strokeStyle = "#2a3a48";
    ctx.lineWidth = CONFIG.pathWidth;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(80,200,255,0.25)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 12]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spawn
    const s = PATH[0];
    ctx.fillStyle = "rgba(255,80,100,0.45)";
    ctx.beginPath();
    ctx.arc(s.x + 28, s.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6688";
    ctx.font = "bold 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("INGRESS", s.x + 28, s.y - 16);
    ctx.restore();
  }

  _drawBase(ctx) {
    const last = PATH[PATH.length - 1];
    const bx = last.x - 50;
    const by = last.y;
    ctx.save();

    ctx.fillStyle = "#1a2830";
    ctx.strokeStyle = "#44ddff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(68,221,255,0.4)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(bx - 34, by - 26, 68, 52, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#0a1820";
    ctx.fillRect(bx - 18, by - 10, 14, 14);
    ctx.fillRect(bx + 6, by - 10, 14, 14);
    ctx.fillStyle = "#44ddff";
    ctx.font = "bold 9px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CORE", bx, by + 20);

    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bx, by - 4, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = this.integrity > 50 ? "#44ddff" : this.integrity > 25 ? "#d4a84b" : "#ff4466";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, by - 4, 30, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.integrity) / CONFIG.startIntegrity);
    ctx.stroke();
    ctx.restore();
  }

  _drawForceField(ctx, t) {
    const pulse = 0.5 + Math.sin(this.time * 3 + t.id) * 0.15;
    ctx.save();
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(100,255,200,${0.06 * pulse})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(100,255,200,${0.35 * pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.restore();
  }

  _drawRange(ctx, x, y, range, selected, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "rgba(212,168,75,0.1)" : "rgba(80,180,200,0.06)";
    ctx.fill();
    ctx.strokeStyle = selected ? "rgba(212,168,75,0.55)" : "rgba(80,180,200,0.28)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  _drawPlacementPreview(ctx) {
    const def = TOWER_TYPES[this.selectedTowerType];
    // Prefer pinned site; otherwise follow hover (desktop)
    let x, y, valid;
    if (this.pendingPlace) {
      x = this.pendingPlace.x;
      y = this.pendingPlace.y;
      valid = this.pendingPlace.valid;
    } else {
      x = this.hoverPos.x;
      y = this.hoverPos.y;
      valid = isValidPlacement(x, y, this.towers, this.selectedTowerType);
      if (def.behavior === "rover") {
        const n = nearestPathDist(x, y);
        const p = pathPointAt(n.dist);
        const nx = -Math.sin(p.angle);
        const ny = Math.cos(p.angle);
        const side = Math.sign((x - p.x) * nx + (y - p.y) * ny) || 1;
        const off = pathPointOffset(n.dist, side * CONFIG.roverPathOffset);
        x = off.x;
        y = off.y;
      }
    }

    ctx.save();
    ctx.globalAlpha = this.pendingPlace ? 0.9 : 0.55;
    this._drawRange(ctx, x, y, def.range, true, def.color);
    ctx.strokeStyle = valid ? "#44ddff" : "#ff4466";
    ctx.fillStyle = valid ? "rgba(68,221,255,0.3)" : "rgba(255,68,100,0.28)";
    ctx.lineWidth = this.pendingPlace ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.towerPlaceRadius + (this.pendingPlace ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pulsing ring when pinned & valid
    if (this.pendingPlace && valid) {
      const pulse = 0.5 + Math.sin(this.time * 6) * 0.5;
      ctx.strokeStyle = `rgba(68,221,255,${0.35 + pulse * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, CONFIG.towerPlaceRadius + 10 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#44ddff";
      ctx.font = "bold 11px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("DEPLOY?", x, y - 28);
    }

    ctx.fillStyle = "#fff";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.icon, x, y);
    ctx.restore();
    this.canvas.style.cursor = valid ? "cell" : "not-allowed";
  }

  /**
   * Upscaled Pulse Turret bitmap, or null while loading / if the file failed.
   * Callers fall back to the procedural turret when this returns null.
   */
  _pulseSpriteFrame() {
    if (this._pulseSpriteFailed) return null;
    if (this._pulseSpriteCanvas) return this._pulseSpriteCanvas;
    const img = this._pulseSprite;
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    const size = PULSE_SPRITE_DRAW_SIZE;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, size, size);
    this._pulseSpriteCanvas = c;
    return c;
  }

  _drawPulseSprite(ctx, t, frame) {
    if (t === this.selectedTower) {
      ctx.strokeStyle = "#d4a84b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate((t.angle || 0) + PULSE_SPRITE_AIM_OFFSET);
    ctx.imageSmoothingEnabled = false;
    const s = PULSE_SPRITE_DRAW_SIZE;
    ctx.drawImage(frame, -s / 2, -s / 2, s, s);
  }

  _drawTower(ctx, t) {
    const def = TOWER_TYPES[t.type];
    const pulseFrame = t.type === "pulse" ? this._pulseSpriteFrame() : null;
    ctx.save();
    ctx.translate(t.x, t.y);

    if (pulseFrame) {
      this._drawPulseSprite(ctx, t, pulseFrame);
      ctx.restore();
      this._drawUpgradePips(ctx, t);
      return;
    }

    // Base
    ctx.fillStyle = "#0e1820";
    ctx.strokeStyle = t === this.selectedTower ? "#d4a84b" : def.color;
    ctx.lineWidth = t === this.selectedTower ? 2.5 : 1.5;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, t.behavior === "rover" ? 14 : 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.rotate(t.angle || 0);
    ctx.fillStyle = def.color;

    switch (t.behavior) {
      case "force":
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.time;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
          ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
          ctx.stroke();
        }
        break;
      case "teleport":
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, -10);
        ctx.lineTo(10, -4);
        ctx.lineTo(4, -4);
        ctx.fill();
        break;
      case "rover":
        ctx.fillRect(-10, -7, 20, 14);
        ctx.fillStyle = "#1a2030";
        ctx.fillRect(-4, -4, 12, 8);
        ctx.fillStyle = def.color;
        ctx.fillRect(4, -2, 10, 4);
        break;
      case "hive":
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const px = Math.cos(a) * 11;
          const py = Math.sin(a) * 11;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case "mech":
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = "#1a1520";
        ctx.fillRect(-5, -12, 4, 8);
        ctx.fillRect(1, -12, 4, 8);
        break;
      default:
        if (t.type === "plasma") {
          ctx.beginPath();
          ctx.moveTo(12, 0);
          ctx.lineTo(-6, -8);
          ctx.lineTo(-6, 8);
          ctx.closePath();
          ctx.fill();
        } else if (t.type === "missile") {
          ctx.beginPath();
          ctx.moveTo(-6, -10);
          ctx.lineTo(12, 0);
          ctx.lineTo(-6, 10);
          ctx.closePath();
          ctx.fill();
        } else if (t.type === "rail") {
          ctx.fillRect(-5, -6, 10, 12);
          ctx.fillStyle = "#c0d0ff";
          ctx.fillRect(2, -1.5, 18, 3);
        } else if (t.type === "aa") {
          ctx.fillRect(-8, -8, 16, 16);
          ctx.strokeStyle = "#d0e0ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(14, -5);
          ctx.moveTo(0, 0);
          ctx.lineTo(14, 5);
          ctx.stroke();
        } else if (t.type === "mortar") {
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#5a4020";
          ctx.fillRect(-3, -15, 6, 12);
        } else {
          // pulse
          ctx.fillRect(-7, -7, 14, 14);
          ctx.fillStyle = "#1a3020";
          ctx.fillRect(3, -2, 12, 4);
        }
    }

    ctx.restore();
    this._drawUpgradePips(ctx, t);
  }

  _drawUpgradePips(ctx, t) {
    const total = t.pathLevel.A + t.pathLevel.B + t.pathLevel.C;
    if (total > 0) {
      ctx.fillStyle = "#d4a84b";
      for (let i = 0; i < total; i++) {
        ctx.beginPath();
        ctx.arc(t.x - 10 + i * 5, t.y + 20, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawAlly(ctx, a) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * (a.life / a.maxLife);
    if (a.kind === "drone") {
      ctx.translate(a.x, a.y);
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(150,220,255,0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.translate(a.x, a.y);
      ctx.rotate(a.angle || 0);
      ctx.fillStyle = a.color;
      ctx.fillRect(-9, -8, 18, 16);
      ctx.fillStyle = "#1a1520";
      ctx.fillRect(-4, -5, 10, 10);
      // hp
      ctx.rotate(-(a.angle || 0));
      const pct = a.hp / a.maxHp;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-10, -16, 20, 3);
      ctx.fillStyle = "#66ff88";
      ctx.fillRect(-10, -16, 20 * pct, 3);
    }
    ctx.restore();
  }

  _drawEnemy(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    if (e.hitFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(e.hitFlash * 80) * 0.4;
    if (e.stealth) ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.5);

    const r = e.radius;

    switch (e.shape) {
      case "grunt":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 0.45, -r * 0.7, r * 0.9, r * 1.4);
        ctx.beginPath();
        ctx.arc(0, -r * 0.85, r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = e.accent;
        ctx.fill();
        break;
      case "bot":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 0.7, -r * 0.55, r * 1.4, r * 1.1);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.3, -r * 0.35, r * 0.6, r * 0.5);
        ctx.fillStyle = "#111";
        ctx.fillRect(-r * 0.5, r * 0.4, 3, 4);
        ctx.fillRect(r * 0.3, r * 0.4, 3, 4);
        break;
      case "botHeavy":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.35, -r * 0.4, r * 0.7, r * 0.7);
        ctx.fillStyle = "#222";
        ctx.fillRect(0, -2, r * 0.9, 4);
        break;
      case "drone":
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(-r * 0.55, -r * 0.65);
        ctx.lineTo(-r * 0.25, 0);
        ctx.lineTo(-r * 0.55, r * 0.65);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = e.accent;
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "gunship":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 0.9, -r * 0.45, r * 1.8, r * 0.9);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.2, -r * 0.3, r, r * 0.6);
        ctx.strokeStyle = "rgba(200,220,255,0.5)";
        ctx.lineWidth = 2;
        const rot = this.time * 20;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rot) * r, Math.sin(rot) * r * 0.25);
        ctx.lineTo(Math.cos(rot + Math.PI) * r, Math.sin(rot + Math.PI) * r * 0.25);
        ctx.stroke();
        break;
      case "hover":
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.accent;
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.5, r * 0.7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "carrier":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 1.15, -r * 0.6, r * 2.3, r * 1.2);
        ctx.fillStyle = e.accent;
        ctx.fillRect(r * 0.15, -r * 0.45, r * 0.85, r * 0.9);
        ctx.rotate(-e.angle);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CR", 0, 3);
        break;
      case "walker":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 0.9, -r * 0.7, r * 1.8, r * 1.3);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.35, -r * 0.4, r * 0.9, r * 0.7);
        ctx.fillStyle = "#222";
        ctx.fillRect(0, -3, r * 1.1, 5);
        break;
      case "artillery":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r, -r * 0.5, r * 2, r);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.3, -r * 1.0, r * 0.5, r * 0.55);
        break;
      case "phase":
        ctx.globalAlpha *= 0.75;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.8, r * 0.6);
        ctx.lineTo(-r * 0.8, r * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = e.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case "bearer":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.strokeStyle = e.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "colossus":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r, -r * 0.75, r * 2, r * 1.5);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.4, -r * 0.45, r * 0.9, r * 0.8);
        ctx.strokeStyle = e.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(-r, -r * 0.75, r * 2, r * 1.5);
        break;
      case "mothership":
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.accent;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "command":
        ctx.fillStyle = e.color;
        ctx.fillRect(-r * 1.05, -r * 0.7, r * 2.1, r * 1.4);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-r * 0.35, -r * 0.45, r * 0.7, r * 0.9);
        ctx.rotate(-e.angle);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CMD", 0, 3);
        break;
      default:
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
    }

    if (e.stunTimer > 0) {
      ctx.rotate(-e.angle);
      ctx.fillStyle = "#88eeff";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("⚡", 0, -r - 8);
    }

    ctx.restore();

    // HP + shield bars
    const bw = e.radius * 2.4;
    const baseY = e.y - e.radius - (e.flying ? 10 : 14);
    if (e.shield > 0 || e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(e.x - bw / 2, baseY, bw, 3);
      ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#4acf7a" : e.hp / e.maxHp > 0.25 ? "#d4a84b" : "#ff4466";
      ctx.fillRect(e.x - bw / 2, baseY, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    if (e.maxShield > 0 && e.shield > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(e.x - bw / 2, baseY - 4, bw, 3);
      ctx.fillStyle = "#44ddff";
      ctx.fillRect(e.x - bw / 2, baseY - 4, bw * clamp(e.shield / e.maxShield, 0, 1), 3);
    }
  }

  _drawProjectile(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const ang = Math.atan2(p.vy, p.vx);
    if (!p.arcing) ctx.rotate(ang);

    if (p.arcing) {
      ctx.fillStyle = "#c8a050";
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.dmgType === DMG.PLASMA) {
      ctx.fillStyle = "#44ddff";
      ctx.shadowColor = "#44ddff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (p.dmgType === DMG.EXPLOSIVE) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
    } else if (p.dmgType === DMG.AA) {
      ctx.fillStyle = "#c0d0e0";
      ctx.fillRect(-5, -1.5, 10, 3);
    } else if (p.dmgType === DMG.RAIL) {
      ctx.fillStyle = "#aaccff";
      ctx.fillRect(-10, -1, 20, 2);
    } else {
      ctx.fillStyle = "#c0ffd0";
      ctx.fillRect(-4, -1, 8, 2);
    }
    ctx.restore();
  }

  // ── Loop ───────────────────────────────────────────────────────────────

  _loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    let frameDt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    frameDt = Math.min(frameDt, 0.05);

    const scaled = frameDt * (this.state === STATE.PAUSED ? 0 : this.speed);
    this.accum += scaled;
    let steps = 0;
    while (this.accum >= this.fixedDt && steps < 5) {
      this._update(this.fixedDt);
      this.accum -= this.fixedDt;
      steps++;
    }
    if (this.accum > 0 && steps < 5 && this.state !== STATE.PAUSED) {
      this._update(this.accum);
      this.accum = 0;
    }

    this._draw();
    requestAnimationFrame((t) => this._loop(t));
  }
}

function sourceShieldBonus(tower) {
  return tower.shieldBonus && tower.shieldBonus > 1;
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

window.addEventListener("DOMContentLoaded", () => {
  window.game = new Game();
});
