/**
 * Level props: math gates, coins, obstacles, enemy squads, the boss and the
 * rainbow multiplier stairs. All original low-poly designs, built in code.
 */
import * as THREE from 'three';
import { ROAD_HALF } from './constants.js';
import { labelTexture, gateGlassTexture, stairTexture, shade } from './textures.js';
import { StickmanField } from './stickman.js';
import { toonMaterial, detailMaterial } from './materials.js';

export const OP_COLORS = {
  add: '#35c15a',
  mul: '#2f8fff',
  sub: '#ef4444',
  div: '#ff9f43',
};

export function opText(op) {
  switch (op.type) {
    case 'add':
      return `+${op.value}`;
    case 'sub':
      return `-${op.value}`;
    case 'mul':
      return `x${op.value}`;
    case 'div':
      return `/${op.value}`;
    default:
      return '?';
  }
}

export function applyOp(count, op) {
  switch (op.type) {
    case 'add':
      return count + op.value;
    case 'sub':
      return Math.max(0, count - op.value);
    case 'mul':
      return Math.floor(count * op.value);
    case 'div':
      return Math.max(0, Math.floor(count / op.value));
    default:
      return count;
  }
}

/** One half-road gate panel with its floating label. */
function makeGatePanel(op, centerX) {
  const g = new THREE.Group();
  const color = OP_COLORS[op.type];

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF - 0.12, 3.4),
    new THREE.MeshBasicMaterial({
      map: gateGlassTexture(color),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  panel.position.set(centerX, 1.75, 0);
  g.add(panel);

  // solid sign board behind the number so it reads at a glance
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({
      map: labelTexture(opText(op), { fg: '#ffffff', bg: shade(color, -0.22), size: 88, strokeWidth: 14 }),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  label.position.set(centerX, 2.05, -0.06);
  label.rotation.y = Math.PI; // face the camera, which trails the crowd on -Z
  g.add(label);

  const barMat = toonMaterial(color, { rim: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF, 0.42, 0.42), barMat);
  top.position.set(centerX, 3.5, 0);
  g.add(top);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_HALF, 0.1, 0.46),
    toonMaterial(shade(color, 0.45), { rim: 0.3 })
  );
  trim.position.set(centerX, 3.73, 0);
  g.add(trim);

  return g;
}

/** A left/right gate pair spanning the whole road at z. */
export function makeGatePair(left, right, z) {
  const group = new THREE.Group();
  group.position.z = z;
  group.add(makeGatePanel(left, -ROAD_HALF / 2));
  group.add(makeGatePanel(right, ROAD_HALF / 2));

  const postMat = toonMaterial('#e9eff6', { rim: 0.5 });
  const footMat = toonMaterial('#9fb0c4', { rim: 0.3 });
  const capMat = toonMaterial('#ffffff', { rim: 0.7 });
  const postGeo = new THREE.CylinderGeometry(0.16, 0.18, 3.8, 10);
  const footGeo = new THREE.BoxGeometry(0.55, 0.26, 0.55);
  const capGeo = new THREE.SphereGeometry(0.24, 12, 8);
  for (const x of [-ROAD_HALF, 0, ROAD_HALF]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 1.9, 0);
    group.add(post);
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(x, 0.13, 0);
    group.add(foot);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, 3.9, 0);
    group.add(cap);
  }

  group.userData = { type: 'gates', left, right, z, used: false };
  return group;
}

/** Spinning gold coins, drawn as one instanced mesh. */
export class CoinField {
  constructor(scene, capacity = 500) {
    this.capacity = capacity;
    const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 12);
    geo.rotateX(Math.PI / 2);
    const mat = toonMaterial('#ffc531', { rim: 0.8, rimColor: '#fff2b0' });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.coins = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  reset(list) {
    this.coins = list.slice(0, this.capacity).map((c) => ({ x: c.x, y: c.y ?? 0.9, z: c.z, taken: false }));
    this.mesh.count = this.coins.length;
    this.update(0);
  }

