"use strict";

// 原版用 new Audio(...) 加载音效，微信小游戏改用 Sound.js 适配层。
// 资源全部位于 pkgAssets 分包，路径前缀 pkgAssets/assets/。
// 未使用的音效（BallsCollide-old1.wav / Side.*）已剔除以减小包体。

var sprites = {};
var sounds = {};

Game.loadAssets = function () {
    var loadSprite = function (sprite) {
        return Game.loadSprite("pkgAssets/assets/sprites/" + sprite);
    };

    sprites.mainMenuBackground = loadSprite("main_menu_background.png");
    sprites.background = loadSprite("spr_background4.png");
    // 球体已改为 Canvas 程序化绘制（花色 + 球号），不再加载球的贴图
    sprites.stick = loadSprite("spr_stick.png");
    sprites.twoPlayersButton = loadSprite("2_players_button.png");
    sprites.twoPlayersButtonHover = loadSprite("2_players_button_hover.png");
    sprites.onePlayersButton = loadSprite("1_player_button.png");
    sprites.onePlayersButtonHover = loadSprite("1_player_button_hover.png");
    sprites.muteButton = loadSprite("mute_button.png");
    sprites.muteButtonHover = loadSprite("mute_button_hover.png");
    sprites.muteButtonPressed = loadSprite("mute_button_pressed.png");
    sprites.muteButtonPressedHover = loadSprite("mute_button_pressed_hover.png");
    sprites.easyButton = loadSprite("easy_button.png");
    sprites.easyButtonHover = loadSprite("easy_button_hover.png");
    sprites.mediumButton = loadSprite("medium_button.png");
    sprites.mediumButtonHover = loadSprite("medium_button_hover.png");
    sprites.hardButton = loadSprite("hard_button.png");
    sprites.hardButtonHover = loadSprite("hard_button_hover.png");
    sprites.backButton = loadSprite("back_button.png");
    sprites.backButtonHover = loadSprite("back_button_hover.png");
    sprites.continueButton = loadSprite("continue_button.png");
    sprites.continueButtonHover = loadSprite("continue_button_hover.png");
    sprites.insaneButton = loadSprite("insane_button.png");
    sprites.insaneButtonHover = loadSprite("insane_button_hover.png");
    sprites.aboutButton = loadSprite("about_button.png");
    sprites.aboutButtonHover = loadSprite("about_button_hover.png");
    sprites.controls = loadSprite("controls.png");

    // Bossa Antigua - Kevin MacLeod (incompetech.com)
    // Licensed under Creative Commons: By Attribution 3.0 License
    // http://creativecommons.org/licenses/by/3.0/
    sounds.jazzTune = loadMusic("bossa.mp3");

    // 音效文件名供 playSfx() 使用（运行时按需创建 InnerAudioContext）
    Game.sfx = {
        ballsCollide: "BallsCollide.wav",
        strike: "Strike.wav",
        hole: "Hole.wav"
    };
};

sounds.fadeOut = function (sound) {
    var fadeAudio = setInterval(function () {
        if (GAME_STOPPED)
            return;

        // Only fade if past the fade out point or not at zero already
        if ((sound.volume >= 0.05)) {
            sound.volume -= 0.05;
        }
        else {
            sound.pause();
            clearInterval(fadeAudio);
        }
    }, 400);
};

GameGlobal.sprites = sprites;
GameGlobal.sounds = sounds;
