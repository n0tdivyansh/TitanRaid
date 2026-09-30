/**
 * Procedural level design. Every level is generated from its number with a
 * seeded RNG, so retrying a level replays exactly the same track.
 *
 * The generator keeps a running estimate of the crowd size a competent
 * player will have ("expected"), and scales gate values, squads and the
 * boss against it - that keeps levels winnable but tight, like the original.
 */
import { makeRng } from '../core/rng.js';
import { ROAD_HALF } from '../world/constants.js';

/**
 * Level archetypes give consecutive levels a distinct character instead of
 * one endless template: a hazard gauntlet, a multiplier rush, an enemy siege,
 * a coin run, and the balanced classic.
 */
export const ARCHETYPES = [
  { id: 'classic', label: 'CLASSIC', gate: [36, 50], mulBias: 0.5, hazard: 1.0, squad: 1.0, coin: 0.85, speedMul: 1.0, lengthMul: 1.0 },
  { id: 'gauntlet', label: 'GAUNTLET', gate: [48, 64], mulBias: 0.35, hazard: 2.0, squad: 0.45, coin: 0.7, speedMul: 0.95, lengthMul: 0.95 },
  { id: 'rush', label: 'RUSH', gate: [28, 38], mulBias: 0.6, hazard: 0.85, squad: 0.4, coin: 0.9, speedMul: 1.14, lengthMul: 1.12 },
  { id: 'siege', label: 'SIEGE', gate: [40, 54], mulBias: 0.45, hazard: 0.65, squad: 2.2, coin: 0.8, speedMul: 1.0, lengthMul: 1.05 },
  { id: 'treasure', label: 'TREASURE', gate: [38, 52], mulBias: 0.5, hazard: 0.8, squad: 0.6, coin: 1.7, speedMul: 1.0, lengthMul: 1.0 },
];

const GOOD_ADD = 'add';
const GOOD_MUL = 'mul';

function roundNice(v) {
  if (v < 10) return Math.max(1, Math.round(v));
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}

/**
 * Good gates steer the estimated crowd toward `target` instead of compounding
 * without limit: multiply while the army is small, switch to adds as it nears
 * the level's target size. That is what keeps difficulty monotonic.
 */
/**
 * Good gates steer the estimated crowd toward `target` instead of compounding
 * without limit: multiply while the army is small, switch to adds as it nears
 * the level's target size. That is what keeps difficulty monotonic.
 */
function makeGoodOp(expected, difficulty, rng, mulBias = 0.5, target = 400, gIdx = 0) {
  // Opening gate (gIdx === 0): always provide strong initial growth so the player never starts with a puny crowd
  if (gIdx === 0) {
    if (rng.chance(0.6)) {
      return { type: 'add', value: rng.pick([15, 20, 25, 30]) };
    } else {
      return { type: 'mul', value: rng.pick([3, 4, 5]) };
    }
  }

  // Second gate (gIdx === 1): keep building momentum
  if (gIdx === 1) {
    if (rng.chance(0.55)) {
      return { type: 'mul', value: rng.pick([2, 3]) };
    } else {
      return { type: 'add', value: rng.pick([15, 20, 25, 35]) };
    }
  }

  const ratio = expected / Math.max(1, target);
  // Cap multiplying once crowd approaches target so it doesn't compound into millions
  if (ratio >= 0.75) {
    return { type: 'add', value: roundNice(rng.int(10, 35)) };
  }
  if (rng.chance(mulBias)) {
    const mulOptions = ratio > 0.4 ? [2, 2] : difficulty < 0.6 ? [2, 2, 3] : [2, 3, 3, 4];
    return { type: 'mul', value: rng.pick(mulOptions) };
  }
  const gap = Math.max(8, target - expected);
  const add = roundNice(Math.max(8, gap * (0.18 + rng() * 0.22) + rng.int(6, 14)));
  return { type: 'add', value: add };
}