  update(time) {
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.taken) {
        this._p.set(0, -999, 0);
        this._e.set(0, 0, 0);
      } else {
        this._p.set(c.x, c.y + Math.sin(time * 3 + i) * 0.08, c.z);
        this._e.set(0, time * 3.2 + i * 0.6, 0);
      }
      this._q.setFromEuler(this._e);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

/**
 * Hazards. Each returns a Group whose userData describes its lethal box:
 *   { kind, x, z, halfWidth, halfDepth, dps, sweep, update(dt, time) }
 */
export function makeObstacle(kind, opts = {}) {
  const group = new THREE.Group();
  const x = opts.x ?? 0;
  const z = opts.z ?? 0;
  group.position.set(x, 0, z);
  // severity scales how fast a hazard chews through the crowd; capFrac limits
  // how much of the crowd a single hazard can ever take, so one bad brush
  // never wipes a small army outright.
  const SEVERITY = { saw: 1.0, wall: 1.45, spikes: 0.7, hammer: 1.1, roller: 0.95 };
  const CAP = { saw: 0.5, wall: 0.55, spikes: 0.34, hammer: 0.45, roller: 0.5 };
  const data = {
    kind,
    x,
    z,
    halfWidth: 1,
    halfDepth: 1,
    baseX: x,
    sweep: opts.sweep ?? 0,
    severity: (SEVERITY[kind] ?? 1) * (opts.severity ?? 1),
    capFrac: CAP[kind] ?? 0.5,
    contact: null,
  };

  if (kind === 'saw') {
    const r = opts.radius ?? 1.7;
    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.22, 24),
      detailMaterial('#d5dde6', 'metal', { rim: 0.7 })
    );
    blade.rotation.z = Math.PI / 2;
    blade.position.y = r * 0.55;
    group.add(blade);
    const teeth = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.99, 0.13, 6, 20),
      detailMaterial('#7d8a98', 'metal', { rim: 0.6, repeat: [6, 1] })
    );
    teeth.position.y = r * 0.55;
    group.add(teeth);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.34, 10),
      toonMaterial('#e11d48', { rim: 0.7 })
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.y = r * 0.55;
    group.add(hub);
    data.halfWidth = r * 0.5;
    data.halfDepth = r * 0.6;
    data.update = (dt, time) => {
      blade.rotation.x += dt * 9;
      teeth.rotation.z += dt * 9;
      if (data.sweep) {
        group.position.x = data.baseX + Math.sin(time * 1.3 + z) * data.sweep;
        data.x = group.position.x;
      }
    };
  } else if (kind === 'hammer') {
    const pivot = new THREE.Group();
    pivot.position.y = 5.2;
    group.add(pivot);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 3.6, 0.28),
      detailMaterial('#6b7f96', 'metal', { rim: 0.5, repeat: [0.3, 3] })
    );
    arm.position.y = -1.8;
    pivot.add(arm);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.5, 1.5),
      detailMaterial('#ef4444', 'metal', { rim: 0.7 })
    );
    head.position.y = -3.8;
    pivot.add(head);
    // hazard band wrapped round the middle of the head
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.56, 1.56),
      detailMaterial('#ffffff', 'hazard', { rim: 0.3, repeat: [0.5, 1] })
    );
    band.position.y = -3.8;
    pivot.add(band);
    data.halfWidth = 1.5;
    data.halfDepth = 1.1;
    data.update = (dt, time) => {
      pivot.rotation.z = Math.sin(time * 2.1 + z * 0.3) * 0.85;
      data.x = data.baseX + Math.sin(pivot.rotation.z) * 3.9;
    };
  } else if (kind === 'wall') {
    const w = opts.width ?? 4.2;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, 2.2, 0.9),
      detailMaterial('#7c4dff', 'rock', { rim: 0.6, repeat: [w / 2, 1] })
    );
    wall.position.y = 1.1;
    group.add(wall);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.4, 1.0),
      detailMaterial('#ffffff', 'hazard', { rim: 0.4, repeat: [w / 1.6, 0.25] })
    );
    stripe.position.y = 1.85;
    group.add(stripe);
    data.halfWidth = w / 2;
    data.halfDepth = 0.6;
    data.update = () => {};
  } else if (kind === 'spikes') {
    const n = opts.count ?? 5;
    const w = opts.width ?? 3.4;
    const mat = detailMaterial('#b3c0cf', 'metal', { rim: 0.7 });
    for (let i = 0; i < n; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 8), mat);
      spike.position.set(-w / 2 + (w / (n - 1)) * i, 0.9, 0);
      group.add(spike);
    }
    // bolted base plate so the spikes sit on something instead of the road
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.9, 0.18, 1.0),
      detailMaterial('#4b5563', 'metal', { rim: 0.4, repeat: [w / 2, 0.5] })
    );
    plate.position.y = 0.09;
    group.add(plate);
    data.halfWidth = w / 2 + 0.3;
    data.halfDepth = 0.6;
    data.update = () => {};
  } else if (kind === 'roller') {
    const w = opts.width ?? 5;
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, w, 18),
      detailMaterial('#f97316', 'metal', { rim: 0.7, repeat: [3, w / 2] })
    );
    roller.rotation.z = Math.PI / 2;
    roller.position.y = 0.9;
    group.add(roller);
    data.halfWidth = w / 2;
    data.halfDepth = 0.9;
    data.update = (dt, time) => {
      roller.rotation.y += dt * 6;
      group.position.x = data.baseX + Math.sin(time * 1.1 + z * 0.2) * (data.sweep ?? 1.5);
      data.x = group.position.x;
    };
  }

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  group.userData = data;
  return group;
}

