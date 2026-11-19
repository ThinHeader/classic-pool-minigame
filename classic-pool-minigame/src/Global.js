"use strict";

// 原版 script/Global.js 的常量与开关。
// 微信小游戏每个 js 文件是独立模块，跨文件共享的变量统一挂到 GameGlobal
// （GameGlobal 即小游戏的全局对象），其余模块即可用裸标识符直接读写。
GameGlobal.LOG = false;

GameGlobal.BALL_SIZE = 38;
GameGlobal.BORDER_SIZE = 57;
GameGlobal.HOLE_RADIUS = 46;

GameGlobal.DELTA = 1 / 100;

GameGlobal.DISPLAY = true;
GameGlobal.SOUND_ON = true;
GameGlobal.GAME_STOPPED = true;

GameGlobal.KEYBOARD_INPUT_ON = true;

GameGlobal.TRAIN_ITER = 100;
// AI 单杆训练的时间上限（毫秒）：低端机跑不满迭代数时按已找到的最优解出杆
GameGlobal.AI_TRAIN_MAX_MS = 8000;
GameGlobal.AI_ON = true;
GameGlobal.AI_PLAYER_NUM = 1;
GameGlobal.AI_LEVEL_NAME = "普通";   // 人机对战当前难度名，用于玩家牌显示
GameGlobal.DISPLAY_TRAINING = false;

// ---- 联机（好友对战）----
// 上线时改成你的房间服务地址（必须 wss:// 且域名已在小游戏后台配置为 socket 合法域名）
// 本地调试可临时改成 ws://127.0.0.1:3010/pool，并在开发者工具勾选「不校验合法域名」
GameGlobal.SERVER_URL = "wss://wandou.dongpouu.top/pool";
GameGlobal.NET_ON = false;   // 是否处于联机对局
GameGlobal.NET_SEAT = 0;     // 本地玩家座位号：0 / 1
