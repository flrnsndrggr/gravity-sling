/* global fetch */
const LevelManager = (function(){
  let levels = [];
  let currentLevelIndex = 0;

  async function loadLevels(url = 'levels/levels.json') {
    const res = await fetch(url);
    const data = await res.json();
    levels = data.levels || [];
    currentLevelIndex = 0;
  }

  function list() { return levels.map(l => ({ id: l.id, name: l.name })); }
  function setCurrentById(id) {
    const idx = levels.findIndex(l => l.id === id);
    if (idx >= 0) currentLevelIndex = idx;
  }
  function getCurrent() { return levels[currentLevelIndex]; }
  function getByIndex(idx) { return levels[idx]; }
  function hasNext() { return currentLevelIndex < levels.length - 1; }
  function next() { if (hasNext()) currentLevelIndex += 1; return getCurrent(); }

  return { loadLevels, list, setCurrentById, getCurrent, getByIndex, hasNext, next };
})();
