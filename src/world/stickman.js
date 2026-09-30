/**
 * Procedural low-poly runner: an original chunky-stickman design built from
 * boxes and merged into ONE geometry so thousands can be drawn as a single
 * InstancedMesh.
 *
 * Limb animation happens entirely in the vertex shader:
 *   - every vertex carries aLimb (0 torso/head, 1/2 legs, 3/4 arms)
 *   - every instance carries aPhase (gait offset) and aAnim
 *     (0 = run cycle, 1 = cheer / arms-up, 2 = frozen)
 * so a 2000-strong crowd animates with zero per-frame CPU work.
 */
import * as THREE from 'three';
import { toonRamp } from './materials.js';

const LIMB_TORSO = 0;
const LIMB_LEG_L = 1;
const LIMB_LEG_R = 2;
const LIMB_ARM_L = 3;
const LIMB_ARM_R = 4;

function tagged(geometry, limb, position) {
  const g = geometry.clone();
  g.translate(position[0], position[1], position[2]);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count);
  arr.fill(limb);
  g.setAttribute('aLimb', new THREE.BufferAttribute(arr, 1));
  return g;
}

/** Merge BufferGeometries that share position/normal/uv/aLimb. */
function mergeTagged(geoms) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geoms) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : 0;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const aLimb = new Float32Array(vertexCount);
  const index = new Uint16Array(indexCount);

  let vOff = 0;
  let iOff = 0;
  for (const g of geoms) {
    const c = g.attributes.position.count;
    position.set(g.attributes.position.array, vOff * 3);
    normal.set(g.attributes.normal.array, vOff * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
    aLimb.set(g.attributes.aLimb.array, vOff);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) index[iOff + i] = gi[i] + vOff;
      iOff += gi.length;
    }
    vOff += c;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('aLimb', new THREE.BufferAttribute(aLimb, 1));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

/**
 * Shared runner geometry: rounded capsule limbs and a ball head, so the crowd
 * reads as smooth little characters rather than boxes. Segment counts are kept
 * low because this geometry is instanced up to ~1500 times.
 */
export function makeStickmanGeometry() {
  const head = new THREE.SphereGeometry(0.23, 10, 7);
  const torso = new THREE.CapsuleGeometry(0.185, 0.36, 2, 9);
  const arm = new THREE.CapsuleGeometry(0.068, 0.34, 1, 6);
  const leg = new THREE.CapsuleGeometry(0.082, 0.46, 1, 6);
  const foot = new THREE.SphereGeometry(0.1, 6, 5);

  const parts = [
    tagged(head, LIMB_TORSO, [0, 1.73, 0]),
    tagged(torso, LIMB_TORSO, [0, 1.16, 0]),
    tagged(arm, LIMB_ARM_L, [-0.245, 1.17, 0]), // shoulder pivot y = 1.40
    tagged(arm, LIMB_ARM_R, [0.245, 1.17, 0]),
    tagged(leg, LIMB_LEG_L, [-0.105, 0.43, 0]), // hip pivot y = 0.74
    tagged(leg, LIMB_LEG_R, [0.105, 0.43, 0]),
    tagged(foot, LIMB_LEG_L, [-0.105, 0.1, 0.05]),
    tagged(foot, LIMB_LEG_R, [0.105, 0.1, 0.05]),
  ];

  const geo = mergeTagged(parts);
  geo.computeBoundingSphere();
  for (const g of [head, torso, arm, leg, foot]) g.dispose();
  return geo;
}

const VERT_HEAD = [
  'attribute float aLimb;',
  'attribute float aPhase;',
  'attribute float aAnim;',
  'uniform float uTime;',
  'uniform float uRunSpeed;',
  'varying float vShade;',
  'varying float vHeight;',
].join('\n');

