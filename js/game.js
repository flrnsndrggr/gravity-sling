(function(){
  const config = {
    type: Phaser.AUTO,
    backgroundColor: '#03050b',
    scale: {
      mode: Phaser.Scale.RESIZE,
      parent: 'game-root',
      width: '100%',
      height: '100%'
    },
    physics: {
      default: 'matter',
      matter: {
        gravity: { y: 0 },
        enableSleeping: false,
        // debug: true,
      }
    },
    scene: []
  };

  const game = new Phaser.Game(config);

  // Register scenes and start boot
  window.addEventListener('load', () => {
    game.scene.add('BootScene', BootScene, false);
    game.scene.add('MenuScene', MenuScene, false);
    game.scene.add('LevelSelectScene', LevelSelectScene, false);
    game.scene.add('PlayScene', PlayScene, false);
    game.scene.add('WinScene', WinScene, false);
    game.scene.add('LoseScene', LoseScene, false);
    game.scene.start('BootScene');
  });
})();
