"use strict";

// 标准 8 球外观：
//   1-7  实心球（黄/蓝/红/紫/橙/绿/栗）
//   9-15 花色球（白底 + 同色横带）
//   8    黑色球
//   0    白球（母球）
// 说明：color 字段仍用于规则判定（两组球 + 黑球 + 白球），
//      球面颜色由 number 推导，二者互不影响。

// 1-7 对应的球面色（与花色球 9-15 共用）
var BALL_PALETTE = [
    "#F2C200", // 1 黄
    "#0F52BA", // 2 蓝
    "#D62828", // 3 红
    "#6A2C91", // 4 紫
    "#EE7B1E", // 5 橙
    "#1E7A3C", // 6 绿
    "#7B1E28"  // 7 栗
];

// 视觉半径：与物理半径（BALL_SIZE / 2 = 19）一致，球堆才不会视觉重叠
var BALL_VISUAL_RADIUS = 19;

function Ball(initPos, color, number) {
    this.initPos = initPos;
    this.position = initPos.copy();
    // 碰撞盒半径：与 BALL_SIZE(38) 一致，视觉与物理同步
    this.origin = new Vector2(BALL_SIZE / 2, BALL_SIZE / 2);
    this.velocity = Vector2.zero;
    this.color = color;
    this.number = number || 0;
    this.moving = false;
    this.visible = true;
    this.inHole = false;
}

// 是否花色球（9-15）
Ball.prototype.isStripe = function () {
    return this.number > 8;
};

// 球面色（不含白圈与号码）
Ball.prototype.faceColor = function () {
    if (this.number === 0) {
        return "#FFFFFF";
    }
    if (this.number === 8) {
        return "#101010";
    }
    var n = this.number > 8 ? this.number - 8 : this.number;
    return BALL_PALETTE[(n - 1) % BALL_PALETTE.length];
};

Ball.prototype.shoot = function (power, angle) {
    if (power <= 0)
        return;

    this.moving = true;

    this.velocity = calculateBallVelocity(power, angle);
};

var calculateBallVelocity = function (power, angle) {

    return new Vector2(100 * Math.cos(angle) * power, 100 * Math.sin(angle) * power);
};

Ball.prototype.update = function (delta) {

    this.updatePosition(delta);

    this.velocity.multiplyWith(0.98);

    if (this.moving && Math.abs(this.velocity.x) < 1 && Math.abs(this.velocity.y) < 1) {
        this.stop();
    }
};

Ball.prototype.updatePosition = function (delta) {

    if (!this.moving || this.inHole)
        return;
    var ball = this;
    var newPos = this.position.add(this.velocity.multiply(delta));


    if (Game.policy.isInsideHole(newPos)) {
        if (Game.sound && SOUND_ON) {
            playSfx("Hole.wav", 0.5);
        }
        this.position = newPos;
        this.inHole = true;
        setTimeout(function () { ball.visible = false; ball.velocity = Vector2.zero; }, 100);
        Game.policy.handleBallInHole(this);
        return;
    }

    var collision = this.handleCollision(newPos);

    if (collision) {
        this.velocity.multiplyWith(0.95);
    } else {
        this.position = newPos;
    }
};

Ball.prototype.handleCollision = function (newPos) {

    var collision = false;

    if (Game.policy.isXOutsideLeftBorder(newPos, this.origin)) {
        this.velocity.x = -this.velocity.x;
        this.position.x = Game.policy.leftBorderX + this.origin.x;
        collision = true;
    }
    else if (Game.policy.isXOutsideRightBorder(newPos, this.origin)) {
        this.velocity.x = -this.velocity.x;
        this.position.x = Game.policy.rightBorderX - this.origin.x;
        collision = true;
    }

    if (Game.policy.isYOutsideTopBorder(newPos, this.origin)) {
        this.velocity.y = -this.velocity.y;
        this.position.y = Game.policy.topBorderY + this.origin.y;
        collision = true;
    }
    else if (Game.policy.isYOutsideBottomBorder(newPos, this.origin)) {
        this.velocity.y = -this.velocity.y;
        this.position.y = Game.policy.bottomBorderY - this.origin.y;
        collision = true;
    }

    return collision;
};

Ball.prototype.stop = function () {

    this.moving = false;
    this.velocity = Vector2.zero;
};

Ball.prototype.reset = function () {
    this.inHole = false;
    this.moving = false;
    this.velocity = Vector2.zero;
    this.position = this.initPos.copy();
    this.visible = true;
};

Ball.prototype.out = function () {

    this.position = new Vector2(0, 900);
    this.visible = false;
    this.inHole = true;

};

Ball.prototype.draw = function () {
    if (!this.visible)
        return;

    Canvas2D.drawPoolBall(
        this.position,
        BALL_VISUAL_RADIUS,
        this.faceColor(),
        this.isStripe(),
        this.number
    );
};

GameGlobal.Ball = Ball;
GameGlobal.BALL_VISUAL_RADIUS = BALL_VISUAL_RADIUS;
