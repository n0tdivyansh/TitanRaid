/**
 * The player's army: a phyllotaxis-packed blob of runners that follows the
 * steering input, plus the pyramid formation used in the finale.
 */
import * as THREE from 'three';
import { StickmanField } from './stickman.js';
import { CounterPlate } from './textures.js';
import { makeBlobShadow } from './props.js';
import { RENDER_CAP, CROWD_LIMIT } from './constants.js';
import { damp, clamp } from '../core/rng.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SLOT_SPACING = 0.62;
const MAX_RADIUS = 3.5;

export class Crowd {
  constructor(scene, capacity = RENDER_CAP) {
    this.capacity = capacity;
    this.field = new StickmanField(capacity);
    scene.add(this.field.mesh);
    this.scene = scene;

    this.count = 1;
    this.x = 0;
    this.z = 0;
    this.radius = 0.4;
    this.color = new THREE.Color('#3b9dff');
    this.field.fillColor(this.color);

    // per-member smoothed world positions
    this.mx = new Float32Array(capacity);
    this.mz = new Float32Array(capacity);
    this.my = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.seed[i] = Math.random() * 6.28;

    this.plate = new CounterPlate('#2f8fff');
    scene.add(this.plate.sprite);

    this.shadow = makeBlobShadow();
    scene.add(this.shadow);

    this.mode = 'run'; // run | cheer | pyramid
    this.pyramidBlend = 0;
    this.pyramidBase = 0;
    this.pyramidLayers = 0;
    this.pyramidHeight = 0;
    this._initialised = false;
  }

  setSkin(hex) {
    this.color.set(hex);
    this.field.fillColor(this.color, this.capacity);
    this.plate.setColor(hex);
  }

  get renderCount() {
    return Math.max(1, Math.min(Math.ceil(this.count), this.capacity));
  }

  /** Radius of the packed blob for the current head-count. */
  computeRadius() {
    const n = this.renderCount;
    const raw = SLOT_SPACING * Math.sqrt(Math.max(1, n));
    return Math.min(raw, MAX_RADIUS);
  }

  reset(count, x = 0, z = 0) {
    this.count = count;
    this.x = x;
    this.z = z;
    this.mode = 'run';
    this.pyramidBlend = 0;
    this._initialised = false;
    this._lastClimb = undefined;
    this.field.fillAnim(0, this.capacity);
    this.plate.draw(Math.round(count));
  }

  /** Target slot offset (local space) for member i of an n-strong crowd. */
  slotOffset(i, n, out) {
    const r = SLOT_SPACING * Math.sqrt(i + 0.5);
    const maxRaw = SLOT_SPACING * Math.sqrt(Math.max(1, n));
    const squeeze = maxRaw > MAX_RADIUS ? MAX_RADIUS / maxRaw : 1;
    const a = i * GOLDEN;
    out.x = Math.cos(a) * r * squeeze;
    out.z = Math.sin(a) * r * squeeze * 1.15; // slightly egg-shaped along travel
    return out;
  }

  /** Square-pyramid packing: returns the base size that fits `n` bodies. */
  static pyramidBase(n) {
    let b = 1;
    while (b < 15) {
      const total = ((b + 1) * (b + 2) * (2 * (b + 1) + 1)) / 6;
      if (total > n) break;
      b++;
    }
    return Math.max(1, b);
  }

  /** Run-mode layout: everyone chases their slot, bobbing and jostling. */
  update(dt, time, opts = {}) {
    const n = this.renderCount;
    const off = { x: 0, z: 0 };
    const lambda = opts.snappy ? 16 : 9;
    const spread = opts.spread ?? 1;
    // big armies shrink each runner a little so a 300+ crowd reads as
    // individuals instead of one solid blob
    const unit = clamp(1.1 - 0.35 * Math.sqrt(n / 400), 0.68, 1);

    if (!this._initialised) {
      for (let i = 0; i < n; i++) {
        this.slotOffset(i, n, off);
        this.mx[i] = this.x + off.x;
        this.mz[i] = this.z + off.z;
        this.my[i] = 0;
      }
      this._initialised = true;
    }

    for (let i = 0; i < n; i++) {
      this.slotOffset(i, n, off);
      const wobble = Math.sin(time * 3.1 + this.seed[i]) * 0.07;
      const tx = this.x + off.x * spread + wobble;
      const tz = this.z + off.z * spread + Math.cos(time * 2.4 + this.seed[i]) * 0.07;
      this.mx[i] = damp(this.mx[i], tx, lambda, dt);
      this.mz[i] = damp(this.mz[i], tz, lambda, dt);
      this.my[i] = damp(this.my[i], 0, 12, dt);
      const lean = (tx - this.mx[i]) * 0.35;
      this.field.set(i, this.mx[i], this.my[i], this.mz[i], lean, unit);
    }
    this.field.commit(n);
    this.radius = this.computeRadius();
    this.afterLayout(n);
  }

