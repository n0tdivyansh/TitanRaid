/**
 * Game orchestration: state machine, level assembly, collisions, camera.
 *
 * States: menu -> running -> boss -> finale -> complete | fail
 */
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { save, persist, addCoins, unlockSkin } from '../core/save.js';
import { clamp, damp, makeRng } from '../core/rng.js';
import { Track } from '../world/track.js';
import { Crowd } from '../world/crowd.js';
import { Effects } from '../world/effects.js';
import {
  CoinField,
  EnemyForce,
  makeGatePair,
  makeObstacle,
  makeBoss,
  bossScale,
  BOSS_VARIANTS,
  makeStairs,
  applyOp,
  opText,
  OP_COLORS,
} from '../world/props.js';
import { BOSS_MODELS, preloadBossModels, hasBossModel, makeModelBoss } from '../world/bossModels.js';
import { buildLevelPlan } from './level.js';
import { ROAD_HALF, CROWD_LIMIT, LATERAL_SPEED, CAMERA_OFFSET } from '../world/constants.js';
import { skinById, nextFreeSkin } from '../ui/skins.js';
import { crazygames } from '../core/crazygames.js';

export class Game {
  constructor(engine, ui) {
    this.engine = engine;
    preloadBossModels();
    this.ui = ui;
    this.scene = engine.scene;
    this.camera = engine.camera;

    this.track = new Track(this.scene);
    this.crowd = new Crowd(this.scene);
    this.effects = new Effects(this.scene);
    this.coinField = new CoinField(this.scene);
    this.enemies = new EnemyForce(this.scene);

    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);

    this.input = new Input(engine.renderer.domElement);

    this.state = 'menu';
    this.paused = false;
    this.plan = null;
    this.gates = [];
    this.obstacles = [];
    this.boss = null;
    this.stairs = null;
    this.runCoins = 0;
    this.peakCrowd = 0;
    this.shake = 0;
    this.finale = null;
    this.deathBudget = 0;
    this.bonusTaken = false;
    this.lastReward = null;