/**
 * Enemy squads: red runners standing in a block with a count plate.
 * All squads share one instanced mesh for speed.
 */
export class EnemyForce {
  constructor(scene, capacity = 700) {
    this.field = new StickmanField(capacity);
    this.field.fillColor(new THREE.Color('#ef4444'));
    this.field.fillAnim(2);
    scene.add(this.field.mesh);
    this.scene = scene;
    this.squads = [];
    this.capacity = capacity;
    this.labels = [];
  }

  /** @param {Array<{x:number,z:number,count:number}>} squads */
  reset(squads) {
    for (const l of this.labels) {
      this.scene.remove(l.sprite);
      l.sprite.material.dispose();
    }
    this.labels = [];
    this.squads = squads.map((s) => ({ ...s, alive: s.count, defeated: false }));

    for (const squad of this.squads) {
      const mat = new THREE.SpriteMaterial({
        map: labelTexture(String(squad.count), { fg: '#ffffff', size: 86, strokeWidth: 15 }),
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.2, 1.1, 1);
      sprite.position.set(squad.x, 3.1, squad.z);
      sprite.renderOrder = 18;
      this.scene.add(sprite);
      this.labels.push({ sprite, squad, shown: squad.count });
    }
    this.layout();
  }

  /** Re-place the instances of every squad that still has members. */
  layout(time = 0) {
    let idx = 0;
    for (const squad of this.squads) {
      const n = Math.min(Math.ceil(squad.alive), 120);
      const cols = Math.max(1, Math.round(Math.sqrt(n * 1.6)));
      for (let i = 0; i < n && idx < this.capacity; i++, idx++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = squad.x + (col - (cols - 1) / 2) * 0.62;
        const z = squad.z + row * 0.62 - 0.5;
        this.field.set(idx, x, 0, z, Math.PI + Math.sin(time * 2 + i) * 0.12, 1);
      }
    }
    this.field.commit(idx);

    for (const l of this.labels) {
      const alive = Math.max(0, Math.ceil(l.squad.alive));
      l.sprite.visible = alive > 0;
      if (alive !== l.shown) {
        l.shown = alive;
        l.sprite.material.map = labelTexture(String(alive), { fg: '#ffffff', size: 86, strokeWidth: 15 });
        l.sprite.material.needsUpdate = true;
      }
    }
  }

  clear() {
    this.squads = [];
    for (const l of this.labels) {
      this.scene.remove(l.sprite);
      l.sprite.material.dispose();
    }
    this.labels = [];
    this.field.commit(0);
  }
}

const WHITE = new THREE.Color('#ffffff');

/** Boss variants cycled by level so the finale doesn't repeat the same brute. */
export const BOSS_VARIANTS = ['golem', 'robot', 'stickman'];

/** Shared hit-flash / bob wiring so each variant only builds its geometry. */
function finishBoss(group, z, hp, flashMats, animate) {
  const bases = flashMats.map((m) => m.color.clone());
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  group.userData = {
    type: 'boss',
    hp,
    maxHp: hp,
    z,
    hitFlash: 0,
    flash() {
      group.userData.hitFlash = 1;
    },
    update: (dt, time) => {
      const d = group.userData;
      animate(dt, time);
      if (d.hitFlash > 0.001) {
        d.hitFlash = Math.max(0, d.hitFlash - dt * 5.5);
        for (let i = 0; i < flashMats.length; i++) {
          // the fight hits every frame, so a strong flash kept the boss
          // permanently bleached - keep it a light pulse
          flashMats[i].color.copy(bases[i]).lerp(WHITE, d.hitFlash * 0.35);
        }
        group.position.x = Math.sin(time * 40) * d.hitFlash * 0.16;
      } else if (group.position.x !== 0) {
        group.position.x = 0;
      }
    },
  };
  return group;
}

/** Round ogre/golem: big soft belly, stubby horns, a boulder-headed club. */
function buildGolem(group) {
  const skin = toonMaterial('#5fae3a', { rim: 0.55 }).clone();
  const dark = toonMaterial('#3d7a24', { rim: 0.4 }).clone();
  const rock = toonMaterial('#8d8f96', { rim: 0.4 }).clone();
  const wood = toonMaterial('#7a4a25', { rim: 0.4 });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const black = new THREE.MeshBasicMaterial({ color: '#16222f' });

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.55, 20, 16), skin);
  belly.scale.set(1, 1.08, 0.92);
  belly.position.y = 2.5;
  group.add(belly);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.22, 8, 20), dark);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.55;
  group.add(belt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), skin);
  head.position.y = 4.55;
  group.add(head);

  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), rock);
    horn.position.set(sx * 0.55, 5.1, 0.1);
    horn.rotation.z = sx * 0.5;
    group.add(horn);

    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), white);
    eye.position.set(sx * 0.36, 4.6, -0.85);
    eye.rotation.y = Math.PI;
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), black);
    pupil.position.set(sx * 0.36, 4.58, -0.87);
    pupil.rotation.y = Math.PI;
    group.add(pupil);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.7, 4, 10), skin);
    arm.position.set(sx * 1.7, 2.7, 0);
    arm.rotation.z = sx * 0.18;
    group.add(arm);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 10), dark);
    fist.position.set(sx * 1.95, 1.75, 0);
    group.add(fist);

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.0, 4, 10), dark);
    leg.position.set(sx * 0.72, 0.75, 0);
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), dark);
    foot.scale.set(1.15, 0.6, 1.3);
    foot.position.set(sx * 0.72, 0.16, 0.28);
    group.add(foot);
  }

  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 2.6, 4, 8), wood);
  handle.position.set(2.3, 3.5, -0.6);
  handle.rotation.x = 0.5;
  group.add(handle);
  const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), rock);
  boulder.position.set(2.3, 5.0, -1.4);
  group.add(boulder);

  const flashMats = [skin, dark, rock];
  const animate = (dt, time) => {
    group.position.y = Math.abs(Math.sin(time * 2.2)) * 0.2;
    belly.rotation.z = Math.sin(time * 2.2) * 0.04;
    handle.rotation.z = Math.sin(time * 2.9) * 0.22;
  };
  return { flashMats, animate };
}