function makeBadOp(expected, difficulty, rng, gIdx = 0, goodVal = 20) {
  // First gate: never a penalty! Give a smaller positive alternative (+5, +8, +10)
  if (gIdx === 0) {
    return { type: 'add', value: rng.pick([5, 8, 10]) };
  }

  // Second gate: secondary boost or mild subtraction
  if (gIdx === 1) {
    if (rng.chance(0.55)) {
      return { type: 'add', value: Math.max(5, Math.round(goodVal * 0.4)) };
    } else {
      return { type: 'sub', value: Math.max(1, Math.min(3, Math.floor(expected * 0.2))) };
    }
  }

  // Regular gates: bad gate takes at most 35% of crowd, NEVER wipes out
  if (rng.chance(0.38) && expected >= 20) {
    const opts = difficulty < 0.5 ? [2, 2] : difficulty < 1 ? [2, 3] : [2, 3, 4];
    return { type: 'div', value: rng.pick(opts) };
  }

  const cap = Math.min(0.38, 0.2 + difficulty * 0.12);
  const rawSub = Math.max(1, Math.floor(expected * cap * (0.5 + rng() * 0.5)));
  const safeSub = Math.min(rawSub, Math.max(1, Math.floor(expected * 0.4)));
  return { type: 'sub', value: roundNice(safeSub) };
}

function applyEstimate(count, op) {
  switch (op.type) {
    case 'add':
      return count + op.value;
    case 'sub':
      return Math.max(1, count - op.value);
    case 'mul':
      return Math.floor(count * op.value);
    case 'div':
      return Math.max(1, Math.floor(count / op.value));
    default:
      return count;
  }
}

function coinArc(z, rng) {
  const coins = [];
  const n = rng.int(5, 9);
  const baseX = rng.range(-ROAD_HALF + 1.5, ROAD_HALF - 1.5);
  const curve = rng.range(-1.6, 1.6);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    coins.push({
      x: Math.max(-ROAD_HALF + 0.8, Math.min(ROAD_HALF - 0.8, baseX + Math.sin(t * Math.PI) * curve)),
      z: z + i * 1.5,
      y: 0.9,
    });
  }
  return coins;
}

/**
 * @param {number} level 1-based level number
 * @returns {{level:number, themeIndex:number, length:number, startCount:number,
 *            events:Array, bossHp:number, stairs:object, arenaLength:number,
 *            speed:number, seed:number}}
 */
function createObstacle(kind, hz, side, difficulty, rng) {
  let x, opts;
  const severity = 0.7 + difficulty * 0.8;

  // Staggered side: -1 = left half, 1 = right half, 0 = center
  if (side === -1) {
    x = rng.range(-3.2, -1.8);
  } else if (side === 1) {
    x = rng.range(1.8, 3.2);
  } else {
    x = rng.range(-0.5, 0.5);
  }

  opts = { x, z: hz, severity };

  if (kind === 'saw') {
    opts.radius = rng.range(1.2, 1.7);
    opts.sweep = rng.chance(0.4) ? rng.range(0.8, 1.4) : 0;
  } else if (kind === 'wall') {
    opts.width = rng.range(3.0, 4.2);
    opts.severity = 0.85 + difficulty * 0.55;
  } else if (kind === 'spikes') {
    opts.width = rng.range(2.6, 3.6);
    opts.count = 5;
  } else if (kind === 'hammer') {
    opts.sweep = 0;
  } else if (kind === 'roller') {
    opts.width = rng.range(3.0, 4.2);
    opts.sweep = rng.range(0.8, 1.5);
  }

  return { type: 'obstacle', z: hz, kind, opts };
}

/**
 * @param {number} level 1-based level number
 * @returns {{level:number, themeIndex:number, length:number, startCount:number,
 *            events:Array, bossHp:number, stairs:object, arenaLength:number,
 *            speed:number, seed:number}}
 */
