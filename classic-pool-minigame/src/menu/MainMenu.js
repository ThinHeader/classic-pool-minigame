
// 汉化版主菜单：原版按钮为英文图片素材，现改用 Canvas 中文文字按钮；
// 新增「看广告重新开局」激励视频按钮；静音按钮保留图标素材。

function generateMainMenuLabels(headerText) {

    let labels = [

        new Label(
            headerText,
            new Vector2(100, 0),
            Vector2.zero,
            "white",
            "left",
            "sans-serif",
            "100px"
        ),
        new Label(
            "© 2018 Chen Shmilovich",
            new Vector2(1250, 700),
            Vector2.zero,
            "white",
            "left",
            "sans-serif",
            "20px"
        ),
        new Label(
            "Music: Bossa Antigua - Kevin MacLeod (CC BY 3.0)",
            new Vector2(1250, 740),
            Vector2.zero,
            "white",
            "left",
            "sans-serif",
            "16px"
        )
    ];


    return labels;
}


// 从暂停菜单 / 主菜单进入对局
function startMatch() {
    Game.mainMenu.active = false;
    GAME_STOPPED = false;
    setTimeout(Game.startNewGame, 200);
    sounds.fadeOut(Game.mainMenu.sound);
}

function generateMainMenuButtons(inGame) {

    let buttons = [];

    let dev = 0;

    if (inGame) {
        buttons.push(
            new TextButton
            (
                // 继续对局
                "继续对局",
                new Vector2(200, 120),
                function () {
                    Game.mainMenu.active = false;
                    GAME_STOPPED = false;
                    setTimeout(Game.continueGame, 200);
                    sounds.fadeOut(Game.mainMenu.sound);
                }
            ),
            new TextButton
            (
                // 激励视频：完整观看后重开一局
                "看广告重新开局",
                new Vector2(200, 260),
                function () {
                    Ad.showRewardedVideo(
                        function () {
                            // 发奖：重摆棋盘、清空比分并返回对局
                            Game.policy.reset();
                            Game.gameWorld.reset();
                            Game.mainMenu.active = false;
                            GAME_STOPPED = false;
                            setTimeout(Game.continueGame, 200);
                            sounds.fadeOut(Game.mainMenu.sound);
                        },
                        function () {
                            // 未看完 / 广告加载失败：留在菜单，不发奖
                        }
                    );
                }
            ),
            new TextButton
            (
                // 双人对战
                "双人对战",
                new Vector2(200, 400),
                function () {
                    Net.leave();
                    AI_ON = false;
                    startMatch();
                }
            ),
            new TextButton
            (
                // 人机对战
                "人机对战",
                new Vector2(200, 540),
                function () {
                    Net.leave();
                    Game.mainMenu.labels = generateMainMenuLabels("选择难度");
                    Mouse.reset();
                    Game.mainMenu.buttons = generateDifficultyButtons(muteButtonFactory());
                }
            ),
            new TextButton
            (
                // 好友对战（联机）
                "好友对战",
                new Vector2(200, 680),
                function () {
                    Lobby.open();
                }
            )
        );
    } else {
        buttons.push(
            new TextButton
            (
                // 双人对战
                "双人对战",
                new Vector2(200, 250),
                function () {
                    Net.leave();
                    AI_ON = false;
                    startMatch();
                }
            ),
            new TextButton
            (
                // 人机对战
                "人机对战",
                new Vector2(200, 400),
                function () {
                    Net.leave();
                    Game.mainMenu.labels = generateMainMenuLabels("选择难度");
                    Mouse.reset();
                    Game.mainMenu.buttons = generateDifficultyButtons(muteButtonFactory());
                }
            ),
            new TextButton
            (
                // 好友对战（联机）
                "好友对战",
                new Vector2(200, 550),
                function () {
                    Lobby.open();
                }
            ),
            new TextButton
            (
                // 昵称：联机时对方看到的名字，也用于对局中区分双方
                "我的昵称：" + Nick.get(),
                new Vector2(200, 700),
                function () {
                    NickPanel.open(function () {
                        Game.mainMenu.labels = generateMainMenuLabels("经典8球台球");
                        Game.mainMenu.buttons = generateMainMenuButtons(false);
                        Mouse.clearTaps();
                    });
                },
                new Vector2(520, 96),
                34
            )
        );
    }

    buttons.push(muteButtonFactory());
    return buttons;
}

// 静音按钮（图标素材，保留原逻辑）
function muteButtonFactory() {
    let muteSprite = sprites.muteButton;
    let muteSpriteHover = sprites.muteButtonHover;

    if (Game.mainMenu.sound && Game.mainMenu.sound.volume === 0) {
        muteSprite = sprites.muteButtonPressed;
        muteSpriteHover = sprites.muteButtonPressedHover;
    }

    return new Button
    (
        muteSprite,
        new Vector2(1430, 10),
        function () {
            if (Game.mainMenu.sound.volume == 0) {
                SOUND_ON = true;
                Game.mainMenu.sound.volume = 0.8;
                this.sprite = sprites.muteButton;
                this.hoverSprite = sprites.muteButtonHover;
            }
            else {
                SOUND_ON = false;
                Game.mainMenu.sound.volume = 0.0;
                this.sprite = sprites.muteButtonPressed;
                this.hoverSprite = sprites.muteButtonPressedHover;
            }
        },
        muteSpriteHover
    );
}

// 难度选择子菜单
function generateDifficultyButtons(muteButton) {

    let buttons = [
        new TextButton
        (
            "简单",
            new Vector2(200, 130),
            function () {
                AI_PLAYER_NUM = 1;
                AI_ON = true;
                TRAIN_ITER = 30;
                AI_LEVEL_NAME = "简单";
                startMatch();
            }
        ),
        new TextButton
        (
            "普通",
            new Vector2(200, 280),
            function () {
                AI_PLAYER_NUM = 1;
                AI_ON = true;
                TRAIN_ITER = 50;
                AI_LEVEL_NAME = "普通";
                startMatch();
            }
        ),
        new TextButton
        (
            "困难",
            new Vector2(200, 430),
            function () {
                AI_PLAYER_NUM = 1;
                AI_ON = true;
                TRAIN_ITER = 100;
                AI_LEVEL_NAME = "困难";
                startMatch();
            }
        ),
        new TextButton
        (
            "大师",
            new Vector2(200, 580),
            function () {
                AI_PLAYER_NUM = 0;
                AI_ON = true;
                TRAIN_ITER = 300;
                AI_LEVEL_NAME = "大师";
                startMatch();
            }
        ),
        new TextButton
        (
            "返回",
            new Vector2(700, 580),
            function () {
                Game.mainMenu.labels = generateMainMenuLabels("经典8球台球");
                Mouse.reset();
                Game.mainMenu.buttons = generateMainMenuButtons(false);
            },
            new Vector2(280, 110)
        ),
        muteButton
    ];

    return buttons;
}

GameGlobal.generateMainMenuLabels = generateMainMenuLabels;
GameGlobal.generateMainMenuButtons = generateMainMenuButtons;
GameGlobal.muteButtonFactory = muteButtonFactory;
GameGlobal.startMatch = startMatch;
