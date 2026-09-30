/**
 * Renderer / scene / camera bootstrap plus the frame loop driver.
 */
import * as THREE from 'three';
import { makeSkyDome, makeClouds } from '../world/materials.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Cheap grade: vignette + a touch of contrast and saturation. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.22 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.06 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, dot(d, d) * 2.2);
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = c;
    }
  `,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: (window.devicePixelRatio || 1) < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // Soft studio reflections for the standard (PBR) materials on the glTF
    // bosses - the toon materials used everywhere else ignore it.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog('#a8e2ff', 95, 210);

    this.sky = makeSkyDome();
    this.scene.add(this.sky);
    this.clouds = makeClouds(16);
    this.scene.add(this.clouds);

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.5,
      420
    );
    this.camera.position.set(0, 8, -12);
    this.camera.lookAt(0, 1.5, 6);

    const hemi = new THREE.HemisphereLight('#ffffff', '#6b7f5a', 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff3d6', 1.5);
    sun.position.set(-20, 38, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const rim = new THREE.DirectionalLight('#9fd4ff', 0.45);
    rim.position.set(16, 14, 20);
    this.scene.add(rim);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    this.setupPostFx();

    this._raf = 0;
    this._last = 0;
    this._update = null;
    this.elapsed = 0;
    this.resize();
  }

  /**
   * Bloom + grade. Skipped on low-end devices (small GPU budget) where the
   * extra full-screen passes cost more than they add.
   */
  setupPostFx() {
    const lowEnd =
      (navigator.hardwareConcurrency || 4) <= 4 && /Android|iPhone|iPad/i.test(navigator.userAgent || '');
    this.postEnabled = !lowEnd;
    if (!this.postEnabled) return;
    try {
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.5, 0.9);
      this.composer.addPass(this.bloom);
      this.grade = new ShaderPass(GradeShader);
      this.composer.addPass(this.grade);
      this.composer.addPass(new OutputPass());
    } catch (err) {
      this.postEnabled = false;
      this.composer = null;
    }
  }

  setPostEnabled(on) {
    this.postEnabled = on && !!this.composer;
  }

  resize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the road framed on tall phone screens by widening the FOV.
    const portrait = h / w;
    this.baseFov = portrait > 1.5 ? 70 : portrait > 1.1 ? 60 : 52;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.setSize(w, h);
    }
  }

  start(updateFn) {
    this._update = updateFn;
    this._last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05; // clamp long frames (tab switch) to avoid tunnelling
      this.elapsed += dt;
      if (this._update) this._update(dt, this.elapsed);
      this.updateAmbient(dt);
      if (this.postEnabled && this.composer) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Keep the sky, clouds and shadow frustum anchored to the camera. */
  updateAmbient(dt) {
    if (this.sky) this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    if (this.clouds) {
      this.clouds.position.z = this.camera.position.z;
      for (const c of this.clouds.children) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 190) c.position.x = -190;
      }
    }
    if (this.sun) {
      const z = this.camera.position.z + 22;
      this.sun.position.set(-20, 38, z - 10);
      this.sun.target.position.set(0, 0, z);
      this.sun.target.updateMatrixWorld();
    }
  }

  /** Tint sky + fog for the current level theme. */
  applyTheme(theme) {
    if (this.sky) {
      this.sky.material.uniforms.uTop.value.set(theme.skyTop || theme.sky);
      this.sky.material.uniforms.uBottom.value.set(theme.skyBottom || theme.fog);
      this.sky.material.uniforms.uHorizon.value.set(theme.fog);
    }
    if (this.scene.fog) this.scene.fog.color.set(theme.fog);
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }
}