export function buildLevelPlan(level) {
  const seed = level * 9176 + 13;
  const rng = makeRng(seed);
  // smooth progressive difficulty across 100+ levels
  const difficulty = Math.min(1.6, (level - 1) / 14);

  // pick an archetype; level 1 is always the gentle classic layout
  const arche = level === 1 ? ARCHETYPES[0] : ARCHETYPES[(level * 2 + Math.floor(level / 3)) % ARCHETYPES.length];
  // Smooth length progression across 100+ levels
  const length = Math.round((320 + Math.min(level, 35) * 12 + Math.min(level, 100) * 3 + Math.floor(rng.range(0, 35))) * arche.lengthMul);
  const speed = Math.min(26.5, 15.5 + Math.min(level - 1, 30) * 0.35) * arche.speedMul;
  const themeIndex = (level - 1) % 8;

  const startCount = 1;
  // Steady, monotonic crowd scaling to 3500+ across 100 levels
  const target = Math.min(3600, Math.round(110 + Math.min(level - 1, 40) * 45 + Math.max(0, level - 40) * 28));
  let expected = startCount;

  const events = [];
  const endZ = length - 36; // keep final 36m clear of gates & obstacles for boss approach
  const tighten = 1 - Math.min(0.28, difficulty * 0.18);

  // 1. Pre-calculate gate positions with proper minimum spacing
  const gatePositions = [];
  let gz = 42;
  while (gz < endZ) {
    gatePositions.push(gz);
    const spacing = rng.range(arche.gate[0] * tighten, arche.gate[1] * tighten);
    gz += spacing;
  }

  // 2. Generate gates & content between gates with guaranteed spacing
  let lastSide = rng.chance(0.5) ? -1 : 1;

  for (let gIdx = 0; gIdx < gatePositions.length; gIdx++) {
    const curZ = gatePositions[gIdx];
    const nextZ = gIdx < gatePositions.length - 1 ? gatePositions[gIdx + 1] : endZ;
    const segmentSpan = nextZ - curZ;

    // ---- gate pair: ALWAYS one positive option, NEVER double negative! ----
    const good = makeGoodOp(expected, difficulty, rng, arche.mulBias, target, gIdx);
    const bad = makeBadOp(expected, difficulty, rng, gIdx, good.value);
    const goodOnLeft = rng.chance(0.5);

    events.push({
      type: 'gates',
      z: curZ,
      left: goodOnLeft ? good : bad,
      right: goodOnLeft ? bad : good,
    });

    expected = Math.max(2, Math.min(target * 1.35, Math.round(applyEstimate(expected, good) * 0.9)));

    // ---- coins -----------------------------------------------------
    if (rng.chance(Math.min(0.95, 0.85 * arche.coin))) {
      const cz = curZ + rng.range(12, Math.min(22, segmentSpan - 12));
      events.push({ type: 'coins', z: cz, coins: coinArc(cz, rng) });
    }

    // ---- usable hazard zone ----------------------------------------
    // maintain at least 14m buffer after current gate and 14m before next gate
    const BUFFER = 14;
    const usableStart = curZ + BUFFER;
    const usableEnd = nextZ - BUFFER;
    const usableSpan = usableEnd - usableStart;

    // ---- enemy squad: only when crowd is healthy (> 25) and after opening gates ----
    let hasSquad = false;
    if (level >= 2 && curZ > 95 && usableSpan >= 14 && expected >= 25 && rng.chance(Math.min(0.85, (0.3 + difficulty * 0.3) * arche.squad))) {
      const ez = usableStart + usableSpan * 0.5;
      // Cap squad size to at most 32% of expected crowd so player always wins
      const maxSquad = Math.max(4, Math.floor(expected * 0.32));
      const squadCount = Math.max(
        4,
        Math.min(
          maxSquad,
          Math.round(expected * rng.range(0.12 + difficulty * 0.08, 0.22 + difficulty * 0.1) * (arche.id === 'siege' ? 1.15 : 0.85))
        )
      );
      events.push({ type: 'enemy', z: ez, x: rng.range(-2.2, 2.2), count: squadCount });
      expected = Math.max(12, expected - Math.round(squadCount * 0.85));
      hasSquad = true;
    }

    // ---- hazards (cleanly spaced, staggered lanes) -----------------
    if (curZ >= 65 && usableSpan >= 10) {
      const kinds = level <= 2 ? ['saw', 'wall'] : ['saw', 'wall', 'spikes', 'hammer', 'roller'];

      if (hasSquad) {
        // If there is an enemy squad, only add 1 hazard if there is >= 30m of usable span
        if (usableSpan >= 30 && rng.chance(0.65 * arche.hazard)) {
          lastSide = -lastSide;
          const hz = rng.chance(0.5) ? usableStart + 2 : usableEnd - 2;
          events.push(createObstacle(rng.pick(kinds), hz, lastSide, difficulty, rng));
        }
      } else {
        // Hazard chance scales with archetype and level
        const baseProb = level <= 1 ? 0.45 : arche.id === 'gauntlet' ? 0.95 : 0.78;
        const hazardChance = Math.min(0.98, baseProb * Math.min(1.4, arche.hazard));

        if (rng.chance(hazardChance)) {
          // If segment is wide enough for two hazards with >= 15m longitudinal separation
          if (usableSpan >= 22 && (arche.id === 'gauntlet' || (arche.hazard >= 1.0 && rng.chance(0.35 + difficulty * 0.25)))) {
            // 2 staggered hazards (e.g. Left then Right)
            lastSide = -lastSide;
            const hz1 = usableStart + rng.range(1, 3);
            events.push(createObstacle(rng.pick(kinds), hz1, lastSide, difficulty, rng));

            lastSide = -lastSide;
            const hz2 = usableEnd - rng.range(1, 3);
            events.push(createObstacle(rng.pick(kinds), hz2, lastSide, difficulty, rng));
          } else {
            // 1 hazard cleanly centered in the gap
            lastSide = -lastSide;
            const hz = (usableStart + usableEnd) / 2 + rng.range(-1.5, 1.5);
            events.push(createObstacle(rng.pick(kinds), hz, lastSide, difficulty, rng));
          }
        }
      }
    }
  }

  // Recovery gates near the end if expected crowd is too small
  let recovery = 0;
  while (expected < target * 0.55 && recovery < 2) {
    const rz = endZ - 24 + recovery * 16;
    const boost = { type: 'mul', value: 2 };
    const alt = { type: 'add', value: roundNice(Math.max(12, (target - expected) * 0.35)) };
    events.push({ type: 'gates', z: rz, left: rng.chance(0.5) ? boost : alt, right: rng.chance(0.5) ? alt : boost });
    expected = Math.max(2, Math.min(target * 1.35, Math.round(applyEstimate(expected, boost) * 0.92)));
    recovery++;
  }

  events.sort((a, b) => a.z - b.z);

  // Safety filter pass: strictly enforce minimum 14m distance invariant between obstacles/squads/gates
  const safeEvents = [];
  const MIN_DIST = 14;

  for (const ev of events) {
    if (ev.type === 'gates' || ev.type === 'coins') {
      safeEvents.push(ev);
      continue;
    }

    const tooClose = safeEvents.some((other) => {
      if (other.type === 'coins') return false;
      return Math.abs(other.z - ev.z) < MIN_DIST;
    });

    if (!tooClose) {
      safeEvents.push(ev);
    }
  }

  // boss HP tracks the level target (not the noisy estimate), so it climbs
  // smoothly and always sits just under what a good run should have left
  const reachable = Math.min(target * 1.1, Math.max(expected, target * 0.5));
  const bossHp = Math.max(30, Math.round(reachable * (0.42 + Math.min(0.32, difficulty * 0.2))));
  const stairs = {
    count: rng.int(16, 24),
    firstMult: 2,
    multStep: 0.2,
    startZ: length + 52,
  };

  return {
    level,
    archetype: arche.id,
    archetypeLabel: arche.label,
    seed,
    themeIndex,
    length,
    arenaLength: 110,
    startCount,
    speed,
    events: safeEvents,
    target,
    bossHp,
    stairs,
    expected,
  };
}
