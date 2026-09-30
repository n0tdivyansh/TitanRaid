/**
 * Shared stylised materials: banded toon shading with a soft rim, which is
 * what gives the casual-mobile look (flat colour, crisp terminator, no
 * specular noise). Materials are cached so the whole scene shares programs.
 */
import * as THREE from 'three';
import { detailTexture } from './textures.js';

let gradientMap = null;

/** 4-step gradient ramp used by every toon material. */
export function toonRamp() {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([120, 176, 224, 255]);
  gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const cache = new Map();

/** Toon material with an optional fresnel rim light baked into the shader. */
export function toonMaterial(color, opts = {}) {
  const key = `${color}|${opts.rim ?? 0.35}|${opts.emissive ?? ''}|${opts.map ? 'm' : ''}`;
  if (!opts.map && cache.has(key)) return cache.get(key);

  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    map: opts.map || null,
  });
  const rim = opts.rim ?? 0.35;
  const rimColor = new THREE.Color(opts.rimColor || '#ffffff');

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uRimColor = { value: rimColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vViewNormal;\nvarying vec3 vViewPos;')
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\n  vViewNormal = normalize(transformedNormal);'
      )
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\n  vViewPos = -mvPosition.xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vViewNormal;\nvarying vec3 vViewPos;\nuniform float uRim;\nuniform vec3 uRimColor;'
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  float fres = 1.0 - clamp(dot(normalize(vViewNormal), normalize(vViewPos)), 0.0, 1.0);
  gl_FragColor.rgb += uRimColor * pow(fres, 3.0) * uRim;`
      );
  };

  if (!opts.map) cache.set(key, mat);
  return mat;
}

/**
 * Toon material tinted `color` with a detail tile (see detailTexture) on top.
 * `repeat` tiles the detail across the surface; each call gets its own
 * texture clone so repeats don't fight, while the image itself stays shared.
 */
export function detailMaterial(color, kind, opts = {}) {
  const tex = detailTexture(kind).clone();
  const [rx, ry] = opts.repeat || [1, 1];
  tex.repeat.set(rx, ry);
  return toonMaterial(color, { map: tex, rim: opts.rim ?? 0.4 });
}

/** Sky dome with a vertical gradient + soft horizon haze. */
export function makeSkyDome() {
  const geo = new THREE.SphereGeometry(300, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color('#57b7ff') },
      uBottom: { value: new THREE.Color('#dff3ff') },
      uHorizon: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uHorizon;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, smoothstep(0.42, 0.95, t));
        float haze = 1.0 - smoothstep(0.42, 0.62, t);
        col = mix(col, uHorizon, haze * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/** Fluffy billboard clouds drifting over the horizon. */
export function makeClouds(count = 14) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const blob = (x, y, r) => {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(52, 74, 34);
  blob(78, 68, 30);
  blob(64, 58, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    const scale = 26 + Math.random() * 44;
    s.scale.set(scale, scale * 0.55, 1);
    s.position.set((Math.random() - 0.5) * 320, 42 + Math.random() * 46, Math.random() * 520 - 60);
    s.userData.drift = 0.6 + Math.random() * 1.6;
    group.add(s);
  }
  group.renderOrder = -900;
  return group;
}