/** Blocky mech brute: glowing eye, piston limbs, a hydraulic hammer. */
function buildRobot(group) {
  const shell = toonMaterial('#5c6b7a', { rim: 0.5 }).clone();
  const dark = toonMaterial('#2e3742', { rim: 0.35 }).clone();
  const glow = new THREE.MeshBasicMaterial({ color: '#5df2ff' });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 1.6), shell);
  body.position.y = 2.8;
  group.add(body);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.2), dark);
  chestPlate.position.set(0, 2.9, -0.81);
  group.add(chestPlate);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.2), dark);
  head.position.y = 4.55;
  group.add(head);

  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), glow);
  eye.position.set(0, 4.55, -0.62);
  eye.rotation.y = Math.PI;
  group.add(eye);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), dark);
  antenna.position.set(0, 5.55, 0);
  group.add(antenna);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glow);
  antennaTip.position.set(0, 6.0, 0);
  group.add(antennaTip);

  const pistons = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), dark);
    shoulder.position.set(sx * 1.6, 3.7, 0);
    group.add(shoulder);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.1, 10), shell);
    arm.position.set(sx * 1.75, 2.7, 0);
    group.add(arm);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 10), dark);
    forearm.position.set(sx * 1.75, 1.3, 0);
    group.add(forearm);
    pistons.push(forearm);

    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.5, 0.85), shell);
    leg.position.set(sx * 0.75, 0.75, 0);
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.35, 1.3), dark);
    foot.position.set(sx * 0.75, 0.02, 0.25);
    group.add(foot);
  }

  const hammerShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8), dark);
  hammerShaft.position.set(2.3, 3.5, -0.6);
  hammerShaft.rotation.x = 0.5;
  group.add(hammerShaft);
  const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.7), shell);
  hammerHead.position.set(2.3, 4.9, -1.4);
  group.add(hammerHead);

  const flashMats = [shell, dark];
  const animate = (dt, time) => {
    group.position.y = Math.abs(Math.sin(time * 2.6)) * 0.12;
    for (const p of pistons) p.scale.y = 1 + Math.sin(time * 6) * 0.08;
    hammerShaft.rotation.z = Math.sin(time * 3.2) * 0.2;
    antenna.rotation.z = Math.sin(time * 4) * 0.15;
  };
  return { flashMats, animate };
}

