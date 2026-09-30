/**
 * Particles, ragdolls and floating 3D text. All pooled - nothing is
 * allocated per hit once the pools are warm.
 */
import * as THREE from 'three';
import { StickmanField } from './stickman.js';
import { labelTexture } from './textures.js';

const GRAVITY = -26;

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // ---------------------------------------------------------- particles
    this.maxParticles = 700;
    this.pPos = new Float32Array(this.maxParticles * 3);
    this.pCol = new Float32Array(this.maxParticles * 3);
    this.pVel = new Float32Array(this.maxParticles * 3);
    this.pLife = new Float32Array(this.maxParticles);
    this.pHead = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setDrawRange(0, this.maxParticles);
    // soft round dot instead of the default hard square
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dctx = dot.getContext('2d');
    const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 32, 32);
    const dotTex = new THREE.CanvasTexture(dot);
    const mat = new THREE.PointsMaterial({
      size: 0.32,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < this.maxParticles; i++) this.pPos[i * 3 + 1] = -999;

    // ----------------------------------------------------------- ragdolls
    this.maxRagdolls = 260;
    this.ragField = new StickmanField(this.maxRagdolls);
    this.ragField.fillAnim(2);
    scene.add(this.ragField.mesh);
    this.ragdolls = [];
    for (let i = 0; i < this.maxRagdolls; i++) {
      this.ragdolls.push({
        active: false,
        x: 0, y: -99, z: 0,
        vx: 0, vy: 0, vz: 0,
        rot: 0, spin: 0, life: 0,
        color: new THREE.Color('#3b9dff'),
      });
    }

    // -------------------------------------------------------- float texts
    this.texts = [];
    for (let i = 0; i < 14; i++) {
      const mat2 = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat2);
      sprite.visible = false;
      sprite.renderOrder = 30;
      scene.add(sprite);
      this.texts.push({ sprite, life: 0, vy: 0 });
    }
    this._c = new THREE.Color();
  }

  burst(x, y, z, colorHex, count = 18, speed = 7) {
    this._c.set(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.pHead;
      this.pHead = (this.pHead + 1) % this.maxParticles;
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 1.1;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.pPos[idx * 3] = x;
      this.pPos[idx * 3 + 1] = y;
      this.pPos[idx * 3 + 2] = z;
      this.pVel[idx * 3] = Math.cos(a) * sp;
      this.pVel[idx * 3 + 1] = up * sp;
      this.pVel[idx * 3 + 2] = Math.sin(a) * sp;
      this.pCol[idx * 3] = this._c.r;
      this.pCol[idx * 3 + 1] = this._c.g;
      this.pCol[idx * 3 + 2] = this._c.b;
      this.pLife[idx] = 0.55 + Math.random() * 0.45;
    }
  }

  /** Fling n dead runners away from the crowd. */
  ragdoll(x, y, z, colorHex, n = 4, dirX = 0) {
    let spawned = 0;
    for (let i = 0; i < this.maxRagdolls && spawned < n; i++) {
      const r = this.ragdolls[i];
      if (r.active) continue;
      r.active = true;
      r.x = x + (Math.random() - 0.5) * 1.6;
      r.y = y + 0.2;
      r.z = z + (Math.random() - 0.5) * 1.6;
      const lateral = dirX !== 0 ? dirX : Math.random() < 0.5 ? -1 : 1;
      r.vx = lateral * (2.5 + Math.random() * 5);
      r.vy = 5 + Math.random() * 5.5;
      r.vz = -2 - Math.random() * 6;
      r.rot = 0;
      r.spin = (Math.random() - 0.5) * 16;
      r.life = 1.7;
      r.color.set(colorHex);
      spawned++;
    }
    this.burst(x, y + 0.8, z, colorHex, Math.min(14, n * 3), 6);
  }

  /** Low puffs kicked up under the running crowd. */
  dust(x, z, radius, colorHex = '#ffffff') {
    const n = radius > 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const idx = this.pHead;
      this.pHead = (this.pHead + 1) % this.maxParticles;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.pPos[idx * 3] = x + Math.cos(a) * r;
      this.pPos[idx * 3 + 1] = 0.12;
      this.pPos[idx * 3 + 2] = z + Math.sin(a) * r - 0.4;
      this.pVel[idx * 3] = Math.cos(a) * 1.2;
      this.pVel[idx * 3 + 1] = 1.6 + Math.random() * 1.4;
      this.pVel[idx * 3 + 2] = -2 - Math.random() * 2;
      this._c.set(colorHex);
      this.pCol[idx * 3] = this._c.r;
      this.pCol[idx * 3 + 1] = this._c.g;
      this.pCol[idx * 3 + 2] = this._c.b;
      this.pLife[idx] = 0.32 + Math.random() * 0.22;
    }
  }

  /** Multi-colour celebration burst. */
  confetti(x, y, z, count = 90) {
    const colors = ['#ff5f6d', '#ffc531', '#4ade80', '#38bdf8', '#a855f7', '#ffffff'];
    for (let i = 0; i < count; i++) {
      this.burst(
        x + (Math.random() - 0.5) * 6,
        y + Math.random() * 2,
        z + (Math.random() - 0.5) * 4,
        colors[i % colors.length],
        1,
        9 + Math.random() * 6
      );
    }
  }

  floatText(x, y, z, text, colorHex = '#ffffff', scale = 1) {
    let slot = this.texts.find((t) => t.life <= 0);
    if (!slot) slot = this.texts[0];
    // longer deltas ("+1234") need a smaller font to stay inside the canvas
    // instead of clipping against its edges
    const size = text.length > 5 ? 52 : text.length > 3 ? 62 : 78;
    const strokeWidth = text.length > 5 ? 10 : text.length > 3 ? 12 : 14;
    slot.sprite.material.map = labelTexture(text, { fg: colorHex, size, strokeWidth, key: `ft:${text}:${colorHex}` });
    slot.sprite.material.needsUpdate = true;
    slot.sprite.position.set(x, y, z);
    slot.sprite.scale.set(2.6 * scale, 1.3 * scale, 1);
    slot.sprite.visible = true;
    slot.sprite.material.opacity = 1;
    slot.life = 1.15;
    slot.vy = 3.2;
  }

  update(dt) {
    // particles
    let anyParticle = false;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.pLife[i] <= 0) continue;
      anyParticle = true;
      this.pLife[i] -= dt;
      const o = i * 3;
      this.pVel[o + 1] += GRAVITY * dt;
      this.pPos[o] += this.pVel[o] * dt;
      this.pPos[o + 1] += this.pVel[o + 1] * dt;
      this.pPos[o + 2] += this.pVel[o + 2] * dt;
      if (this.pPos[o + 1] < 0.05) {
        this.pPos[o + 1] = 0.05;
        this.pVel[o + 1] *= -0.35;
        this.pVel[o] *= 0.7;
        this.pVel[o + 2] *= 0.7;
      }
      if (this.pLife[i] <= 0) this.pPos[o + 1] = -999;
    }
    if (anyParticle) {
      this.points.geometry.attributes.position.needsUpdate = true;
      // colours are written in burst()/dust() and were never uploaded before,
      // which is why every particle rendered black
      this.points.geometry.attributes.color.needsUpdate = true;
    }

    // ragdolls
    let used = 0;
    for (let i = 0; i < this.maxRagdolls; i++) {
      const r = this.ragdolls[i];
      if (!r.active) continue;
      r.life -= dt;
      r.vy += GRAVITY * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      r.rot += r.spin * dt;
      if (r.y < 0) {
        r.y = 0;
        r.vy *= -0.3;
        r.vx *= 0.6;
        r.vz *= 0.6;
        r.spin *= 0.5;
      }
      if (r.life <= 0) {
        r.active = false;
        this.ragField.set(i, 0, -999, 0, 0, 1);
        continue;
      }
      this.ragField.set(i, r.x, r.y, r.z, r.rot * 0.3, 1, r.rot, r.rot * 0.7);
      this.ragField.setColor(i, r.color);
      used = Math.max(used, i + 1);
    }
    this.ragField.commit(this.maxRagdolls);

    // floating text
    for (const t of this.texts) {
      if (t.life <= 0) {
        if (t.sprite.visible) t.sprite.visible = false;
        continue;
      }
      t.life -= dt;
      t.sprite.position.y += t.vy * dt;
      t.vy *= 0.94;
      t.sprite.material.opacity = Math.max(0, Math.min(1, t.life * 1.6));
      if (t.life <= 0) t.sprite.visible = false;
    }
  }

  clear() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pLife[i] = 0;
      this.pPos[i * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < this.maxRagdolls; i++) {
      this.ragdolls[i].active = false;
      this.ragField.set(i, 0, -999, 0, 0, 1);
    }
    this.ragField.commit(this.maxRagdolls);
    for (const t of this.texts) {
      t.life = 0;
      t.sprite.visible = false;
    }
  }
}
