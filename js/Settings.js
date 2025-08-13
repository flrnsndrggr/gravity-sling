(function(){
  const KEY = 'gravity_sling_settings_v1';
  const defaults = { volume: 0.8, ambient: true, vfxQuality: 'high', reduceMotion: false };
  let state = { ...defaults };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...defaults, ...JSON.parse(raw) };
  } catch(e) {}
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){} }
  function get(k){ return state[k]; }
  function set(k,v){ state[k]=v; save(); return v; }
  function applyAudio(){
    if (window.Sfx && Sfx.setVolume) Sfx.setVolume(state.volume ?? defaults.volume);
    if (window.Sfx && Sfx.setMuted) Sfx.setMuted(false);
    if (window.Sfx && Sfx.ambientMute) Sfx.ambientMute(!(state.ambient ?? defaults.ambient));
  }
  window.Settings = { get, set, applyAudio, defaults };
})();
