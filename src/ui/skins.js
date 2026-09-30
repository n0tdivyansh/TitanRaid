/** Unlockable crowd colours. Free ones unlock as the skin bar fills. */
export const SKINS = [
  { id: 'azure', name: 'Azure', color: '#3b9dff', cost: 0, unlockAt: 0 },
  { id: 'mint', name: 'Mint', color: '#35d9a6', cost: 0, unlockAt: 100 },
  { id: 'coral', name: 'Coral', color: '#ff6b6b', cost: 250, unlockAt: -1 },
  { id: 'sunset', name: 'Sunset', color: '#ff9f43', cost: 400, unlockAt: -1 },
  { id: 'violet', name: 'Violet', color: '#a55eea', cost: 600, unlockAt: -1 },
  { id: 'lime', name: 'Lime', color: '#a3e635', cost: 800, unlockAt: -1 },
  { id: 'ice', name: 'Ice', color: '#dbeafe', cost: 1100, unlockAt: -1 },
  { id: 'gold', name: 'Gold', color: '#ffc531', cost: 1500, unlockAt: -1 },
  { id: 'ink', name: 'Ink', color: '#37474f', cost: 2000, unlockAt: -1 },
  { id: 'rose', name: 'Rose', color: '#ff8fc8', cost: 2600, unlockAt: -1 },
  { id: 'cyber', name: 'Cyber', color: '#00e5ff', cost: 3400, unlockAt: -1 },
  { id: 'magma', name: 'Magma', color: '#ff3d3d', cost: 4500, unlockAt: -1 },
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

/** The next skin that the free progress bar will hand out. */
export function nextFreeSkin(unlocked) {
  return SKINS.find((s) => s.cost === 0 && !unlocked.includes(s.id)) || SKINS.find((s) => !unlocked.includes(s.id)) || null;
}
