/* global Phaser, LevelManager, Progress */
class LevelSelectScene extends Phaser.Scene {
  constructor(){ super('LevelSelectScene'); }
  create(){
    const W = this.scale.width, H = this.scale.height;
    this.add.text(W/2, 40, 'Select Level', { fontSize: 24, color: '#d7e1ff' }).setOrigin(0.5, 0);
    const items = LevelManager.list();
    const PER_PAGE = 20;
    const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
    this.page = 0;
    this.rows = [];
    const renderPage = () => {
      this.rows.forEach(r => r.destroy()); this.rows = [];
      const start = this.page * PER_PAGE;
      const end = Math.min(items.length, start + PER_PAGE);
      for (let i=start; i<end; i++) {
        const idx = i - start;
        const y = 100 + idx * 30;
        const l = items[i];
        let stars = 0;
        try { stars = (window.Progress && Progress.get) ? (Progress.get(l.id)?.stars || 0) : 0; } catch(e) {}
        const starStr = ' [' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + ']';
        const label = `${l.id}. ${l.name}${starStr}`.trim();
        const color = stars > 0 ? '#cfe3ff' : '#9fb7ff';
        const t = this.add.text(W/2, y, label, { fontSize: 16, color })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        t.on('pointerup', () => { LevelManager.setCurrentById(l.id); this.scene.start('PlayScene'); });
        this.rows.push(t);
      }
      pageTxt.setText(`Page ${this.page+1}/${pages}`);
      prev.setAlpha(this.page>0?1:0.5);
      next.setAlpha(this.page<pages-1?1:0.5);
    };

    const back = this.add.text(16, H - 28, 'Back', { fontSize: 16, color: '#a3c2ff' })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    back.on('pointerup', () => this.scene.start('MenuScene'));

    const prev = this.add.text(W/2 - 80, H - 36, '◀ Prev', { fontSize: 16, color: '#a3c2ff' })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    const next = this.add.text(W/2 + 80, H - 36, 'Next ▶', { fontSize: 16, color: '#a3c2ff' })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    const pageTxt = this.add.text(W/2, H - 36, '', { fontSize: 14, color: '#cfe3ff' }).setOrigin(0.5).setScrollFactor(0);
    prev.on('pointerup', () => { if (this.page>0){ this.page--; renderPage(); } });
    next.on('pointerup', () => { if (this.page<pages-1){ this.page++; renderPage(); } });

    renderPage();
  }
}
