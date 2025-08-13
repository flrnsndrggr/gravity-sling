/* global Phaser, LevelManager */
class BootScene extends Phaser.Scene {
  constructor(){ super('BootScene'); }
  preload(){
    // Could show a loading bar here
  }
  async create(){
    try {
      await LevelManager.loadLevels('levels/levels.json');
      if (window.Settings && Settings.applyAudio) Settings.applyAudio();
      this.scene.start('MenuScene');
    } catch (e) {
      console.error('Failed to load levels', e);
      this.add.text(20, 20, 'Error loading levels', { color: '#ff9aa8' });
    }
  }
}