/** Giant stickman: same silhouette language as the crowd, huge and menacing. */
function buildStickman(group) {
  const bone = toonMaterial('#3a1f2c', { rim: 0.5 }).clone();
  const glow = new THREE.MeshBasicMaterial({ color: '#ff5b5b' });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.4, 4, 10), bone);
  torso.position.y = 3.0;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), bone);
  head.position.y = 4.9;
  group.add(head);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), glow);
    eye.position.set(sx * 0.32, 4.95, -0.75);
    eye.rotation.y = Math.PI;
    group.add(eye);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 2.1, 4, 8), bone);
    arm.position.set(sx * 1.15, 3.1, 0);
    arm.rotation.z = sx * 0.32;
    group.add(arm);

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 2.0, 4, 8), bone);
    leg.position.set(sx * 0.42, 0.9, 0);
    group.add(leg);
  }

  const club = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.8, 4, 8), bone);
  club.position.set(1.9, 3.2, -0.6);
  club.rotation.z = 0.6;
  group.add(club);

  const flashMats = [bone];
  const animate = (dt, time) => {
    group.position.y = Math.abs(Math.sin(time * 2.8)) * 0.22;
    torso.rotation.z = Math.sin(time * 2.8) * 0.06;
    club.rotation.x = Math.sin(time * 3.4) * 0.3;
  };
  return { flashMats, animate };
}

const BOSS_BUILDERS = { golem: buildGolem, robot: buildRobot, stickman: buildStickman };

/**
 * The end-of-level brute. `variant` picks the silhouette (golem/robot/
 * stickman); the caller cycles it per level so the finale isn't the same
 * boss every time. Falls back to the golem when an unknown variant is passed.
 */