  /** Shared post-layout work: counter plate + blob shadow placement. */
  afterLayout(n) {
    const shown = Math.round(this.count);
    if (this._lastShown !== undefined && shown !== this._lastShown) {
      this.plate.pop(Math.min(1.6, Math.abs(shown - this._lastShown) / Math.max(8, this._lastShown) + 0.4));
    }
    this._lastShown = shown;
    this.plate.draw(shown);
    const plateY = this.mode === 'pyramid' ? this.pyramidHeight + 2.6 : 3.0;
    this.plate.sprite.position.set(this.x, plateY, this.z + 0.4);

    this.plate.tick(1 / 60);
    const r = Math.max(1.1, this.radius * 2.3);
    this.shadow.position.set(this.x, 0.04, this.z);
    this.shadow.scale.set(r, r * 1.05, 1);
    this.shadow.visible = this.mode !== 'pyramid';
  }

  /**
   * How many stair steps a crowd of this size is worth. The climb height -
   * not the size of the stack - is what scales with the army.
   */
  static climbSteps(count, maxSteps = 15) {
    const n = Math.max(1, count);
    return Math.max(1, Math.min(maxSteps, Math.floor(Math.cbrt(n) * 1.6)));
  }

  /** Base width of the pyramid: grows slowly, always fits on one step. */
  static pyramidWidth(count) {
    return Math.max(3, Math.min(8, 3 + Math.floor(Math.cbrt(Math.max(1, count)) / 1.6)));
  }

  /**
   * Finale formation: a tapering pyramid sized to stand ON a single stair
   * step. `blend` (0..1) morphs from the running blob into the stack and
   * `baseY` lifts the whole thing while it climbs.
   */
  pyramid(dt, time, blend, baseY = 0, maxSteps = 15) {
    this.mode = 'pyramid';
    this.pyramidBlend = blend;
    const n = this.renderCount;

    const width = Crowd.pyramidWidth(this.count);
    const layers = width; // tapers by one per layer, so it closes at the top
    this.pyramidBase = width;
    this.pyramidLayers = layers;
    this.climbSteps = Crowd.climbSteps(this.count, maxSteps);

    const layerH = 1.52;
    const spacingX = 0.64;
    const spacingZ = 0.6;
    this.pyramidHeight = baseY + layers * layerH;

    const off = { x: 0, z: 0 };
    let idx = 0;

    for (let layer = 0; layer < layers && idx < n; layer++) {
      const cols = width - layer;
      const rows = Math.max(1, Math.round(cols * 0.5));
      const y = baseY + layer * layerH;
      for (let r = 0; r < rows && idx < n; r++) {
        for (let c = 0; c < cols && idx < n; c++, idx++) {
          const tx = this.x + (c - (cols - 1) / 2) * spacingX;
          const tz = this.z + (r - (rows - 1) / 2) * spacingZ;
          this.slotOffset(idx, n, off);
          const bx = this.x + off.x;
          const bz = this.z + off.z;
          this.mx[idx] = damp(this.mx[idx], bx + (tx - bx) * blend, 11, dt);
          this.mz[idx] = damp(this.mz[idx], bz + (tz - bz) * blend, 11, dt);
          this.my[idx] = damp(this.my[idx], (y - baseY) * blend + baseY * blend, 11, dt);
          this.field.setAnim(idx, blend > 0.75 ? 2 : 0);
          this.field.set(idx, this.mx[idx], this.my[idx], this.mz[idx], 0, 1);
        }
      }
    }

    // Everyone else packs onto the same step around the pyramid - clamped to
    // the step footprint so nobody floats over the edge or clips the stairs.
    const EXTRA_DRAWN = 300;
    const extraLimit = Math.min(n, idx + EXTRA_DRAWN);
    for (let i = idx; i < extraLimit; i++) {
      const k = i - idx;
      const ring = 1 + Math.floor(k / 28);
      const a = (k % 28) * ((Math.PI * 2) / 28) + ring * 0.45;
      const tx = clamp(this.x + Math.cos(a) * (2.2 + ring * 0.5), this.x - 5.2, this.x + 5.2);
      const tz = clamp(this.z + Math.sin(a) * (0.8 + ring * 0.14), this.z - 1.05, this.z + 1.05);
      this.slotOffset(i, n, off);
      const bx = this.x + off.x;
      const bz = this.z + off.z;
      this.mx[i] = damp(this.mx[i], bx + (tx - bx) * blend, 9, dt);
      this.mz[i] = damp(this.mz[i], bz + (tz - bz) * blend, 9, dt);
      this.my[i] = damp(this.my[i], baseY, 9, dt);
      this.field.setAnim(i, 1);
      this.field.set(i, this.mx[i], this.my[i], this.mz[i], 0, 1);
    }

    this.field.commit(extraLimit);
    this.afterLayout(extraLimit);
  }