    this.crowd.setSkin(skinById(save.skin).color);
    this._camLook = new THREE.Vector3(0, 1.5, 8);
  }

  // ------------------------------------------------------------- level
  clearLevel() {
    this.levelGroup.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
    this.levelGroup.clear();
    this.gates = [];
    this.obstacles = [];
    this.boss = null;
    this.stairs = null;
    this.enemies.clear();
    this.effects.clear();
  }

  startLevel(levelNumber) {
    this.clearLevel();
    const plan = buildLevelPlan(levelNumber);
    this.plan = plan;
    const rng = makeRng(plan.seed + 77);

    this.track.build(plan.themeIndex, plan.length, rng, plan.arenaLength);
    this.engine.applyTheme(this.track.theme);

    const coins = [];
    const squads = [];
    for (const ev of plan.events) {
      if (ev.type === 'gates') {
        const gate = makeGatePair(ev.left, ev.right, ev.z);
        this.levelGroup.add(gate);
        this.gates.push(gate);
      } else if (ev.type === 'coins') {
        coins.push(...ev.coins);
      } else if (ev.type === 'obstacle') {
        const ob = makeObstacle(ev.kind, ev.opts);
        this.levelGroup.add(ob);
        this.obstacles.push(ob);
      } else if (ev.type === 'enemy') {
        squads.push({ x: ev.x, z: ev.z, count: ev.count });
      }
    }
    this.coinField.reset(coins);
    this.enemies.reset(squads);

    // boss stands just past the finish line - a different silhouette each
    // level so the finale doesn't repeat the same brute every run
    this.bossZ = plan.length + 30;
    const modelName = BOSS_MODELS[(plan.level - 1) % BOSS_MODELS.length];
    if (hasBossModel(modelName)) {
      this.boss = makeModelBoss(modelName, plan.bossHp, this.bossZ, bossScale(plan.bossHp));
    } else {
      const bossVariant = BOSS_VARIANTS[(plan.level - 1) % BOSS_VARIANTS.length];
      this.boss = makeBoss(plan.bossHp, this.bossZ, bossVariant);
    }
    this.levelGroup.add(this.boss);

    const stairs = makeStairs(plan.stairs.count, plan.stairs.startZ, {
      firstMult: plan.stairs.firstMult,
      multStep: plan.stairs.multStep,
    });
    this.levelGroup.add(stairs.group);
    this.stairs = stairs;

    this.crowd.reset(plan.startCount, 0, 6);
    this.crowd.setSkin(skinById(save.skin).color);
    this.crowd.setRunAnim();

    this.runCoins = 0;
    this.peakCrowd = plan.startCount;
    this.shake = 0;
    this.deathBudget = 0;
    this.bonusTaken = false;
    this.finale = null;
    this.state = 'running';
    this.paused = false;
    this.input.reset();

    this.camera.position.set(CAMERA_OFFSET.x, CAMERA_OFFSET.y, this.crowd.z + CAMERA_OFFSET.z);
    this.ui.setLevel(levelNumber, plan.archetypeLabel);
    this.ui.setCoins(save.coins);
    this.ui.setProgress(0);
    this.ui.showBossBar(false);
    this.ui.showHud();
    this.ui.showTutorial(!save.seenTutorial);
    this.ui.resetBonusButton();
    audio.unlock();
    crazygames.gameplayStart();
  }

  restart() {
    this.startLevel(this.plan ? this.plan.level : save.level);
  }

  toMenu() {
    this.state = 'menu';
    this.paused = false;
    this.clearLevel();
    crazygames.gameplayStop();
    this.ui.showMenu();
  }

  // -------------------------------------------------------- main update
  update(dt, time) {
    this.crowd.field.update(time, this.state === 'running' || this.state === 'boss' ? 11 : 6);
    this.effects.ragField.update(time, 0);
    this.enemies.field.update(time, 3);

    if (this.paused || this.state === 'menu' || this.state === 'complete' || this.state === 'fail') {
      this.effects.update(dt);
      this.coinField.update(time);
      if (this.state === 'fail' || this.state === 'complete' || this.state === 'menu') {
        this.crowd.cheer(dt, time);
      }
      this.updateCamera(dt, time);
      return;
    }

    for (const ob of this.obstacles) ob.userData.update?.(dt, time);
    if (this.boss) this.boss.userData.update?.(dt, time);
    this.coinField.update(time);

    if (this.state === 'running') this.updateRun(dt, time);
    else if (this.state === 'boss') this.updateBoss(dt, time);
    else if (this.state === 'finale') this.updateFinale(dt, time);

    this.effects.update(dt);
    this.enemies.layout(time);
    this.updateCamera(dt, time);

    if (this.crowd.count > this.peakCrowd) this.peakCrowd = Math.floor(this.crowd.count);
  }

  steer(dt) {
    const drag = this.input.consumePointerDelta();
    // The camera trails the crowd looking down +Z, so world +X is screen LEFT.
    // Negate here so "D"/right-arrow/drag-right move the crowd to the right of
    // the screen, which is what the player expects.
    this.crowd.x -= this.input.axis * LATERAL_SPEED * dt + drag * ROAD_HALF * 1.7;
    this.crowd.clampLateral(CROWD_LIMIT);
    if (this.input.hasMoved && !save.seenTutorial) {
      save.seenTutorial = true;
      persist();
      this.ui.showTutorial(false);
    }
  }

  updateRun(dt, time) {
    const plan = this.plan;
    this.steer(dt);
    this.crowd.z += plan.speed * dt;
    this.crowd.update(dt, time);
    audio.footsteps(dt, this.crowd.count);

    this.dustTimer = (this.dustTimer || 0) - dt;
    if (this.dustTimer <= 0) {
      this.dustTimer = 0.06;
      this.effects.dust(this.crowd.x, this.crowd.z, this.crowd.radius, '#ffffff');
    }

    this.checkGates();
    this.checkCoins();
    this.checkObstacles(dt);
    this.checkEnemies(dt);

    this.ui.setProgress(this.crowd.z / plan.length);

    if (this.crowd.count < 1) return this.fail('Your crowd was wiped out on the track.');
    if (this.crowd.z >= plan.length) {
      this.state = 'boss';
      this.ui.setProgress(1);
      this.ui.showBossBar(true);
      this.ui.setBoss(this.boss.userData.hp, this.boss.userData.maxHp);
      audio.whoosh();
    }
  }

  checkGates() {
    for (const gate of this.gates) {
      const d = gate.userData;
      if (d.used) continue;
      if (this.crowd.z < d.z) continue;
      d.used = true;
      const op = this.crowd.x < 0 ? d.left : d.right;
      const before = Math.round(this.crowd.count);
      const after = Math.max(0, applyOp(before, op));
      this.crowd.count = after;
      this.crowd._initialised = this.crowd._initialised && after <= before;
      const good = after >= before;
      const delta = after - before;
      this.ui.popup(opText(op), good ? 'good' : 'bad');
      this.effects.floatText(
        this.crowd.x,
        5.6,
        this.crowd.z + 1.5,
        `${delta >= 0 ? '+' : ''}${delta}`,
        good ? '#7dfca0' : '#ff9a9a'
      );
      this.effects.burst(this.crowd.x, 1.4, this.crowd.z, OP_COLORS[op.type], 22, 8);
      if (good) audio.gateGood(op.type === 'mul' ? 2 : 1);
      else {
        audio.gateBad();
        this.effects.ragdoll(this.crowd.x, 0.6, this.crowd.z, this.crowd.color.getStyle(), Math.min(10, before - after));
        this.shake = Math.min(0.5, this.shake + 0.22);
      }
      gate.visible = false;
    }
  }

  checkCoins() {
    const list = this.coinField.coins;
    const reach = this.crowd.radius + 1.5;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.taken) continue;
      const dz = c.z - this.crowd.z;
      if (dz > reach || dz < -reach - 1) continue;
      if (Math.abs(c.x - this.crowd.x) > reach) continue;
      c.taken = true;
      this.runCoins += 1;
      this.ui.setCoins(save.coins + this.runCoins);
      audio.coin(this._coinStreak = ((this._coinStreak || 0) + 1) % 8);
      this.effects.burst(c.x, c.y, c.z, '#ffd84d', 6, 5);
    }
  }

  checkObstacles(dt) {
    for (const ob of this.obstacles) {
      const d = ob.userData;
      const dz = Math.abs(ob.position.z - this.crowd.z);
      const reachZ = d.halfDepth + this.crowd.radius + 0.4;
      if (dz > reachZ) continue;
      const dx = Math.abs(d.x - this.crowd.x);
      const reachX = d.halfWidth + this.crowd.radius;
      if (dx > reachX) continue;

      // how much of the blob is inside the hazard, 0..1
      const overlap = clamp((reachX - dx) / Math.max(0.6, this.crowd.radius * 2), 0, 1);
      if (!d.contact) d.contact = { start: this.crowd.count, killed: 0 };
      const allowance = d.contact.start * d.capFrac - d.contact.killed;
      if (allowance <= 0) continue;
      // proportional damage: big armies lose a slice, tiny ones are not erased
      let kills = (this.crowd.count * 0.85 + 4) * d.severity * overlap * dt;
      kills = Math.min(kills, allowance, this.crowd.count);
      if (kills <= 0) continue;
      const before = this.crowd.count;
      this.crowd.count = Math.max(0, this.crowd.count - kills);
      d.contact.killed += before - this.crowd.count;
      this.deathBudget += before - this.crowd.count;
      this.shake = Math.min(0.6, this.shake + kills * 0.02);

      if (this.deathBudget >= 1) {
        const n = Math.min(6, Math.floor(this.deathBudget));
        this.deathBudget -= n;
        this.effects.ragdoll(
          this.crowd.x + (d.x > this.crowd.x ? 0.6 : -0.6),
          0.7,
          this.crowd.z,
          this.crowd.color.getStyle(),
          n,
          d.x > this.crowd.x ? -1 : 1
        );
        audio.hit();
      }
      if (this.crowd.count < 1) this.fail('A hazard tore through the crowd.');
    }
  }

  checkEnemies(dt) {
    for (const squad of this.enemies.squads) {
      if (squad.alive <= 0) continue;
      const dz = Math.abs(squad.z - this.crowd.z);
      if (dz > this.crowd.radius + 1.9) continue;
      if (Math.abs(squad.x - this.crowd.x) > this.crowd.radius + 2.2) continue;

      const rate = (55 + this.crowd.count * 0.4) * dt;
      const loss = Math.min(this.crowd.count, rate);
      const enemyLoss = Math.min(squad.alive, rate * 1.15);
      this.crowd.count -= loss;
      squad.alive -= enemyLoss;

      this.effects.burst(
        (squad.x + this.crowd.x) / 2,
        1.2,
        (squad.z + this.crowd.z) / 2,
        '#ffffff',
        3,
        6
      );
      if (Math.random() < dt * 14) {
        audio.clash();
        this.effects.ragdoll(squad.x, 0.7, squad.z, '#ef4444', 2);
        this.effects.ragdoll(this.crowd.x, 0.7, this.crowd.z, this.crowd.color.getStyle(), 1);
      }
      this.shake = Math.min(0.45, this.shake + dt * 0.8);
      if (squad.alive <= 0) {
        squad.alive = 0;
        squad.defeated = true;
        this.ui.popup('SQUAD DOWN', 'good');
        this.effects.burst(squad.x, 1.4, squad.z, '#ef4444', 20, 8);
      }
      if (this.crowd.count < 1) this.fail('An enemy squad overwhelmed you.');
    }
  }

  // --------------------------------------------------------- boss fight
  updateBoss(dt, time) {
    const bossData = this.boss.userData;
    const stopZ = this.bossZ - 7.5;
    this.steer(dt);
    this.crowd.x = damp(this.crowd.x, 0, 4, dt);

    if (this.crowd.z < stopZ) {
      this.crowd.z = Math.min(stopZ, this.crowd.z + this.plan.speed * dt);
      this.crowd.update(dt, time);
      audio.footsteps(dt, this.crowd.count);
      return;
    }

    // slug it out: the crowd throws itself at the brute
    bossData.fight?.();
    const rate = (46 + this.crowd.count * 0.55) * dt;
    const dmg = Math.min(bossData.hp, rate);
    bossData.hp -= dmg;
    const losses = Math.min(this.crowd.count, rate * 0.7);
    this.crowd.count -= losses;
    this.deathBudget += losses;

    this.crowd.update(dt, time, { snappy: true, spread: 1.05 + Math.sin(time * 9) * 0.05 });
    this.ui.setBoss(bossData.hp, bossData.maxHp);
    this.shake = Math.min(0.5, this.shake + dt * 1.2);

    if (this.deathBudget >= 1.6) {
      const n = Math.min(5, Math.floor(this.deathBudget));
      this.deathBudget -= n;
      this.effects.ragdoll(this.crowd.x, 1.0, this.crowd.z + 1.2, this.crowd.color.getStyle(), n);
      this.effects.burst(0, 2.4, this.bossZ - 2, '#ff6b6b', 8, 7);
      this.boss.userData.flash?.();
      audio.bossHit();
    }

    if (bossData.hp <= 0) {
      bossData.hp = 0;
      this.ui.setBoss(0, bossData.maxHp);
      this.ui.popup('BOSS DOWN!', 'gold');
      this.effects.confetti(0, 4.2, this.bossZ - 1, 110);
      audio.levelWin();
      crazygames.happytime();
      this.beginFinale();
    } else if (this.crowd.count < 1) {
      this.fail('The boss was too strong - grab more gates next time.');
    }
  }

  beginFinale() {
    this.state = 'finale';
    this.ui.showBossBar(false);
    this.finale = {
      phase: 'celebrate',
      t: 0,
      blend: 0,
      step: -1,
      stepTimer: 0,
      baseY: 0,
      mult: 0,
      bossFall: 0,
    };
  }

  // ------------------------------------------------------------ finale
  updateFinale(dt, time) {
    const f = this.finale;
    const stairs = this.stairs;
    f.t += dt;

    // a model boss plays its own death animation; the procedural brute
    // topples over backwards instead
    if (this.boss) {
      if (f.bossDied === undefined) f.bossDied = this.boss.userData.die?.() === true;
      if (!f.bossDied) {
        f.bossFall = Math.min(1, f.bossFall + dt * 1.6);
        this.boss.rotation.x = -f.bossFall * 1.45;
        this.boss.position.y = -f.bossFall * 0.9;
      }
    }

    if (f.phase === 'celebrate') {
      this.crowd.cheer(dt, time);
      if (f.t > 1.1) {
        f.phase = 'march';
        f.t = 0;
        this.crowd.setRunAnim();
        this.ui.popup('STACK UP!', 'gold');
      }
      return;
    }

    if (f.phase === 'march') {
      const targetZ = stairs.steps[0].z - 4.6;
      this.crowd.x = damp(this.crowd.x, 0, 6, dt);
      this.crowd.z = Math.min(targetZ, this.crowd.z + this.plan.speed * 0.85 * dt);
      this.crowd.update(dt, time);
      audio.footsteps(dt, this.crowd.count);
      if (this.crowd.z >= targetZ - 0.05) {
        f.phase = 'climb';
        f.t = 0;
        f.stepTimer = 0.25;
        audio.whoosh();
      }
      return;
    }

    if (f.phase === 'climb') {
      const reachable = Crowd.climbSteps(this.crowd.count, stairs.steps.length);
      const maxStep = Math.min(stairs.steps.length - 1, reachable - 1);
      f.stepTimer -= dt;
      if (f.stepTimer <= 0 && f.step < maxStep) {
        f.step++;
        f.stepTimer = 0.26;
        const s = stairs.steps[f.step];
        f.mult = s.mult;
        audio.stairStep(f.step);
        this.ui.popup(`x${s.mult}`, 'gold');
        this.effects.burst(0, s.y + 1.2, s.z, s.color, 16, 7);
      }
      const target = f.step >= 0 ? stairs.steps[f.step] : stairs.steps[0];
      f.baseY = damp(f.baseY, target.y, 8, dt);
      this.crowd.stairLine(dt, time, stairs.steps, Math.max(0, f.step), 1);
      audio.footsteps(dt, this.crowd.count);
      if (f.step >= maxStep && Math.abs(f.baseY - target.y) < 0.12) {
        f.phase = 'reward';
        f.t = 0;
      }
      return;
    }

    if (f.phase === 'reward') {
      this.crowd.stairLine(dt, time, stairs.steps, Math.max(0, f.step), 1);
      if (f.t > 0.55) {
        f.phase = 'done';
        this.complete(f.mult || 1);
      }
    }
  }

  // -------------------------------------------------- end-of-run results
  complete(mult) {
    this.state = 'complete';
    const crowd = Math.max(0, Math.floor(this.crowd.count));
    // diminishing returns on crowd size keeps the coin economy sane across
    // levels where the army snowballs into the thousands
    const reward = Math.max(1, Math.round(this.runCoins + crowd * mult * 0.35));
    this.lastReward = { coins: reward, crowd, mult };

    addCoins(reward);
    save.level = Math.max(save.level, this.plan.level + 1);
    save.bestCrowd = Math.max(save.bestCrowd, this.peakCrowd);
    save.skinProgress += 10;
    if (save.skinProgress >= 100) {
      const next = nextFreeSkin(save.unlocked);
      save.skinProgress = 0;
      if (next) {
        unlockSkin(next.id);
        this.ui.popup(`NEW SKIN: ${next.name.toUpperCase()}`, 'gold');
      }
    }
    persist();

    audio.levelWin();
    crazygames.happytime();
    crazygames.gameplayStop();
    this.ui.setCoins(save.coins);
    this.ui.showComplete({
      coins: reward,
      crowd,
      mult,
      skinProgress: save.skinProgress,
    });
    this.ui.refreshStats();
  }

  /** The "+35%" reward button on the complete screen. */
  takeBonus() {
    if (this.bonusTaken || !this.lastReward) return;
    this.bonusTaken = true;
    const extra = Math.max(1, Math.round(this.lastReward.coins * 0.35));
    addCoins(extra);
    this.lastReward.coins += extra;
    this.ui.setCoins(save.coins);
    this.ui.markBonusTaken();
    this.ui.popup(`+${extra}`, 'gold');
    this.ui.refreshStats();
    audio.coin(6);
  }

  fail(reason) {
    if (this.state === 'fail') return;
    this.state = 'fail';
    this.crowd.count = 0;
    save.bestCrowd = Math.max(save.bestCrowd, this.peakCrowd);
    persist();
    audio.lose();
    crazygames.gameplayStop();
    this.ui.showBossBar(false);
    this.ui.showFail(reason);
  }

  // ------------------------------------------------------------ camera
  updateCamera(dt, time) {
    const c = this.crowd;
    let targetX = c.x * 0.45;
    // tall phone screens pull the camera back so the whole crowd fits the frame
    const fov = this.engine.baseFov || 52;
    const back = fov >= 70 ? 1.32 : fov >= 60 ? 1.15 : 1;
    let targetY = CAMERA_OFFSET.y * back;
    let targetZ = c.z + CAMERA_OFFSET.z * back;
    let lookY = 1.6;
    let lookZ = c.z + 9;
    let lookX = c.x * 0.6;

    if (this.state === 'boss') {
      targetY = 9.4;
      targetZ = c.z - 15;
      lookZ = this.bossZ - 2;
      lookY = 3.4;
      lookX = 0;
    } else if (this.state === 'finale' && this.finale) {
      const f = this.finale;
      if (f.phase === 'climb' || f.phase === 'reward') {
        // side view is the first thing a narrow portrait screen crops, so
        // back further off there
        const side = back > 1 ? back * 1.25 : 1;
        targetX = -12.5 * side;
        targetY = f.baseY + 5.5 * side;
        targetZ = c.z - 8.5 * side;
        lookX = -1;
        lookY = f.baseY + 1.6;
        lookZ = c.z + 1.5;
      } else {
        targetY = 8.6;
        targetZ = c.z - 13;
        lookY = 3.2;
        lookX = 0;
        lookZ = c.z + 6;
      }
    } else if (this.state === 'complete' || this.state === 'fail') {
      // the crowd may be parked high up the stairs - frame it from further back
      const lift = this.finale ? this.finale.baseY : 0;
      targetX = c.x + Math.sin(time * 0.35) * 7;
      targetY = 8.5 + lift * 0.9;
      targetZ = c.z - 17;
      lookX = c.x;
      lookY = lift + 3.0;
      lookZ = c.z;
    }

    const lambda = 5.5;
    this.camera.position.x = damp(this.camera.position.x, targetX, lambda, dt);
    this.camera.position.y = damp(this.camera.position.y, targetY, lambda, dt);
    this.camera.position.z = damp(this.camera.position.z, targetZ, lambda * 1.6, dt);

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.6;
    }

    this._camLook.set(
      damp(this._camLook.x, lookX, lambda, dt),
      damp(this._camLook.y, lookY, lambda, dt),
      damp(this._camLook.z, lookZ, lambda * 1.6, dt)
    );
    this.camera.lookAt(this._camLook);

  }

  setPaused(p) {
    this.paused = p;
    if (p) {
      crazygames.gameplayStop();
    } else if (this.state === 'running' || this.state === 'boss') {
      crazygames.gameplayStart();
    }
    // drop any drag accumulated while the game was not simulating, so the
    // crowd does not teleport sideways the moment play resumes
    this.input.consumePointerDelta();
    this.input.dragging = false;
  }

  revive() {
    if (this.state !== 'fail') return;
    const restoreCount = Math.max(30, Math.round(this.peakCrowd * 0.5));
    this.crowd.count = restoreCount;
    this.paused = false;

    if (this.boss && this.crowd.z >= this.bossZ - 14) {
      this.state = 'boss';
      this.crowd.z = this.bossZ - 8;
      this.ui.showBossBar(true);
      this.ui.setBoss(this.boss.userData.hp, this.boss.userData.maxHp);
    } else {
      this.state = 'running';
      this.crowd.z = Math.max(0, this.crowd.z - 10);
      this.ui.showBossBar(false);
    }

    this.crowd.reset(this.crowd.count, 0, this.crowd.z);
    this.crowd.setSkin(skinById(save.skin).color);
    this.crowd.setRunAnim();
    this.ui.showHud();
    this.ui.popup('REVIVED! +30', 'good');
    audio.levelWin();
    crazygames.gameplayStart();
  }

  setSkin(skin) {
    this.crowd.setSkin(skin.color);
  }
}
