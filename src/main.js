/**
 * Boot: wire the engine, UI, game and CrazyGames SDK together, then run the frame loop.
 */
import { Engine } from './core/engine.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { audio } from './core/audio.js';
import { save, addCoins, syncCloudSave } from './core/save.js';
import { skinById } from './ui/skins.js';
import { crazygames } from './core/crazygames.js';

const canvas = document.getElementById('scene');
const engine = new Engine(canvas);
const ui = new UI();
ui.setLoadProgress(0.3);

// Initialize CrazyGames SDK v3
crazygames.init().then(() => {
  crazygames.loadingStart();
  ui.setLoadProgress(0.6);
  syncCloudSave();
  ui.refreshStats();
  crazygames.loadingStop();
});

const game = new Game(engine, ui);
ui.setLoadProgress(0.85);

// A live level runs behind the main menu as an attract screen.
game.startLevel(save.level);
game.state = 'menu';
game.crowd.count = 24;
game.crowd.setSkin(skinById(save.skin).color);
ui.showMenu();
ui.hideLoading();

// ------------------------------------------------------------ handlers
ui.on('play', () => {
  audio.unlock();
  game.startLevel(save.level);
});

ui.on('next', () => {
  crazygames.requestMidgameAd({
    onComplete: () => {
      game.startLevel(save.level);
    },
  });
});

ui.on('retry', () => {
  crazygames.requestMidgameAd({
    onComplete: () => {
      game.restart();
    },
  });
});

ui.on('revive', () => {
  crazygames.requestRewardedAd({
    onRewarded: () => {
      game.revive();
    },
    onError: () => {
      ui.popup('AD UNAVAILABLE', 'bad');
    },
  });
});

ui.on('double', () => {
  crazygames.requestRewardedAd({
    onRewarded: () => {
      game.takeBonus();
    },
    onError: () => {
      ui.popup('AD UNAVAILABLE', 'bad');
    },
  });
});

ui.on('freeCoins', () => {
  crazygames.requestRewardedAd({
    onRewarded: () => {
      addCoins(250);
      ui.refreshStats();
      ui.renderSkins((skin) => game.setSkin(skin));
      ui.popup('+250 COINS!', 'gold');
      audio.coin(6);
    },
    onError: () => {
      ui.popup('AD UNAVAILABLE', 'bad');
    },
  });
});

ui.on('menu', () => {
  game.toMenu();
  game.startLevel(save.level);
  game.state = 'menu';
  game.crowd.count = 24;
  ui.showMenu();
});

ui.on('pause', () => {
  if (game.state === 'menu' || game.state === 'complete' || game.state === 'fail') return;
  game.setPaused(true);
  ui.showPause();
});

ui.on('resume', () => {
  game.setPaused(false);
  ui.hidePause();
});

ui.on('restart', () => {
  ui.hidePause();
  game.setPaused(false);
  game.restart();
});

ui.on('skins', () => {
  ui.showSkins((skin) => game.setSkin(skin));
});

ui.on('skinsClose', () => {
  ui.showMenu();
});

// Keyboard controls & prevent browser scrolling inside CrazyGames iframe
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    if (e.target === document.body || e.target === canvas) {
      e.preventDefault();
    }
  }

  if (e.key === 'Escape') {
    if (game.state === 'menu' || game.state === 'complete' || game.state === 'fail') return;
    if (game.paused) {
      game.setPaused(false);
      ui.hidePause();
    } else {
      game.setPaused(true);
      ui.showPause();
    }
  }

  if (e.key === ' ' && game.state === 'menu') {
    audio.unlock();
    game.startLevel(save.level);
  }
});

// Auto-pause and system mute on tab switch / window blur for CrazyGames compliance
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.setSystemMuted(true);
    if ((game.state === 'running' || game.state === 'boss') && !game.paused) {
      game.setPaused(true);
      ui.showPause();
    }
  } else {
    audio.setSystemMuted(false);
  }
});

window.addEventListener('blur', () => {
  audio.setSystemMuted(true);
  if ((game.state === 'running' || game.state === 'boss') && !game.paused) {
    game.setPaused(true);
    ui.showPause();
  }
});

window.addEventListener('focus', () => {
  audio.setSystemMuted(false);
});

// -------------------------------------------------------------- loop
engine.start((dt, time) => {
  game.update(dt, time);
});

// expose for quick debugging in the console
window.__ccl = {
  engine,
  game,
  ui,
  save,
  crazygames,
  /** Advance the simulation deterministically (used by automated checks). */
  step(steps = 60, dt = 1 / 60) {
    for (let i = 0; i < steps; i++) {
      engine.elapsed += dt;
      game.update(dt, engine.elapsed);
    }
    if (engine.postEnabled && engine.composer) engine.composer.render(1 / 60);
    else engine.renderer.render(engine.scene, engine.camera);
    return {
      state: game.state,
      z: Math.round(game.crowd.z * 10) / 10,
      count: Math.round(game.crowd.count),
      coins: game.runCoins,
    };
  },
  /** Force the steering axis for automated checks (-1 left, 1 right). */
  setAxis(axis) {
    game.input.axis = axis;
  },
};
