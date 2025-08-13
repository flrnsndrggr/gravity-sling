/* global Phaser, LevelManager, Gfx, Progress */
class WinScene extends Phaser.Scene {
  constructor(){ super('WinScene'); }
  create(data){
    const W = this.scale.width, H = this.scale.height;
    if (window.Gfx) Gfx.drawStarfield(this, 'starfieldWin', W, H, 180);
    this.add.text(W/2, H*0.25, 'Target Reached!', { fontSize: 28, color: '#d7f7a8' }).setOrigin(0.5);
    const fuelTxt = `Fuel: ${data?.fuel?.toFixed?.(1) ?? '--'}`;
    const timeTxt = (typeof data?.timeSec === 'number') ? `Time: ${data.timeSec}s` : '';
    const scoreTxt = (typeof data?.score === 'number') ? `Score: ${data.score}` : '';
    this.add.text(W/2, H*0.40, fuelTxt, { fontSize: 18, color: '#cfe3ff' }).setOrigin(0.5);
    if (timeTxt) this.add.text(W/2, H*0.48, timeTxt, { fontSize: 16, color: '#b8d1ff' }).setOrigin(0.5);
    if (scoreTxt) this.add.text(W/2, H*0.54, scoreTxt, { fontSize: 20, color: '#fff3a3' }).setOrigin(0.5);

    // Star rating based on score
    const score = data?.score ?? 0;
    let stars = 1;
    if (score >= 1200) stars = 3; else if (score >= 900) stars = 2; else stars = 1;
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.add.text(W/2, H*0.34, starStr, { fontSize: 26, color: '#ffd86b' }).setOrigin(0.5);

    // Save progress
    try {
      const lvl = LevelManager.getCurrent();
      const id = lvl?.id ?? null;
      if (id && window.Progress && Progress.setResult) {
        Progress.setResult(id, { score, stars, timeSec: data?.timeSec ?? 0, fuel: data?.fuel ?? 0 });
        this.add.text(W/2, H*0.62, 'Progress saved', { fontSize: 12, color: '#9fb7ff' }).setOrigin(0.5);
      }
    } catch(e) { /* ignore */ }

    const label = LevelManager.hasNext() ? 'Next Level' : 'Back to Menu';
    const next = this.add.text(W/2, H*0.68, label, { fontSize: 20, color: '#a3c2ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const menu = this.add.text(W/2, H*0.76, 'Menu', { fontSize: 16, color: '#9fb7ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    next.on('pointerup', () => {
      if (LevelManager.hasNext()) {
        LevelManager.next();
        this.scene.start('PlayScene');
      } else {
        this.scene.start('MenuScene');
      }
    });
    menu.on('pointerup', () => this.scene.start('MenuScene'));
  }
}
