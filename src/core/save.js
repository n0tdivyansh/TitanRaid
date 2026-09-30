/**
 * Persistent player profile (CrazyGames SDK Data Module + localStorage).
 * Everything degrades gracefully when storage is unavailable.
 */
const KEY = 'swarm.slayer.save.v1';

const DEFAULTS = {
  v: 1,
  level: 1,
  coins: 0,
  bestCrowd: 0,
  skin: 'azure',
  unlocked: ['azure'],
  skinProgress: 0, // 0..100, +10 per level cleared
  sound: true,
  seenTutorial: false,
};

function sanitize(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
  const merged = { ...DEFAULTS, ...parsed };
  if (!Array.isArray(merged.unlocked) || merged.unlocked.length === 0) {
    merged.unlocked = ['azure'];
  }
  merged.level = Math.max(1, Math.floor(merged.level) || 1);
  merged.coins = Math.max(0, Math.floor(merged.coins) || 0);
  merged.bestCrowd = Math.max(0, Math.floor(merged.bestCrowd) || 0);
  merged.skinProgress = Math.min(100, Math.max(0, Math.floor(merged.skinProgress) || 0));
  return merged;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('ccl.save.v1');
    if (!raw) return { ...DEFAULTS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export const save = read();

export function persist() {
  const json = JSON.stringify(save);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* storage unavailable */
  }
  try {
    if (typeof window !== 'undefined' && window.CrazyGames?.SDK?.data?.setItem) {
      window.CrazyGames.SDK.data.setItem(KEY, json);
    }
  } catch {
    /* CrazyGames data module error */
  }
}

/** Called after CrazyGames SDK init to sync any cloud data */
export function syncCloudSave() {
  try {
    if (typeof window !== 'undefined' && window.CrazyGames?.SDK?.data?.getItem) {
      const raw = window.CrazyGames.SDK.data.getItem(KEY);
      if (raw) {
        const cloudData = sanitize(JSON.parse(raw));
        if (cloudData.level >= save.level) {
          Object.assign(save, cloudData);
          persist();
        }
      }
    }
  } catch {}
}

export function addCoins(n) {
  save.coins = Math.max(0, save.coins + Math.round(n));
  persist();
}

export function unlockSkin(id) {
  if (!save.unlocked.includes(id)) {
    save.unlocked.push(id);
    persist();
  }
}

export function resetProfile() {
  Object.assign(save, DEFAULTS, { unlocked: ['azure'] });
  persist();
}