  /**
   * Finale climb: the army queues up the staircase in a line, a few bodies
   * per step, with the head of the line standing on the highest step reached
   * - the way the original stages its multiplier climb.
   */
  stairLine(dt, time, steps, reachedStep, blend = 1) {
    this.mode = 'pyramid';
    const n = this.renderCount;
    const top = Math.max(0, Math.min(reachedStep, steps.length - 1));
    const head = steps[top];
    // ease the anchor to the new step instead of teleporting there the
    // instant `reachedStep` ticks up - that hard snap was the "funky" jump
    this.x = damp(this.x, 0, 10, dt);
    this.z = damp(this.z, head.z, 10, dt);
    this.pyramidLayers = top + 1;
    this.pyramidHeight = head.y + 2.4;

    // Every climbed step gets a filled ring-packed cluster (not just the
    // lead 6), so the queue reads as a growing stack up the stairs instead
    // of a thin line with everyone else parked at the bottom.
    const STEP_CAP = 42;
    const off = { x: 0, z: 0 };
    let idx = 0;
    let onTop = 0;
    for (let s = top; s >= 0 && idx < n; s--) {
      const step = steps[s];
      const budget = Math.min(STEP_CAP, n - idx);
      if (s === top) onTop = budget;
      for (let k = 0; k < budget; k++, idx++) {
        let tx, tz;
        if (k < 6) {
          const col = k % 3;
          const row = Math.floor(k / 3);
          tx = (col - 1) * 0.74 + (row === 1 ? 0.34 : 0);
          tz = step.z + (row - 0.5) * 0.7;
        } else {
          const ring = Math.floor((k - 6) / 10);
          const posInRing = (k - 6) % 10;
          const a = posInRing * ((Math.PI * 2) / 10) + ring * 0.5;
          const r = 1.35 + ring * 0.6;
          tx = Math.cos(a) * r;
          tz = step.z + Math.sin(a) * r * 0.5;
        }
        this.slotOffset(idx, n, off);
        const bx = this.x + off.x;
        const bz = this.z + off.z;
        this.mx[idx] = damp(this.mx[idx], bx + (tx - bx) * blend, 10, dt);
        this.mz[idx] = damp(this.mz[idx], bz + (tz - bz) * blend, 10, dt);
        this.my[idx] = damp(this.my[idx], step.y * blend, 10, dt);
        this.field.setAnim(idx, 0);
        this.field.set(idx, this.mx[idx], this.my[idx], this.mz[idx], 0, 1);
      }
    }

    // whoever still doesn't fit bunches up on the ground at the foot of the stairs
    const EXTRA = 280;
    const limit = Math.min(n, idx + EXTRA);
    const foot = steps[0];
    for (let i = idx; i < limit; i++) {
      const k = i - idx;
      const row = Math.floor(k / 9);
      const col = k % 9;
      const tx = (col - 4) * 0.62;
      const tz = foot.z - 2.4 - row * 0.6;
      this.mx[i] = damp(this.mx[i], tx, 8, dt);
      this.mz[i] = damp(this.mz[i], tz, 8, dt);
      this.my[i] = damp(this.my[i], 0, 8, dt);
      this.field.setAnim(i, 0);
      this.field.set(i, this.mx[i], this.my[i], this.mz[i], 0, 1);
    }

    this.field.commit(limit);
    // the pill tracks who is still climbing: every step passed leaves its
    // cluster behind, so the number ticks down as the stack goes up
    const leftBehind = Math.min(STEP_CAP * top, Math.max(0, idx - onTop));
    const climbing = Math.max(onTop, Math.round(this.count) - leftBehind);
    if (this._lastClimb !== undefined && climbing !== this._lastClimb) this.plate.pop(0.6);
    this._lastClimb = climbing;
    this.plate.draw(climbing);
    this.plate.tick(1 / 60);
    this.plate.sprite.position.set(this.x, head.y + 3.2, head.z);
    this.shadow.visible = false;
  }

  /** Victory celebration: arms up, small hops, stationary. */
  cheer(dt, time) {
    this.mode = 'cheer';
    const n = this.renderCount;
    const off = { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      this.slotOffset(i, n, off);
      this.mx[i] = damp(this.mx[i], this.x + off.x, 8, dt);
      this.mz[i] = damp(this.mz[i], this.z + off.z, 8, dt);
      this.my[i] = damp(this.my[i], 0, 8, dt);
      this.field.setAnim(i, 1);
      this.field.set(i, this.mx[i], this.my[i], this.mz[i], 0, 1);
    }
    this.field.commit(n);
    this.afterLayout(n);
  }

  /** Reset every instance back to the running animation. */
  setRunAnim() {
    this.mode = 'run';
    this.field.fillAnim(0, this.capacity);
  }

  add(n) {
    this.count = Math.max(0, this.count + n);
  }

  clampLateral(limit = CROWD_LIMIT) {
    this.x = clamp(this.x, -limit, limit);
  }

  dispose() {
    this.scene.remove(this.field.mesh);
    this.scene.remove(this.plate.sprite);
    this.scene.remove(this.shadow);
    this.field.dispose();
  }
}
