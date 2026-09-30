/**
 * Canvas-generated textures: gate labels, road stripes, number plates.
 * Everything is drawn at runtime so the build ships zero image assets.
 */
import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function finish(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Big bold label used on gates, stair steps and enemy plates. */
export function labelTexture(text, opts = {}) {
  const {
    fg = '#ffffff',
    stroke = '#11243c',
    bg = 'transparent',
    w = 256,
    h = 128,
    size = 84,
    strokeWidth = 12,
    key,
  } = opts;
  const cacheKey = key || `l:${text}:${fg}:${bg}:${w}x${h}:${size}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    roundRect(ctx, 6, 6, w - 12, h - 12, 22);
    ctx.fill();
  }
  ctx.font = `900 ${size}px "Baloo 2", "Nunito", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, w / 2, h / 2 + 4);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2 + 4);

  const tex = finish(c);
  // label text is unbounded (every gate/enemy number), so keep the cache small
  if (cache.size > 260) {
    for (const [k, v] of cache) {
      if (k.startsWith('l:')) {
        v.dispose();
        cache.delete(k);
        if (cache.size <= 200) break;
      }
    }
  }
  cache.set(cacheKey, tex);
  return tex;
}

/** Sprite material helper for a text label that always faces the camera. */
export function labelSprite(text, opts = {}) {
  const tex = labelTexture(text, opts);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: opts.depthTest !== false });
  const sprite = new THREE.Sprite(mat);
  const scale = opts.scale || 1;
  sprite.scale.set(2 * scale, 1 * scale, 1);
  return sprite;
}

/** Lighten (f > 0, toward white) or darken (f < 0, toward black) a #rrggbb colour. */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const target = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  const mix = (v) => Math.round(v + (target - v) * p);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** Same as shade() but with an alpha channel, for gradient stops. */
function shadeA(hex, f, a) {
  return shade(hex, f).replace('rgb(', 'rgba(').replace(')', `,${a})`);
}

