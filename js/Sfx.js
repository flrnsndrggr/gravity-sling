// Simple synthesized SFX using WebAudio, now with master volume, ambient loop, and slight variation.
// Usage: window.Sfx.play('launch'); Sfx.setVolume(0.8); Sfx.ambientStart();
(function(){
  class Sfx {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this._ensureContext = this._ensureContext.bind(this);
      this._unlockHandler = this._unlockHandler.bind(this);
      // routing
      this._master = null;   // master gain
      this._sfxGain = null;  // SFX gain (excludes ambient)
      // ambient
      this._ambientGain = null;
      this._ambientOsc1 = null;
      this._ambientOsc2 = null;
      this._ambientNoise = null;
      this._ambientOn = false;
      this._muted = false;
      this._volume = 1.0;
      if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', this._unlockHandler, { once: true });
        window.addEventListener('keydown', this._unlockHandler, { once: true });
      }
    }
    _unlockHandler() {
      this._ensureContext();
    }
    _ensureContext() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return null; }
      this.ctx = new AC();
      // build routing: master -> destination; sfx -> master; ambient -> master
      this._master = this.ctx.createGain();
      this._master.gain.setValueAtTime(this._volume, this.ctx.currentTime);
      this._master.connect(this.ctx.destination);
      this._sfxGain = this.ctx.createGain();
      this._sfxGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this._sfxGain.connect(this._master);
      return this.ctx;
    }
    play(type) {
      if (!this.enabled) return;
      if (this._muted) return;
      switch(type){
        case 'launch': return this._whoosh();
        case 'burn': return this._blip(420 * this._var(0.96,1.06), 0.07, 'sawtooth', 0.001, 0.05);
        case 'win': return this._jingle();
        case 'fail': return this._buzz();
        case 'hit': return this._thud();
        case 'pickup': return this._pickup();
      }
    }
    setVolume(vol=1.0) {
      this._volume = Math.max(0, Math.min(1, vol));
      const ctx = this._ensureContext(); if (!ctx || !this._master) return;
      this._master.gain.setTargetAtTime(this._volume, ctx.currentTime, 0.02);
    }
    setMuted(m) {
      this._muted = !!m;
    }
    ambientStart() {
      const ctx = this._ensureContext(); if (!ctx) return;
      if (this._ambientOn) return;
      // gentle dual-oscillator drone + filtered noise
      this._ambientGain = ctx.createGain();
      this._ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this._ambientGain.connect(this._master);
      // tone bed
      this._ambientOsc1 = ctx.createOscillator(); this._ambientOsc1.type = 'sine'; this._ambientOsc1.frequency.setValueAtTime(62, ctx.currentTime);
      this._ambientOsc2 = ctx.createOscillator(); this._ambientOsc2.type = 'sine'; this._ambientOsc2.frequency.setValueAtTime(93, ctx.currentTime);
      const detuneLFO = ctx.createOscillator(); detuneLFO.type = 'sine'; detuneLFO.frequency.value = 0.06;
      const detuneGain = ctx.createGain(); detuneGain.gain.value = 4; // cents
      detuneLFO.connect(detuneGain); detuneGain.connect(this._ambientOsc2.detune);
      // space noise
      const noiseBuf = this._noiseBuffer(1.5);
      this._ambientNoise = ctx.createBufferSource(); this._ambientNoise.buffer = noiseBuf; this._ambientNoise.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.08;
      this._ambientNoise.connect(lp); lp.connect(noiseGain); noiseGain.connect(this._ambientGain);
      this._ambientOsc1.connect(this._ambientGain);
      this._ambientOsc2.connect(this._ambientGain);
      this._ambientOsc1.start(); this._ambientOsc2.start(); detuneLFO.start();
      this._ambientNoise.start();
      this._ambientOn = true;
      // fade in
      this._ambientGain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.8);
    }
    ambientStop() {
      if (!this._ambientOn || !this.ctx) return;
      const t = this.ctx.currentTime;
      try { this._ambientGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); } catch(e){}
      const stopAt = t + 0.5;
      try { this._ambientOsc1.stop(stopAt); this._ambientOsc2.stop(stopAt); this._ambientNoise.stop(stopAt); } catch(e){}
      this._ambientOn = false;
    }
    ambientMute(mute) {
      if (!this._ambientGain) return;
      const t = this.ctx ? this.ctx.currentTime : 0;
      const target = mute ? 0.0001 : 0.18;
      try { this._ambientGain.gain.setTargetAtTime(target, t, 0.05); } catch(e){}
    }
    _gainEnv(node, t0, a=0.005, d=0.15) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
      node.connect(g); g.connect(this.ctx.destination);
      return g;
    }
    _blip(freq=440, dur=0.1, type='sine', attack=0.005, decay=0.1) {
      const ctx = this._ensureContext(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = type; osc.frequency.setValueAtTime(freq, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      osc.connect(g); g.connect(this._sfxGain || ctx.destination);
      osc.start(t0); osc.stop(t0 + attack + decay + 0.02);
    }
    _whoosh() {
      const ctx = this._ensureContext(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const noise = this._noiseBuffer(0.4);
      const src = ctx.createBufferSource(); src.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(500 * this._var(0.85,1.15), t0);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      src.connect(bp); bp.connect(g); g.connect(this._sfxGain || ctx.destination);
      src.start(t0); src.stop(t0 + 0.4);
      // click layer
      this._blip(220 * this._var(0.9,1.1), 0.03, 'square', 0.001, 0.04);
    }
    _buzz() {
      const ctx = this._ensureContext(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator(); osc.type = 'square';
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      osc.frequency.setValueAtTime(120, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(g); g.connect(this._sfxGain || ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.55);
    }
    _thud() {
      const ctx = this._ensureContext(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator(); osc.type = 'sine';
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.2);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(g); g.connect(this._sfxGain || ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.3);
      // noise pop
      const n = this._noiseBuffer(0.08); const ns = ctx.createBufferSource(); ns.buffer = n;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.2, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      ns.connect(ng); ng.connect(this._sfxGain || ctx.destination); ns.start(t0); ns.stop(t0+0.12);
    }
    _jingle() {
      const ctx = this._ensureContext(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((f,i)=>{
        const dt = i * 0.08;
        const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(f, t0 + dt);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
        osc.connect(g); g.connect(this._sfxGain || ctx.destination);
        osc.start(t0 + dt); osc.stop(t0 + dt + 0.22);
      });
    }
    _pickup() {
      const ctx = this._ensureContext(); if (!ctx) return;
      const freqs = [880, 1174.7, 1567.98]; // A5, D6, G6
      freqs.forEach((f,i)=>this._blip(f * this._var(0.97,1.03), 0.08, 'triangle', 0.003, 0.08));
    }
    _noiseBuffer(seconds=0.4) {
      const ctx = this._ensureContext(); if (!ctx) return null;
      const len = seconds * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<len;i++) data[i] = (Math.random()*2-1) * (1 - i/len);
      return buffer;
    }
    _var(a=0.95,b=1.05){ return a + (b-a) * Math.random(); }
  }
  window.Sfx = new Sfx();
})();
