/**
 * The running track: road surface, curbs, side plains, scenery and the
 * finish/boss arena. Rebuilt per level, everything procedural.
 */
import * as THREE from 'three';
import { ROAD_HALF } from './constants.js';
import { roadTexture, checkerTexture, groundTexture, curbTexture, shade } from './textures.js';
import { toonMaterial, detailMaterial } from './materials.js';

export const THEMES = [
  { name: 'meadow', skyTop: '#3fa9ff', skyBottom: '#d8f2ff', ground: '#8fd35c', speckle: '#76b94a', sky: '#8fd8ff', fog: '#b9e8ff', tree: '#3f9d4a', trunk: '#8a5a37', rock: '#9aa7b1' },
  { name: 'dunes', skyTop: '#ffb45e', skyBottom: '#ffeccd', ground: '#f2d49a', speckle: '#e0bc7c', sky: '#ffd9a0', fog: '#ffe8c4', tree: '#6fae5b', trunk: '#a1703f', rock: '#c9ae82' },
  { name: 'tundra', skyTop: '#7ec8ff', skyBottom: '#eaf7ff', ground: '#e8f4ff', speckle: '#cfe4f7', sky: '#bfe6ff', fog: '#e4f4ff', tree: '#4d7f6a', trunk: '#6b5340', rock: '#aebecb' },
  { name: 'sunset', skyTop: '#ff7a59', skyBottom: '#ffd3a8', ground: '#c98fb5', speckle: '#b0759e', sky: '#ffb28a', fog: '#ffd0b0', tree: '#7a5aa8', trunk: '#5e3f6b', rock: '#b09ac2' },
  { name: 'canyon', skyTop: '#ff9d4d', skyBottom: '#ffe2b8', ground: '#d9834a', speckle: '#c06a3e', sky: '#ffcf96', fog: '#ffe0bb', tree: '#8f9e4a', trunk: '#7a4a28', rock: '#b5764a' },
  { name: 'neon', skyTop: '#1b1f45', skyBottom: '#4b2f7a', ground: '#2b2f52', speckle: '#3d4478', sky: '#1b1d38', fog: '#37306b', tree: '#25c2b0', trunk: '#3a3f6b', rock: '#5a5f9a' },
  { name: 'jungle', skyTop: '#4fc76a', skyBottom: '#dff7cf', ground: '#4fa34a', speckle: '#3b8a3c', sky: '#a8e6a0', fog: '#cdf0c4', tree: '#1f6b32', trunk: '#6b4a2a', rock: '#7d8f72' },
  { name: 'sherbet', skyTop: '#7fd8ff', skyBottom: '#ffe1ef', ground: '#ffc7d8', speckle: '#ffa8c4', sky: '#d7f0ff', fog: '#ffe3ef', tree: '#ff7bac', trunk: '#b4628a', rock: '#e8c3d6' },
];