/** Per-pixel brightness grain - what stops flat fills from looking like plastic. */
function grain(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data; // Uint8ClampedArray clamps for us
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Hairline cracks as short random walks. */
function cracks(ctx, w, h, count, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let k = 0; k < count; k++) {
    let x = 40 + Math.random() * (w - 80);
    let y = 20 + Math.random() * (h - 40);
    let a = Math.random() * Math.PI * 2;
    ctx.lineWidth = 1 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      a += (Math.random() - 0.5) * 1.2;
      x += Math.cos(a) * (6 + Math.random() * 12);
      y += Math.sin(a) * (6 + Math.random() * 12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * Road surface: light concrete with bevelled rungs, worn wheel lanes, grimy
 * edges, hairline cracks and grain. One tile = the full road width x ~7 m.
 */
export function roadTexture() {
  if (cache.has('road')) return cache.get('road');
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eef2f7';
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 4; i++) {
    const y = i * 128;
    ctx.fillStyle = '#dce4ee';
    ctx.fillRect(0, y, S, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, y, S, 4);
    ctx.fillStyle = 'rgba(70,92,120,0.16)';
    ctx.fillRect(0, y + 47, S, 5);
  }

  for (const lx of [0.3, 0.7]) {
    const g = ctx.createLinearGradient(lx * S - 70, 0, lx * S + 70, 0);
    g.addColorStop(0, 'rgba(70,88,110,0)');
    g.addColorStop(0.5, 'rgba(70,88,110,0.08)');
    g.addColorStop(1, 'rgba(70,88,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx * S - 70, 0, 140, S);
  }

  for (const [x0, x1] of [[0, 56], [S, S - 56]]) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(96,114,138,0.34)');
    g.addColorStop(1, 'rgba(96,114,138,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), 0, 56, S);
  }

  cracks(ctx, S, S, 6, 'rgba(90,106,128,0.32)');

  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,136,158,0.25)' : 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, 0.8 + Math.random() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, S, S, 12);

  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set('road', tex);
  return tex;
}

/**
 * Near-white surface detail tiles, meant to be multiplied by a material's
 * colour so one tile works for any tint. 'hazard' is the exception: it is
 * pre-coloured yellow/black and should be used with a white material.
 * @param {'metal'|'hazard'|'rock'|'foliage'|'wood'} kind
 */
export function detailTexture(kind) {
  const key = `detail:${kind}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ebebeb';
  ctx.fillRect(0, 0, S, S);

  if (kind === 'metal') {
    // brushed streaks, scratches and a little grime
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, Math.random() * S, S, 1 + Math.random() * 2);
    }
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const a = Math.random() * Math.PI;
      const l = 8 + Math.random() * 26;
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const r = 12 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(60,40,20,0.2)');
      g.addColorStop(1, 'rgba(60,40,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(ctx, S, S, 14);
  } else if (kind === 'hazard') {
    ctx.fillStyle = '#ffcf33';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1e2430';
    // diagonal bands that tile seamlessly: 4 bands per tile at 45 degrees
    for (let k = -4; k < 8; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 64, 0);
      ctx.lineTo(k * 64 + 32, 0);
      ctx.lineTo(k * 64 + 32 - S, S);
      ctx.lineTo(k * 64 - S, S);
      ctx.closePath();
      ctx.fill();
    }
    cracks(ctx, S, S, 3, 'rgba(0,0,0,0.25)');
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 10, 2);
    }
    grain(ctx, S, S, 16);
  } else if (kind === 'rock') {
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const r = 20 + Math.random() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = i % 2 === 0;
      g.addColorStop(0, dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.4)';
      ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
    cracks(ctx, S, S, 5, 'rgba(0,0,0,0.3)');
    grain(ctx, S, S, 18);
  } else if (kind === 'foliage') {
    // overlapping leaf clumps: each is a dark rim with a lit top-left
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const r = 10 + Math.random() * 16;
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    grain(ctx, S, S, 12);
  } else if (kind === 'wood') {
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x0 = Math.random() * S;
      ctx.strokeStyle = Math.random() < 0.6 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      for (let y = 0; y <= S; y += 8) {
        const x = x0 + Math.sin(y * 0.05 + i) * 4;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    grain(ctx, S, S, 12);
  }

  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/** Red/white rumble-strip stripes; varies along V so it runs down a curb's length. */
export function curbTexture() {
  if (cache.has('curb')) return cache.get('curb');
  const c = canvas(64, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5f8fc';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#ef4c4c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, 64, 5);
  ctx.fillRect(0, 64, 64, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 59, 64, 5);
  ctx.fillRect(0, 123, 64, 5);
  grain(ctx, 64, 128, 10);
  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set('curb', tex);
  return tex;
}

/**
 * Glassy gate panel: tinted gradient, bright rim, diagonal shine and faint
 * scanlines. Alpha is baked in, so use it with opacity 1.
 */
export function gateGlassTexture(color) {
  const key = `gate:${color}`;
  if (cache.has(key)) return cache.get(key);
  const W = 512;
  const H = 296;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shadeA(color, 0.45, 0.62));
  g.addColorStop(0.55, shadeA(color, 0.1, 0.42));
  g.addColorStop(1, shadeA(color, -0.1, 0.58));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < H; y += 10) ctx.fillRect(0, y, W, 2);

  ctx.save();
  ctx.translate(W * 0.25, 0);
  ctx.rotate(0.35);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(-40, -80, 46, H * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(24, -80, 18, H * 2);
  ctx.restore();

  const glow = ctx.createLinearGradient(0, H - 60, 0, H);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(1, 'rgba(255,255,255,0.3)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, H - 60, W, 60);

  ctx.strokeStyle = shadeA(color, 0.6, 0.95);
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  const tex = finish(c);
  cache.set(key, tex);
  return tex;
}

/**
 * Staggered stone blocks with bevelled edges and per-block tint. One tile is
 * ~2.4 m wide x 1.35 m tall (two block rows), repeated across a step.
 */
export function stairTexture(color) {
  const key = `stair:${color}`;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = shade(color, -0.28);
  ctx.fillRect(0, 0, S, S);

  const rowH = S / 2;
  const brickW = S / 2;
  const gap = 5;
  for (let row = 0; row < 2; row++) {
    const offset = row % 2 ? brickW / 2 : 0;
    for (let b = -1; b < 3; b++) {
      const x = b * brickW + offset + gap / 2;
      const y = row * rowH + gap / 2;
      const w = brickW - gap;
      const h = rowH - gap;
      ctx.fillStyle = shade(color, (Math.random() - 0.5) * 0.12);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x, y, w, 4);
      ctx.fillRect(x, y, 4, h);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x, y + h - 5, w, 5);
      ctx.fillRect(x + w - 5, y, 5, h);
    }
  }
  cracks(ctx, S, S, 2, 'rgba(0,0,0,0.12)');
  grain(ctx, S, S, 10);

  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/** Chequered strip used for the finish line. */
export function checkerTexture() {
  if (cache.has('checker')) return cache.get('checker');
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  const s = 32;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#1d2b3a' : '#f4f8fc';
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set('checker', tex);
  return tex;
}

/** Ground texture: soft grass/sand speckle so the plains are not flat colour. */
export function groundTexture(baseColor, speckleColor) {
  const key = `g:${baseColor}:${speckleColor}`;
  if (cache.has(key)) return cache.get(key);
  const S = 512;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  // broad light/dark patches so the plain doesn't read as one flat colour
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 50 + Math.random() * 110;
    const col = i % 2 ? shadeA(baseColor, 0.12, 0.35) : shadeA(speckleColor, -0.05, 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.fillStyle = speckleColor;
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // little three-blade tufts
  ctx.lineCap = 'round';
  for (let i = 0; i < 320; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    ctx.globalAlpha = 0.45 + Math.random() * 0.35;
    ctx.strokeStyle = Math.random() < 0.7 ? shade(speckleColor, -0.18) : shade(baseColor, 0.25);
    ctx.lineWidth = 1.6;
    for (const a of [-0.45, 0, 0.45]) {
      const len = 5 + Math.random() * 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  grain(ctx, S, S, 10);
  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/**
 * The crowd counter plate that floats above the army. Redrawn on change,
 * so it reuses one canvas/texture pair instead of allocating per update.
 */
export class CounterPlate {
  constructor(color = '#2f8fff') {
    this.color = color;
    this.canvas = canvas(256, 140);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(2.3, 1.26, 1);
    this.sprite.renderOrder = 20;
    this.value = null;
    this.punch = 0;
    this.baseScale = 2.3;
    this.draw(0);
  }

  setColor(color) {
    this.color = color;
    this.draw(this.value === null ? 0 : this.value, true);
  }

  /** Springy scale punch when the count changes. */
  pop(strength = 1) {
    this.punch = Math.min(0.55, this.punch + 0.32 * strength);
  }

  /** Decay the punch; call once per frame. */
  tick(dt) {
    if (this.punch > 0.001) this.punch = Math.max(0, this.punch - dt * 2.4);
    const s = 1 + this.punch;
    this.sprite.scale.set(this.baseScale * s, this.baseScale * 0.548 * s, 1);
  }

  draw(value, force = false) {
    if (value === this.value && !force) return;
    this.value = value;
    const { ctx, canvas: c } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(17, 36, 60, 0.92)';
    roundRect(ctx, 16, 18, 224, 92, 26);
    ctx.fill();
    ctx.fillStyle = this.color;
    roundRect(ctx, 24, 24, 208, 74, 20);
    ctx.fill();
    const text = String(Math.max(0, Math.round(value)));
    const size = text.length > 5 ? 44 : text.length > 3 ? 54 : 64;
    ctx.font = `900 ${size}px "Baloo 2", "Nunito", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#11243c';
    ctx.strokeText(text, 128, 62);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 62);
    this.texture.needsUpdate = true;
  }
}
