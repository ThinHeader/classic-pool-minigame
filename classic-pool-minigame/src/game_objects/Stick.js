"use strict";

// 触屏操作方案（替代原版键盘 W/S 蓄力 + 鼠标点击击球）：
//   按住并拖动 = 瞄准（球杆指向手指方向），拖得越远力度越大（模拟拉杆）
//   松手     = 击球（拖动距离过小视为误触，自动取消）
// AI 回合的击球仍走 Stick.shoot()，与原版一致。

function Stick(position) {
    this.position = position;
    this.origin = new Vector2(970, 11);
    this.shotOrigin = new Vector2(950, 11);
    this.shooting = false;
    this.visible = true;
    this.rotation = 0;
    this.power = 0;
    this.trackMouse = true;
}

Stick.prototype.handleInput = function (delta) {

    if (AI_ON && Game.policy.turn === AI_PLAYER_NUM)
        return;

    // 联机：只有轮到自己才能操作
    if (NET_ON && Game.policy.turn !== NET_SEAT)
        return;

    if (Game.policy.turnPlayed)
        return;

    // 自由球摆放阶段：拖动是「搬白球」，绝不能被当成拉杆蓄力
    if (Game.gameWorld && Game.gameWorld.freeBall && Game.gameWorld.freeBall.active) {
        this.power = 0;
        this.origin = new Vector2(970, 11);
        return;
    }

    if (Mouse.left.down) {
        if (this.trackMouse) {
            // 拖动瞄准 + 拉杆蓄力
            var opposite = Mouse.position.y - this.position.y;
            var adjacent = Mouse.position.x - this.position.x;
            this.rotation = Math.atan2(opposite, adjacent);

            var pull = Mouse.position.distanceFrom(this.position) - BALL_SIZE;
            this.power = Math.max(0, Math.min(75, pull / 4));
            this.origin = new Vector2(970 + this.power * 1.6, 11);
        }
    }
    else if (this.power > 0) {
        if (this.power < 5) {
            // 轻点误触：取消击球，球杆复位
            this.power = 0;
            this.origin = new Vector2(970, 11);
            return;
        }
        this.strike();
    }
};

Stick.prototype.strike = function () {
    if (Game.sound && SOUND_ON) {
        playSfx("Strike.wav", Math.min(this.power / 10, 1));
    }
    Game.policy.turnPlayed = true;
    this.shooting = true;
    this.origin = this.shotOrigin.copy();

    // 联机：本地先按同样参数开打（预测），同时把参数上报服务器裁决
    if (NET_ON && this.power > 0) {
        Net.sendShot(this.rotation, this.power);
    }

    Game.gameWorld.whiteBall.shoot(this.power, this.rotation);
    var stick = this;
    setTimeout(function () { stick.visible = false; }, 500);
    this.power = 0;
};

// AI 训练/出杆使用的接口，保持原签名
Stick.prototype.shoot = function (power, rotation) {
    this.power = power;
    this.rotation = rotation;
    this.strike();
};

Stick.prototype.update = function () {
    if (this.shooting && !Game.gameWorld.whiteBall.moving)
        this.reset();
};

Stick.prototype.reset = function () {
    this.position.x = Game.gameWorld.whiteBall.position.x;
    this.position.y = Game.gameWorld.whiteBall.position.y;
    this.origin = new Vector2(970, 11);
    this.shooting = false;
    this.visible = true;
    this.power = 0;
};

Stick.prototype.draw = function () {
    if (!this.visible)
        return;
    Canvas2D.drawImage(sprites.stick, this.position, this.rotation, 1, this.origin);
};

GameGlobal.Stick = Stick;
