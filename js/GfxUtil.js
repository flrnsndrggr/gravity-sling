// Minimal procedural graphics helpers. No external assets.
// Usage: window.Gfx.ensureCircle(scene, key, radius, color, glow) etc.
(function(){
  const Gfx = {
    ensureCircle(scene, key, radius, color=0xffffff, glow=0) {
      if (scene.textures.exists(key)) return key;
      const size = (radius+glow)*2;
      const rt = scene.make.renderTexture({ width: size, height: size, add: false });
      const g = scene.add.graphics();
      g.clear();
      if (glow > 0) {
        for (let i=glow; i>0; i-=2) {
          const a = 0.02 + 0.18 * (i/glow);
          g.fillStyle(color, a);
          g.fillCircle(radius+glow, radius+glow, radius + i);
        }
      }
      g.fillStyle(color, 1.0);
      g.fillCircle(radius+glow, radius+glow, radius);
      rt.draw(g, 0, 0);
      g.destroy();
      rt.saveTexture(key);
      rt.destroy();
      return key;
    },
    drawStarfield(scene, key='starfield', w, h, count=120) {
      const W = w || scene.scale.width, H = h || scene.scale.height;
      if (!scene.textures.exists(key)) {
        const rt = scene.make.renderTexture({ width: W, height: H, add: false });
        const g = scene.add.graphics();
        g.clear();
        g.fillStyle(0x0b1020, 1.0); g.fillRect(0,0,W,H);
        for (let i=0;i<count;i++) {
          const x = Math.random()*W, y = Math.random()*H;
          const s = Math.random()<0.85 ? 1 : 2;
          const c = Math.random()<0.7 ? 0xffffff : 0xaad4ff;
          g.fillStyle(c, Phaser.Math.Between(60, 200)/255);
          g.fillCircle(x, y, s);
        }
        rt.draw(g, 0, 0);
        g.destroy();
        rt.saveTexture(key); rt.destroy();
      }
      const img = scene.add.image(0,0,key).setOrigin(0).setDepth(-20);
      img.setScrollFactor(0.2); // subtle parallax
      return img;
    }
  };
  window.Gfx = Gfx;
})();
