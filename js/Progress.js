(function(){
  const KEY = 'gravity_sling_progress_v1';
  let state = { levels: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { levels: {}, ...JSON.parse(raw) };
  } catch(e) {}
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){} }
  function get(levelId){ return state.levels[levelId] || null; }
  function setResult(levelId, result){
    // result: { score, stars, timeSec, fuel }
    const prev = state.levels[levelId] || { score: 0, stars: 0 };
    const best = {
      score: Math.max(prev.score||0, result.score||0),
      stars: Math.max(prev.stars||0, result.stars||0),
      timeSec: (prev.score > (result.score||0)) ? prev.timeSec : result.timeSec,
      fuel: (prev.score > (result.score||0)) ? prev.fuel : result.fuel,
      completed: true,
      updatedAt: Date.now()
    };
    state.levels[levelId] = best; save(); return best;
  }
  function reset(){ state = { levels: {} }; save(); }
  window.Progress = { get, setResult, reset };
})();
