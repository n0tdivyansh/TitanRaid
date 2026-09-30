/**
 * Animated glTF bosses (Quaternius "Ultimate Monsters", CC0). Loaded once in
 * the background; a level asks for one by name and falls back to the
 * procedural brute in props.js if that file isn't loaded (yet).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** File stems under public/models/bosses/, cycled by level. */
export const BOSS_MODELS = [
  'Orc',
  'Demon',
  'Yeti',
  'BlueDemon',
  'MushroomKing',
  'DragonEvolved',
  'Dino',
  'Tribal',
  'Alien',
  'GolelingEvolved',
];

const BASE_HEIGHT = 5.2; // matches the procedural brute before its HP scaling
const loaded = new Map();
let loading = null;

export function preloadBossModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}models/bosses/`;
  loading = Promise.all(
    BOSS_MODELS.map((name) =>
      loader
        .loadAsync(`${base}${name}.glb`)
        .then((gltf) => loaded.set(name, gltf))
        .catch(() => {})
    )
  );
  return loading;
}

export function hasBossModel(name) {
  return loaded.has(name);
}

const findClip = (clips, re) => clips.find((c) => re.test(c.name)) || null;

export function makeModelBoss(name, hp, z, scale) {
  const gltf = loaded.get(name);
  const model = cloneSkinned(gltf.scene);

  // precise=true measures the skinned pose; the plain box is off by the
  // rig's x100 armature scale, which the bind matrices cancel at render time
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const fit = BASE_HEIGHT / Math.max(0.001, box.max.y - box.min.y);
  model.scale.setScalar(fit);
  model.position.y = -box.min.y * fit;
  model.rotation.y = Math.PI; // Quaternius models face +Z; the crowd comes from -Z

  const group = new THREE.Group();
  group.add(model);
  group.position.set(0, 0, z);
  group.scale.setScalar(scale);

  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false; // skinned bounds lag the animated pose
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) if (m.emissive) mats.push(m);
  });

  const mixer = new THREE.AnimationMixer(model);
  const clips = gltf.animations;
  // flying monsters only ship Flying_Idle; ground ones have plain Idle
  const idle = findClip(clips, /\|idle$/i) || findClip(clips, /idle/i);
  const attack = findClip(clips, /punch|bite|headbutt|weapon|attack/i);
  const death = findClip(clips, /death|die/i);
  let current = null;
  const play = (clip, once = false) => {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (current === action) return;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    if (current) action.crossFadeFrom(current, 0.25, false);
    action.play();
    current = action;
  };
  play(idle);

  const data = {
    type: 'boss',
    hp,
    maxHp: hp,
    z,
    hitFlash: 0,
    flash() {
      data.hitFlash = 1;
    },
    fight() {
      play(attack || idle);
    },
    die() {
      if (!death) return false;
      play(death, true);
      return true;
    },
    update(dt) {
      mixer.update(dt);
      if (data.hitFlash > 0.001) {
        data.hitFlash = Math.max(0, data.hitFlash - dt * 6);
        for (const m of mats) m.emissive.setScalar(data.hitFlash * 0.35);
      }
    },
  };
  group.userData = data;
  return group;
}