/** Bosses grow with their HP; shared by the procedural and glTF bosses. */
export function bossScale(hp) {
  return 1.5 + Math.min(1.1, hp / 1200);
}

export function makeBoss(hp, z, variant = 'golem') {
  const group = new THREE.Group();
  group.position.set(0, 0, z);
  group.scale.setScalar(bossScale(hp));

  const build = BOSS_BUILDERS[variant] || buildGolem;
  const { flashMats, animate } = build(group);
  return finishBoss(group, z, hp, flashMats, animate);
}

const STAIR_COLORS = [
  '#8ee06a', '#6fd97f', '#4fd39a', '#3fcbb4', '#37c2cc', '#36b6dd',
  '#3aa6ea', '#4a93f0', '#5b7ff2', '#6a6cf0', '#7a5ae8', '#8a4ade',
  '#9a3fd2', '#a838c6', '#b534b8', '#c232ab', '#cf309d', '#db2f90',
  '#e63083', '#ef3476',
];

/**
 * The finale staircase. Step i sits at height i*rise and carries the
 * multiplier that the pyramid banks if it reaches that step.
 * @returns {{group: THREE.Group, steps: Array<{y:number,z:number,mult:number}>}}
 */
export function makeStairs(stepCount, startZ, opts = {}) {
  const group = new THREE.Group();
  const rise = opts.rise ?? 1.35;
  const run = opts.run ?? 2.6;
  const width = opts.width ?? ROAD_HALF * 2;
  const firstMult = opts.firstMult ?? 2;
  const multStep = opts.multStep ?? 0.2;
  const fmt = (v) => (Math.abs(v - Math.round(v)) < 0.001 ? `x${Math.round(v)}.0` : `x${v.toFixed(1)}`);
  const steps = [];

  for (let i = 0; i < stepCount; i++) {
    const color = STAIR_COLORS[i % STAIR_COLORS.length];
    const h = rise * (i + 1);
    const z = startZ + run * i;
    const mult = Math.round((firstMult + multStep * i) * 10) / 10;

    // stone-block body; repeat keeps blocks the same size however tall the step
    const tex = stairTexture(color).clone();
    tex.repeat.set(width / 2.4, h / 1.35);
    const sideTex = stairTexture(color).clone();
    sideTex.repeat.set(run / 2.4, h / 1.35);
    const frontMat = toonMaterial('#ffffff', { map: tex, rim: 0.35 });
    const sideMat = toonMaterial('#ffffff', { map: sideTex, rim: 0.35 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const box = new THREE.Mesh(new THREE.BoxGeometry(width, h, run), [
      sideMat, sideMat, frontMat, frontMat, frontMat, frontMat,
    ]);
    box.receiveShadow = true;
    box.position.set(0, h / 2, z + run / 2);
    group.add(box);

    // lighter capstone with a small front lip - the bevelled top edge that
    // makes each step read as a separate tread
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, 0.18, run + 0.12),
      toonMaterial(shade(color, 0.32), { rim: 0.5 })
    );
    cap.receiveShadow = true;
    cap.position.set(0, h - 0.07, z + run / 2 - 0.06);
    group.add(cap);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 1.4),
      new THREE.MeshBasicMaterial({
        map: labelTexture(fmt(mult), { fg: '#ffffff', size: 78, strokeWidth: 13 }),
        transparent: true,
        depthWrite: false,
      })
    );
    // sits just proud of the capstone lip so the lip doesn't clip the text
    face.position.set(0, h - rise * 0.55, z - 0.14);
    face.rotation.y = Math.PI;
    group.add(face);

    steps.push({ y: h, z: z + run / 2, mult, color });
  }

  return { group, steps, rise, run };
}

/** Simple soft round shadow that sits under the crowd. */
export function makeBlobShadow() {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = canvasEl.height = 128;
  const ctx = canvasEl.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(10, 24, 40, 0.5)');
  grad.addColorStop(1, 'rgba(10, 24, 40, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvasEl);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.renderOrder = 1;
  return mesh;
}
