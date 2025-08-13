/* global Phaser */
class LoseScene extends Phaser.Scene {
  constructor(){ super('LoseScene'); }
  create(data){
    const W = this.scale.width, H = this.scale.height;
    this.add.text(W/2, H*0.3, 'Mission Failed', { fontSize: 28, color: '#ff9aa8' }).setOrigin(0.5);
    this.add.text(W/2, H*0.45, data?.reason || 'Try again', { fontSize: 18, color: '#cfe3ff' }).setOrigin(0.5);
    const retry = this.add.text(W/2, H*0.6, 'Retry', { fontSize: 20, color: '#a3c2ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const menu = this.add.text(W/2, H*0.7, 'Menu', { fontSize: 16, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerup', () => this.scene.start('PlayScene'));
    menu.on('pointerup', () => this.scene.start('MenuScene'));
  }
}
