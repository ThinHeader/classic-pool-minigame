"use strict";

// 原版使用浏览器 Audio 对象，微信小游戏替换为 InnerAudioContext。
// 音效：每次播放创建独立实例（等价于原版 audio.cloneNode(true) 后播放，
// 保证多颗球同时碰撞时声音可叠加）。
function playSfx(soundFile, volume) {
    var ctx = wx.createInnerAudioContext();
    ctx.src = "pkgAssets/assets/sounds/" + soundFile;
    ctx.volume = Math.max(0, Math.min(1, volume || 1));
    ctx.autoplay = true;
    ctx.onEnded(function () { ctx.destroy(); });
    ctx.onError(function () { ctx.destroy(); });
}

// 背景音乐：单个长驻实例循环播放，Menu 中通过 volume 淡入淡出
function loadMusic(soundFile) {
    var ctx = wx.createInnerAudioContext();
    ctx.src = "pkgAssets/assets/sounds/" + soundFile;
    ctx.loop = true;
    ctx.volume = 0;
    return ctx;
}

GameGlobal.playSfx = playSfx;
GameGlobal.loadMusic = loadMusic;
