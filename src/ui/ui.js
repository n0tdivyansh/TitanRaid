/** DOM overlay: HUD, menus, screens, popups. */
import { save, persist } from '../core/save.js';
import { audio } from '../core/audio.js';
import { SKINS, skinById, nextFreeSkin } from './skins.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor() {
    this.el = {
      hud: $('#hud'),
      menu: $('#menu'),
      skins: $('#skins'),
      complete: $('#complete'),
      fail: $('#fail'),
      pause: $('#pause'),
      loading: $('#loading'),
      tutorial: $('#tutorial'),
      bossBar: $('#boss-bar'),
      bossFill: $('.boss-fill'),
      bossHp: $('#boss-hp'),
      progressFill: $('.progress-fill'),
      progressRunner: $('.progress-runner'),
      hudLevel: $('#hud-level'),
      hudCoins: $('#hud-coins'),
      menuLevel: $('#menu-level'),
      menuCoins: $('#menu-coins'),
      menuBest: $('#menu-best'),
      comboFeed: $('#combo-feed'),
      completeCoins: $('#complete-coins'),
      completeDetail: $('#complete-detail-text'),
      completeSkinText: $('#complete-skin-text'),
      skinProgressText: $('#skin-progress-text'),
      skinGrid: $('#skin-grid'),
      failDetail: $('#fail-detail'),
      soundBtn: $('#btn-sound'),
      loadFill: $('.load-fill'),
    };
    this.handlers = {};
    this._bindButtons();
    this.refreshStats();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  _fire(name) {
    audio.unlock();
    audio.click();
    const fn = this.handlers[name];
    if (fn) fn();
  }

  _bindButtons() {
    const bind = (sel, name) => {
      const el = $(sel);
      if (el) el.addEventListener('click', () => this._fire(name));
    };
    bind('#btn-play', 'play');
    bind('#btn-next', 'next');
    bind('#btn-double', 'double');
    bind('#btn-retry', 'retry');
    bind('#btn-revive', 'revive');
    bind('#btn-quit', 'menu');
    bind('#btn-menu', 'menu');
    bind('#btn-home', 'menu');
    bind('#btn-pause', 'pause');
    bind('#btn-resume', 'resume');
    bind('#btn-restart', 'restart');
    bind('#btn-skins', 'skins');
    bind('#btn-skins-close', 'skinsClose');
    bind('#btn-free-coins', 'freeCoins');
    if (this.el.soundBtn) {
      this.el.soundBtn.addEventListener('click', () => {
        audio.unlock();
        audio.setEnabled(!audio.enabled);
        this.updateSoundLabel();
        audio.click();
      });
    }
    this.updateSoundLabel();
  }

  updateSoundLabel() {
    if (this.el.soundBtn) this.el.soundBtn.textContent = `SOUND: ${audio.enabled ? 'ON' : 'OFF'}`;
  }

  // ---------------------------------------------------------- screens
  hideAll() {
    for (const k of ['menu', 'skins', 'complete', 'fail', 'pause', 'loading']) {
      this.el[k]?.classList.add('hidden');
    }
  }

  showMenu() {
    this.hideAll();
    this.el.hud.classList.add('hidden');
    this.el.menu.classList.remove('hidden');
    this.refreshStats();
  }

  showHud() {
    this.hideAll();
    this.el.hud.classList.remove('hidden');
  }

  showPause() {
    this.el.pause.classList.remove('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
  }

  hideLoading() {
    if (!this.el.loading) return;
    this.el.loadFill.style.width = '100%';
    setTimeout(() => this.el.loading.classList.add('hidden'), 220);
  }

  setLoadProgress(p) {
    if (this.el.loadFill) this.el.loadFill.style.width = `${Math.round(p * 100)}%`;
  }

  refreshStats() {
    if (this.el.menuLevel) this.el.menuLevel.textContent = String(save.level);
    if (this.el.menuCoins) this.el.menuCoins.textContent = String(save.coins);
    if (this.el.menuBest) this.el.menuBest.textContent = String(save.bestCrowd);
    if (this.el.hudCoins) this.el.hudCoins.textContent = String(save.coins);
    if (this.el.skinProgressText) this.el.skinProgressText.textContent = `${save.skinProgress}%`;
    const bar = this.el.skins?.querySelector('.skin-progress-fill');
    if (bar) bar.style.width = `${save.skinProgress}%`;
  }

  setLevel(n, label) {
    if (this.el.hudLevel) {
      this.el.hudLevel.textContent = label ? `${n} - ${label}` : String(n);
    }
  }

  setCoins(n) {
    if (this.el.hudCoins) this.el.hudCoins.textContent = String(n);
  }

  setProgress(p) {
    const pct = Math.max(0, Math.min(1, p)) * 100;
    if (this.el.progressFill) this.el.progressFill.style.width = `${pct}%`;
    if (this.el.progressRunner) this.el.progressRunner.style.left = `${pct}%`;
  }

  showTutorial(show) {
    this.el.tutorial?.classList.toggle('hidden', !show);
  }

  // ----------------------------------------------------------- popups
  popup(text, cls = '') {
    if (!this.el.comboFeed) return;
    const div = document.createElement('div');
    div.className = `pop ${cls}`;
    div.textContent = text;
    this.el.comboFeed.appendChild(div);
    setTimeout(() => div.remove(), 1000);
    while (this.el.comboFeed.children.length > 4) this.el.comboFeed.firstChild.remove();
  }

  showBossBar(show) {
    this.el.bossBar?.classList.toggle('hidden', !show);
  }

  setBoss(hp, maxHp) {
    if (this.el.bossFill) this.el.bossFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    if (this.el.bossHp) this.el.bossHp.textContent = String(Math.max(0, Math.ceil(hp)));
  }

  // -------------------------------------------------- end-of-run screens
  showComplete({ coins, crowd, mult, skinProgress }) {
    this.hideAll();
    this.el.hud.classList.add('hidden');
    this.el.complete.classList.remove('hidden');
    this.el.completeCoins.textContent = String(coins);
    this.el.completeDetail.textContent = `crowd ${crowd} x multiplier ${Number(mult).toFixed(1)}`;
    const fill = this.el.complete.querySelector('.skin-progress-fill');
    if (fill) fill.style.width = `${skinProgress}%`;
    if (this.el.completeSkinText) this.el.completeSkinText.textContent = `${skinProgress}%`;
    const dbl = document.querySelector('#btn-double');
    if (dbl) dbl.disabled = false;
  }

  markBonusTaken() {
    const dbl = document.querySelector('#btn-double');
    if (dbl) {
      dbl.disabled = true;
      dbl.textContent = 'BONUS TAKEN';
    }
  }

  resetBonusButton() {
    const dbl = document.querySelector('#btn-double');
    if (dbl) {
      dbl.disabled = false;
      dbl.innerHTML = '+35% <span class="play-badge">&#9654;</span>';
    }
  }

  showFail(reason) {
    this.hideAll();
    this.el.hud.classList.add('hidden');
    this.el.fail.classList.remove('hidden');
    if (this.el.failDetail) this.el.failDetail.textContent = reason;
  }

  // ------------------------------------------------------------- skins
  showSkins(onPick) {
    this.hideAll();
    this.el.skins.classList.remove('hidden');
    this.renderSkins(onPick);
    this.refreshStats();
  }

  renderSkins(onPick) {
    const grid = this.el.skinGrid;
    if (!grid) return;
    grid.innerHTML = '';
    const next = nextFreeSkin(save.unlocked);
    for (const skin of SKINS) {
      const owned = save.unlocked.includes(skin.id);
      const card = document.createElement('div');
      card.className = `skin-card${save.skin === skin.id ? ' selected' : ''}${owned ? '' : ' locked'}`;

      const swatch = document.createElement('div');
      swatch.className = 'skin-swatch';
      swatch.style.background = skin.color;
      card.appendChild(swatch);

      const name = document.createElement('div');
      name.textContent = skin.name;
      card.appendChild(name);

      const tag = document.createElement('div');
      tag.className = 'skin-cost';
      if (owned) tag.textContent = save.skin === skin.id ? 'EQUIPPED' : 'TAP TO WEAR';
      else if (skin.cost === 0) tag.textContent = next && next.id === skin.id ? 'FILL THE BAR' : 'LOCKED';
      else tag.innerHTML = `${skin.cost} <i class="coin-icon"></i>`;
      card.appendChild(tag);

      card.addEventListener('click', () => {
        audio.unlock();
        if (owned) {
          save.skin = skin.id;
          persist();
          audio.click();
        } else if (skin.cost > 0 && save.coins >= skin.cost) {
          save.coins -= skin.cost;
          save.unlocked.push(skin.id);
          save.skin = skin.id;
          persist();
          audio.coin(4);
        } else {
          audio.gateBad();
          return;
        }
        this.renderSkins(onPick);
        this.refreshStats();
        if (onPick) onPick(skinById(save.skin));
      });

      grid.appendChild(card);
    }
  }
}