const VERT_BODY = [
  'float phase = aPhase + uTime * uRunSpeed;',
  'float swing = sin(phase);',
  'float pivotY = 0.0;',
  'float ang = 0.0;',
  'float bob = 0.0;',
  'if (aAnim < 0.5) {',
  '  if (aLimb > 0.5 && aLimb < 2.5) {',
  '    pivotY = 0.74;',
  '    ang = swing * 0.95 * (aLimb < 1.5 ? 1.0 : -1.0);',
  '  } else if (aLimb > 2.5) {',
  '    pivotY = 1.40;',
  '    ang = swing * 0.72 * (aLimb < 3.5 ? -1.0 : 1.0);',
  '  }',
  '  bob = abs(swing) * 0.075;',
  '} else if (aAnim < 1.5) {',
  '  if (aLimb > 2.5) {',
  '    pivotY = 1.40;',
  '    ang = (aLimb < 3.5 ? -1.0 : 1.0) * (2.5 + sin(phase * 2.0) * 0.25);',
  '  }',
  '  bob = max(0.0, sin(phase * 3.0)) * 0.16;',
  '}',
  'if (aLimb > 0.5 && abs(ang) > 0.0001) {',
  '  vec3 lp = transformed;',
  '  lp.y -= pivotY;',
  '  float c = cos(ang);',
  '  float s = sin(ang);',
  '  transformed.y = lp.y * c - lp.z * s + pivotY;',
  '  transformed.z = lp.y * s + lp.z * c;',
  '}',
  'transformed.y += bob;',
  'vShade = aLimb > 0.5 ? 0.88 : 1.0;',
  'vHeight = position.y;',
].join('\n');

/**
 * Pool of instanced stickmen with per-instance colour, gait phase and anim
 * mode. Write transforms with set(), then call commit(n).
 */
export class StickmanField {
  constructor(capacity) {
    this.capacity = capacity;
    this.geometry = makeStickmanGeometry();

    const phases = new Float32Array(capacity);
    const anims = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) phases[i] = Math.random() * Math.PI * 2;
    this.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.geometry.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anims, 1));
    this.phaseAttr = this.geometry.getAttribute('aPhase');
    this.animAttr = this.geometry.getAttribute('aAnim');

    this.material = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonRamp() });
    this.uniforms = { uTime: { value: 0 }, uRunSpeed: { value: 9.5 } };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uRunSpeed = this.uniforms.uRunSpeed;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      // darker feet -> lighter head, plus a fresnel rim: in a packed crowd
      // that edge light is what separates one runner from the next
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShade;\nvarying float vHeight;')
        .replace(
          '#include <dithering_fragment>',
          [
            '#include <dithering_fragment>',
            '  gl_FragColor.rgb *= vShade * mix(0.7, 1.08, smoothstep(0.05, 1.9, vHeight));',
            '  float fres = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);',
            '  gl_FragColor.rgb += vec3(0.32) * pow(fres, 3.0);',
          ].join('\n')
        );
    };

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;

    const colors = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  set(i, x, y, z, yaw = 0, scale = 1, pitch = 0, roll = 0) {
    if (i >= this.capacity) return;
    this._p.set(x, y, z);
    this._e.set(pitch, yaw, roll);
    this._q.setFromEuler(this._e);
    this._s.set(scale, scale, scale);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
  }

  setColor(i, color) {
    if (i >= this.capacity) return;
    const a = this.mesh.instanceColor.array;
    a[i * 3] = color.r;
    a[i * 3 + 1] = color.g;
    a[i * 3 + 2] = color.b;
  }

  setAnim(i, mode) {
    if (i < this.capacity) this.animAttr.array[i] = mode;
  }

  setPhase(i, phase) {
    if (i < this.capacity) this.phaseAttr.array[i] = phase;
  }

  fillColor(color, count = this.capacity) {
    for (let i = 0; i < count; i++) this.setColor(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }

  fillAnim(mode, count = this.capacity) {
    for (let i = 0; i < count; i++) this.animAttr.array[i] = mode;
    this.animAttr.needsUpdate = true;
  }

  commit(count) {
    this.mesh.count = Math.max(0, Math.min(count, this.capacity));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.animAttr.needsUpdate = true;
    this.phaseAttr.needsUpdate = true;
  }

  update(time, runSpeed) {
    this.uniforms.uTime.value = time;
    if (runSpeed !== undefined) this.uniforms.uRunSpeed.value = runSpeed;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
