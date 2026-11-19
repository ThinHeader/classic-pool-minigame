
// 原版 Menu.js，仅调整：
//   1) 移除 audio.currentTime / canvas cursor 等 DOM API
//   2) 背景音乐为 InnerAudioContext（Sound.js 创建，loop 循环）

function Menu() {

}

Menu.prototype.init = function
(
    backgroundSprite,
    labels,
    buttons,
    sound
) {
    this.background = backgroundSprite;
    this.labels = labels || [];
    this.buttons = buttons || [];
    this.sound = sound ? sound : undefined;

    this.active = false;
}

Menu.prototype.load = function () {
    this.active = true;

    // 进菜单前清掉残留点击：否则上一次对局里的触摸会在菜单上误触发按钮
    if (Mouse.clearTaps) {
        Mouse.clearTaps();
    }

    requestAnimationFrame(this.menuLoop.bind(this));
    if (SOUND_ON && this.sound) {
        this.sound.volume = 0.8;
    }

    if (this.sound && this.sound.play) {
        this.sound.play();
    }

    // 菜单页展示 Banner 广告（未配置广告位 ID 时自动跳过）
    Ad.showBanner();
}

Menu.prototype.draw = function () {

    Canvas2D.drawImage(
        this.background,
        Vector2.zero,
        0,
        1,
        Vector2.zero
    );


    for (let i = 0; i < this.labels.length; i++) {
        this.labels[i].draw();
    }

    for (let i = 0; i < this.buttons.length; i++) {
        this.buttons[i].draw();
    }

    // 昵称面板浮在菜单之上
    if (typeof NickPanel !== "undefined") {
        NickPanel.draw();
    }
}

// 点击判定走「事件队列」而不是每帧读 pressed：
// 手机上 rAF 偶尔会掉帧或暂停，若某次按下恰好落在两帧之间，pressed 已被 reset 清掉，
// 就会表现为「按钮看得到但点不动」。队列只要命中就一定能被处理。
Menu.prototype.handleInput = function () {

    var tap = Mouse.consumeTap ? Mouse.consumeTap() : null;
    if (!tap) {
        return;
    }

    // 昵称面板打开时由面板独占输入
    if (typeof NickPanel !== "undefined" && NickPanel.active) {
        Mouse.clearTaps();
        NickPanel.handleTap(tap);
        return;
    }

    // 点在空白处也要清掉，避免旧点击堆积后进新菜单立刻误触发
    Mouse.clearTaps();

    for (var i = 0; i < this.buttons.length; i++) {
        var button = this.buttons[i];
        if (button && button.hitTest && button.hitTest(tap)) {
            button.callback();
            return;
        }
    }
};

Menu.prototype.menuLoop = function () {

    if (this.active) {
        try {
            this.handleInput();
            Canvas2D.clear();
            this.draw();
            // 诊断层可能未加载（例如裁包时移除），这里不能让它把菜单循环带崩
            if (typeof Diag !== "undefined") {
                Diag.tick();
                // 菜单循环正常出帧同样说明「循环是活的」，重启退避归零
                if (Game && Game._restartCount) {
                    Game._restartCount = 0;
                }
                Diag.draw();
            }
        } catch (e) {
            if (typeof Diag !== "undefined") {
                Diag.log("菜单绘制异常: " + (e && e.message));
            } else {
                console.error("[Classic Pool] 菜单绘制异常", e);
            }
        }
        Mouse.reset();
        requestAnimationFrame(this.menuLoop.bind(this));
    }

}

GameGlobal.Menu = Menu;
