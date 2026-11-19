// 微信小游戏入口
// 1) 先加载资源分包（sprites + sounds，约 14MB，微信分包规则：主包 ≤4M、单个普通分包不限大小、总包 ≤30M）
// 2) 分包就绪后，按浏览器原版的脚本加载顺序 require 游戏模块
// 3) 调用 Game.start() 启动

wx.loadSubpackage({
    name: "pkgAssets",
    success: function () {
        startGame();
    },
    fail: function (err) {
        console.error("[Classic Pool] 资源分包加载失败，请重启小游戏", err);
    }
});

function startGame() {
    // 与原版 index.html 中 $LAB 的加载顺序保持一致（键盘输入模块在移动端已移除）
    require("./src/system/Color.js");
    require("./src/geom/Vector2.js");
    require("./src/input/ButtonState.js");
    require("./src/Global.js");
    // 诊断层必须最先就绪：Game.start 会调用 Diag.init()，Mouse 的触摸回调也会用 Diag.log
    require("./src/system/Diagnostics.js");
    require("./src/system/Sound.js");
    require("./src/system/Ad.js");
    require("./src/system/Nick.js");
    // 昵称面板依赖 Nick，必须在 Menu / MainMenu 之前加载（主菜单「我的昵称」按钮会调用）
    require("./src/system/NickPanel.js");
    require("./src/input/Mouse.js");
    require("./src/Canvas2D.js");
    require("./src/game_objects/Score.js");
    require("./src/game_objects/Ball.js");
    require("./src/game_objects/Stick.js");
    require("./src/menu/Label.js");
    require("./src/menu/Button.js");
    require("./src/menu/Menu.js");
    require("./src/menu/MainMenu.js");
    require("./src/net/Net.js");
    require("./src/net/Lobby.js");
    require("./src/AI/Opponent.js");
    require("./src/AI/AIPolicy.js");
    require("./src/AI/AITrainer.js");
    require("./src/game_objects/Player.js");
    require("./src/GamePolicy.js");
    require("./src/GameWorld.js");
    require("./src/Game.js");
    require("./src/Assets.js");

    Game.start();
}