/** Bake a bottom->top colour gradient into a geometry's vertex colours. */
function paintGradient(geo, bottom, top, y0, y1) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    c.copy(a).lerp(b, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Two-tier pine with a real brown trunk: colours are baked per vertex (dark
 * at the base of each tier, lit at the tip), so one instanced draw still
 * gets trunk + two shades of leaves.
 */
function treeGeometry(theme) {
  const trunk = new THREE.CylinderGeometry(0.15, 0.24, 1.2, 7);
  trunk.translate(0, 0.6, 0);
  const low = new THREE.ConeGeometry(1.08, 1.8, 8);
  low.translate(0, 1.75, 0);
  const high = new THREE.ConeGeometry(0.74, 1.5, 8);
  high.translate(0, 2.7, 0);
  paintGradient(trunk, shade(theme.trunk, -0.25), theme.trunk, 0, 1.2);
  paintGradient(low, shade(theme.tree, -0.3), shade(theme.tree, 0.05), 0.85, 2.65);
  paintGradient(high, shade(theme.tree, -0.12), shade(theme.tree, 0.3), 1.95, 3.45);
  const merged = mergeSimple([trunk, low, high]);
  trunk.dispose();
  low.dispose();
  high.dispose();
  return merged;
}

/** Minimal position/normal/uv merge (no per-vertex tags needed here). */
function mergeSimple(geoms) {
  let vc = 0;
  let ic = 0;
  for (const g of geoms) {
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : 0;
  }
  const position = new Float32Array(vc * 3);
  const normal = new Float32Array(vc * 3);
  const uv = new Float32Array(vc * 2);
  const hasColor = geoms.every((g) => g.attributes.color);
  const color = hasColor ? new Float32Array(vc * 3) : null;
  const index = new Uint16Array(ic);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    const c = g.attributes.position.count;
    position.set(g.attributes.position.array, vo * 3);
    normal.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (hasColor) color.set(g.attributes.color.array, vo * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
      io += gi.length;
    }
    vo += c;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(position, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (hasColor) m.setAttribute('color', new THREE.BufferAttribute(color, 3));
  m.setIndex(new THREE.BufferAttribute(index, 1));
  m.computeBoundingSphere();
  return m;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.theme = THEMES[0];
    this._disposables = [];
  }

  clear() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          // only textures cloned for this level are owned here; the shared
          // cache in textures.js keeps its own originals alive
          if (m.map && m.map.userData.perLevel) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.group.clear();
  }

  /**
   * Build the level geometry.
   * @param {number} themeIndex which THEMES entry to use
   * @param {number} length     road length in metres (finish line at z=length)
   * @param {function} rng      seeded rng for scenery placement
   * @param {number} arenaLength extra road past the finish for boss + stairs
   */
  build(themeIndex, length, rng, arenaLength = 90) {
    this.clear();
    const theme = THEMES[themeIndex % THEMES.length];
    this.theme = theme;
    this.length = length;
    this.arenaLength = arenaLength;


    const total = length + arenaLength + 60;

    // ---------------------------------------------------------- ground
    const gTex = groundTexture(theme.ground, theme.speckle);
    gTex.repeat.set(24, total / 8);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(320, total + 200),
      toonMaterial('#ffffff', { map: gTex, rim: 0 })
    );
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, total / 2 - 80);
    this.group.add(ground);

    // ------------------------------------------------------------ road
    const rTex = roadTexture();
    rTex.repeat.set(1, total / 7);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, total),
      toonMaterial('#ffffff', { map: rTex.clone(), rim: 0 })
    );
    road.receiveShadow = true;
    road.material.map.wrapS = road.material.map.wrapT = THREE.RepeatWrapping;
    road.material.map.repeat.set(1, total / 7);
    road.material.map.userData.perLevel = true;
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, total / 2 - 40);
    this.group.add(road);

    // ----------------------------------------------------------- curbs
    const curbMat = toonMaterial('#f7fbff', { rim: 0.5 });
    const curbGeo = new THREE.BoxGeometry(0.5, 0.42, total);
    const stripeTex = curbTexture().clone();
    stripeTex.repeat.set(1, total / 2.4);
    stripeTex.userData.perLevel = true;
    const stripeMat = toonMaterial('#ffffff', { map: stripeTex, rim: 0 });
    const stripeGeo = new THREE.PlaneGeometry(0.5, total);
    for (const sx of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(sx * (ROAD_HALF + 0.24), 0.16, total / 2 - 40);
      this.group.add(curb);
      // rumble stripes on the curb top; a box's top-face UVs run the wrong
      // way for a lengthwise pattern, so it gets its own plane
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx * (ROAD_HALF + 0.24), 0.375, total / 2 - 40);
      stripe.receiveShadow = true;
      this.group.add(stripe);
    }

    // ---------------------------------------------------- finish stripe
    const cTex = checkerTexture().clone();
    cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping;
    cTex.repeat.set(6, 1.4);
    cTex.userData.perLevel = true;
    const finishStripe = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 5),
      toonMaterial('#ffffff', { map: cTex, rim: 0 })
    );
    finishStripe.rotation.x = -Math.PI / 2;
    finishStripe.position.set(0, 0.02, length);
    this.group.add(finishStripe);

    this.buildScenery(theme, total, rng);
    return this;
  }

  /** Instanced trees, rocks and distant hills along both shoulders. */
  buildScenery(theme, total, rng) {
    const treeGeo = treeGeometry(theme);
    // colour comes from the baked vertex gradient; the material stays white
    // and only adds leaf-clump detail on top
    const treeMat = detailMaterial('#ffffff', 'foliage', { rim: 0.45, repeat: [2, 2] });
    treeMat.vertexColors = true;
    const treeCount = 150;
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
    trees.frustumCulled = false;
    trees.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (ROAD_HALF + 3 + rng() * 26);
      const z = -40 + rng() * (total + 40);
      const sc = 0.8 + rng() * 1.5;
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
      s.set(sc, sc * (0.85 + rng() * 0.5), sc);
      m.compose(p, q, s);
      trees.setMatrixAt(i, m);
    }
    trees.instanceMatrix.needsUpdate = true;
    this.group.add(trees);

    const rockGeo = new THREE.DodecahedronGeometry(0.7, 0);
    const rockMat = detailMaterial(theme.rock, 'rock', { rim: 0.5 });
    const rockCount = 60;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.frustumCulled = false;
    rocks.castShadow = true;
    for (let i = 0; i < rockCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      p.set(side * (ROAD_HALF + 1.6 + rng() * 22), rng() * 0.2, -40 + rng() * (total + 40));
      q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
      const sc = 0.4 + rng() * 1.3;
      s.set(sc, sc * 0.8, sc);
      m.compose(p, q, s);
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.group.add(rocks);

    // distant hills for parallax
    const hillGeo = new THREE.ConeGeometry(26, 16, 5);
    const hillMat = toonMaterial(theme.tree, { rim: 0.2 });
    hillMat.transparent = true;
    hillMat.opacity = 0.5;
    const hills = new THREE.InstancedMesh(hillGeo, hillMat, 18);
    hills.frustumCulled = false;
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      p.set(side * (60 + rng() * 60), -2, -60 + rng() * (total + 160));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
      const sc = 0.7 + rng() * 1.4;
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      hills.setMatrixAt(i, m);
    }
    hills.instanceMatrix.needsUpdate = true;
    this.group.add(hills);

    rockGeo.userData.shared = false;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
