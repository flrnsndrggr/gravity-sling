/* global Phaser, LevelManager, Settings, Sfx */
class MenuScene extends Phaser.Scene {
  constructor(){ super('MenuScene'); }
  create(){
    const W = this.scale.width, H = this.scale.height;
    this.add.text(W/2, H*0.25, 'Gravity Sling', { fontSize: 36, color: '#d7e1ff' }).setOrigin(0.5);
    const start = this.add.text(W/2, H*0.5, 'Start', { fontSize: 24, color: '#a3c2ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const levels = this.add.text(W/2, H*0.6, 'Level Select', { fontSize: 20, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const settingsBtn = this.add.text(W/2, H*0.7, 'Settings', { fontSize: 18, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    start.on('pointerup', () => {
      // Start first level
      const all = LevelManager.list();
      if (all.length) LevelManager.setCurrentById(all[0].id);
      this.scene.start('PlayScene');
    });

    levels.on('pointerup', () => this.scene.start('LevelSelectScene'));

    // Settings overlay
    const cont = this.add.container(0,0).setDepth(50).setScrollFactor(0);
    const bg = this.add.rectangle(0,0,W,H,0x020615,0.85).setOrigin(0);
    const panel = this.add.rectangle(W/2, H/2, Math.min(420, W-40), 240, 0x0b1020, 1).setStrokeStyle(1, 0x203055, 1).setOrigin(0.5);
    const title = this.add.text(W/2, H/2-90, 'Settings', { fontSize: 24, color: '#cfe3ff' }).setOrigin(0.5);
    const volLbl = this.add.text(W/2-120, H/2-40, 'Volume', { fontSize: 16, color: '#a3c2ff' }).setOrigin(0,0.5);
    const volVal = this.add.text(W/2+60, H/2-40, '', { fontSize: 16, color: '#cfe3ff' }).setOrigin(1,0.5);
    const minus = this.add.text(W/2+70, H/2-40, '–', { fontSize: 22, color: '#ffd86b' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const plus = this.add.text(W/2+110, H/2-40, '+', { fontSize: 22, color: '#ffd86b' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const ambLbl = this.add.text(W/2-120, H/2, 'Ambient', { fontSize: 16, color: '#a3c2ff' }).setOrigin(0,0.5);
    const ambVal = this.add.text(W/2+60, H/2, '', { fontSize: 16, color: '#cfe3ff' }).setOrigin(1,0.5);
    const ambToggle = this.add.text(W/2+90, H/2, '[ toggle ]', { fontSize: 14, color: '#ffd86b' }).setOrigin(0,0.5).setInteractive({ useHandCursor: true });
    const vfxLbl = this.add.text(W/2-120, H/2+40, 'VFX Quality', { fontSize: 16, color: '#a3c2ff' }).setOrigin(0,0.5);
    const vfxHx = this.add.text(W/2+20, H/2+40, '[ High ]', { fontSize: 14, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const vfxMx = this.add.text(W/2+90, H/2+40, '[ Med ]', { fontSize: 14, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const vfxLx = this.add.text(W/2+150, H/2+40, '[ Low ]', { fontSize: 14, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const close = this.add.text(W/2, H/2+90, 'Close', { fontSize: 16, color: '#a3c2ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cont.add([bg,panel,title,volLbl,volVal,minus,plus,ambLbl,ambVal,ambToggle,vfxLbl,vfxHx,vfxMx,vfxLx,close]);
    cont.setVisible(false);

    const refresh = () => {
      const vol = Math.round(((window.Settings?.get('volume') ?? 0.8) * 100));
      volVal.setText(`${vol}%`);
      const amb = !!(window.Settings?.get('ambient') ?? true);
      ambVal.setText(amb ? 'On' : 'Off');
      const q = (window.Settings?.get('vfxQuality') ?? 'high');
      const sel = (btn, on)=> btn.setColor(on ? '#ffd86b' : '#9fb7ff');
      sel(vfxHx, q==='high'); sel(vfxMx, q==='med'); sel(vfxLx, q==='low');
    };
    const clamp01 = (v)=> Math.max(0, Math.min(1, v));
    const setVol = (v)=> { if (window.Settings) Settings.set('volume', clamp01(v)); if (window.Settings) Settings.applyAudio(); refresh(); if (window.Sfx) Sfx.play('pickup'); };
    const setAmb = (v)=> { if (window.Settings) Settings.set('ambient', !!v); if (window.Settings) Settings.applyAudio(); refresh(); };
    const setQ = (q)=> { if (window.Settings) Settings.set('vfxQuality', q); refresh(); };

    minus.on('pointerup', ()=> setVol((window.Settings?.get('volume') ?? 0.8) - 0.1));
    plus.on('pointerup', ()=> setVol((window.Settings?.get('volume') ?? 0.8) + 0.1));
    ambToggle.on('pointerup', ()=> setAmb(!(window.Settings?.get('ambient') ?? true)));
    vfxHx.on('pointerup', ()=> setQ('high'));
    vfxMx.on('pointerup', ()=> setQ('med'));
    vfxLx.on('pointerup', ()=> setQ('low'));
    close.on('pointerup', ()=> cont.setVisible(false));

    settingsBtn.on('pointerup', ()=> { refresh(); cont.setVisible(true); });
  }
}
