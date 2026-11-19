"use strict";

function GameWorld() {

    this.whiteBallStartingPosition = new Vector2(413, 413);

    // 球号按标准 8 球摆位：顶点 1 号，黑 8 在三角中心，实心球 1-7 与花色球 9-15 交替。
    // color 只承担分组语义：yellow 组 = 实心球，red 组 = 花色球（规则判定不变）。
    this.redBalls = [
        new Ball(new Vector2(1056, 433), Color.red, 9),
        new Ball(new Vector2(1090, 374), Color.red, 10),
        new Ball(new Vector2(1126, 393), Color.red, 11),
        new Ball(new Vector2(1126, 472), Color.red, 12),
        new Ball(new Vector2(1162, 335), Color.red, 13),
        new Ball(new Vector2(1162, 374), Color.red, 14),
        new Ball(new Vector2(1162, 452), Color.red, 15)
    ]

    this.yellowBalls = [
        new Ball(new Vector2(1022, 413), Color.yellow, 1),
        new Ball(new Vector2(1056, 393), Color.yellow, 2),
        new Ball(new Vector2(1090, 452), Color.yellow, 3),
        new Ball(new Vector2(1126, 354), Color.yellow, 4),
        new Ball(new Vector2(1126, 433), Color.yellow, 5),
        new Ball(new Vector2(1162, 413), Color.yellow, 6),
        new Ball(new Vector2(1162, 491), Color.yellow, 7)
    ];

    this.whiteBall = new Ball(new Vector2(413, 413), Color.white, 0);
    this.blackBall = new Ball(new Vector2(1090, 413), Color.black, 8);

    this.balls = [
        this.yellowBalls[0],
        this.yellowBalls[1],
        this.redBalls[0],
        this.redBalls[1],
        this.blackBall,
        this.yellowBalls[2],
        this.yellowBalls[3],
        this.redBalls[2],
        this.yellowBalls[4],
        this.redBalls[3],
        this.redBalls[4],
        this.redBalls[5],
        this.yellowBalls[5],
        this.redBalls[6],
        this.yellowBalls[6],
        this.whiteBall]

    this.stick = new Stick({ x: 413, y: 413 });

    // 自由球状态（犯规后摆白球）
    this.freeBall = {
        active: false,
        valid: true,
        cursor: new Vector2(0, 0),
        lastValid: null,
        rejectUntil: 0
    };

    this.gameOver = false;
}

GameWorld.prototype.getBallsSetByColor = function (color) {

    if (color === Color.red) {
        return this.redBalls;
    }
    if (color === Color.yellow) {
        return this.yellowBalls;
    }
    if (color === Color.white) {
        return this.whiteBall;
    }
    if (color === Color.black) {
        return this.blackBall;
    }
}

GameWorld.prototype.handleInput = function (delta) {
    this.stick.handleInput(delta);
};

GameWorld.prototype.update = function (delta) {
    this.stick.update(delta);

    for (var i = 0; i < this.balls.length; i++) {
        for (var j = i + 1; j < this.balls.length; j++) {
            this.handleCollision(this.balls[i], this.balls[j], delta);
        }
    }

    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].update(delta);
    }

    if (!this.ballsMoving() && AI.finishedSession) {
        Game.policy.updateTurnOutcome();

        // 犯规解除（自己摆好、或服务器快照判定）时退出自由球状态
        if (!Game.policy.foul && this.freeBall.active) {
            this.freeBall.active = false;
            this.stick.reset();
            this.stick.visible = true;
        }

        if (Game.policy.foul) {
            this.ballInHand();
        }
    }

};

// 犯规后的自由球（触屏版重写）
//
// 原版做法是「鼠标没按下时把白球吸附到指针位置」，触屏上有三个致命问题：
//   1) `whiteBall.position = Mouse.position` 是引用赋值，而触摸时 Mouse._position
//      每次移动都会被替换成新对象 —— 白球只跳一次，之后完全不跟手
//   2) 拖到边框外/袋口/别的球上也不会被拦住，松手就永久停在非法位置
//   3) 白球落袋后停在 (0,900) 且不可见，玩家根本不知道该去拖它
//
// 现在的状态机：
//   进入自由球 → 白球自动回到安全点并显示
//   按住拖动   → 位置夹在台面内（不会飞出桌外），实时判断能否放置
//   松手       → 合法则落位并清除犯规；非法则回弹到最近一次合法位置，继续等玩家放
GameWorld.prototype.ballInHand = function () {
    if (AI_ON && Game.policy.turn === AI_PLAYER_NUM) {
        return;
    }

    // 联机：只有轮到自己才能摆自由球
    if (NET_ON && Game.policy.turn !== NET_SEAT) {
        return;
    }

    var free = this.freeBall;
    if (!free.active) {
        this.beginFreeBall();
    }

    KEYBOARD_INPUT_ON = false;
    this.stick.visible = false;

    if (Mouse.left.down) {
        // 关键：copy()，绝不能把 Mouse.position 的引用直接挂到球上
        this.clampToTable(Mouse.position, free.cursor);
        this.whiteBall.position = free.cursor.copy();
        this.whiteBall.visible = true;
        this.whiteBall.inHole = false;

        free.valid = this.isPlacementValid(free.cursor);
        if (free.valid) {
            free.lastValid = free.cursor.copy();
        }
    } else if (Mouse.left.released) {
        if (this.isPlacementValid(this.whiteBall.position)) {
            this.commitFreeBall(this.whiteBall.position);
        } else {
            // 非法落点：弹回最近一次合法位置，保持在自由球状态等玩家重放
            var back = free.lastValid || this.freeBallHome();
            this.whiteBall.position = back.copy();
            free.valid = true;
            free.rejectUntil = Date.now() + 1200;
        }
    }
};

// 进入自由球：把白球（可能刚从袋里出来 / 停在 (0,900)）放回安全点
GameWorld.prototype.beginFreeBall = function () {
    var free = this.freeBall;
    free.active = true;
    free.valid = true;
    free.rejectUntil = 0;
    free.cursor = new Vector2(0, 0);

    this.whiteBall.visible = true;
    this.whiteBall.inHole = false;
    this.whiteBall.moving = false;
    this.whiteBall.velocity = Vector2.zero;

    var home = this.freeBallHome();
    this.whiteBall.position = home.copy();
    free.lastValid = home.copy();

    this.stick.position = home.copy();
    this.stick.visible = false;
};

// 开球点被占用时，就近找一块空地
GameWorld.prototype.freeBallHome = function () {
    var candidates = [
        this.whiteBallStartingPosition,
        new Vector2(300, 413),
        new Vector2(413, 300),
        new Vector2(413, 526),
        new Vector2(300, 300),
        new Vector2(300, 526),
        new Vector2(500, 620)
    ];

    for (var i = 0; i < candidates.length; i++) {
        if (this.isPlacementValid(candidates[i])) {
            return candidates[i].copy();
        }
    }
    return new Vector2(Game.size.x / 2 - 200, Game.size.y / 2);
};

// 白球能否放在这里：不能出边框、不能进袋口、不能与其他活球重叠
GameWorld.prototype.isPlacementValid = function (pos) {
    if (Game.policy.isOutsideBorder(pos, this.whiteBall.origin)) {
        return false;
    }
    if (Game.policy.isInsideHole(pos)) {
        return false;
    }

    for (var i = 0; i < this.balls.length; i++) {
        var ball = this.balls[i];
        if (ball === this.whiteBall) continue;
        if (ball.inHole || !ball.visible) continue;
        if (pos.distanceFrom(ball.position) < BALL_SIZE) {
            return false;
        }
    }
    return true;
};

// 把目标点夹进台面可用区域，拖拽时白球不会飞出桌外
GameWorld.prototype.clampToTable = function (pos, out) {
    var r = this.whiteBall.origin;
    var policy = Game.policy;

    out.x = Math.max(policy.leftBorderX + r.x,
        Math.min(policy.rightBorderX - r.x, pos.x));
    out.y = Math.max(policy.topBorderY + r.y,
        Math.min(policy.bottomBorderY - r.y, pos.y));
    return out;
};

GameWorld.prototype.commitFreeBall = function (pos) {
    this.whiteBall.position = pos.copy();
    this.whiteBall.inHole = false;
    this.whiteBall.visible = true;
    this.whiteBall.moving = false;
    this.whiteBall.velocity = Vector2.zero;

    Game.policy.foul = false;
    this.freeBall.active = false;

    this.stick.position = this.whiteBall.position.copy();
    this.stick.reset();
    this.stick.visible = true;
    KEYBOARD_INPUT_ON = true;

    // 联机：自由球位置也交给服务器校验
    if (NET_ON) {
        Net.sendBallInHand(pos.x, pos.y);
    }
};

GameWorld.prototype.whiteBallOverlapsBalls = function () {

    var ballsOverlap = false;
    for (var i = 0; i < this.balls.length; i++) {
        if (this.whiteBall !== this.balls[i]) {
            if (this.whiteBall.position.distanceFrom(this.balls[i].position) < BALL_SIZE) {
                ballsOverlap = true;
            }
        }
    }

    return ballsOverlap;
}

GameWorld.prototype.ballsMoving = function () {

    var ballsMoving = false;

    for (var i = 0; i < this.balls.length; i++) {
        if (this.balls[i].moving) {
            ballsMoving = true;
        }
    }

    return ballsMoving;
}

GameWorld.prototype.handleCollision = function (ball1, ball2, delta) {

    if (ball1.inHole || ball2.inHole)
        return;

    if (!ball1.moving && !ball2.moving)
        return;

    var ball1NewPos = ball1.position.add(ball1.velocity.multiply(delta));
    var ball2NewPos = ball2.position.add(ball2.velocity.multiply(delta));

    var dist = ball1NewPos.distanceFrom(ball2NewPos);

    if (dist < BALL_SIZE) {
        Game.policy.checkColisionValidity(ball1, ball2);

        var power = (Math.abs(ball1.velocity.x) + Math.abs(ball1.velocity.y)) +
            (Math.abs(ball2.velocity.x) + Math.abs(ball2.velocity.y));
        power = power * 0.00482;

        if (Game.sound && SOUND_ON) {
            playSfx("BallsCollide.wav", power / 20);
        }

        var opposite = ball1.position.y - ball2.position.y;
        var adjacent = ball1.position.x - ball2.position.x;
        var rotation = Math.atan2(opposite, adjacent);

        ball1.moving = true;
        ball2.moving = true;

        var velocity2 = new Vector2(90 * Math.cos(rotation + Math.PI) * power, 90 * Math.sin(rotation + Math.PI) * power);
        ball2.velocity = ball2.velocity.addTo(velocity2);

        ball2.velocity.multiplyWith(0.97);

        var velocity1 = new Vector2(90 * Math.cos(rotation) * power, 90 * Math.sin(rotation) * power);
        ball1.velocity = ball1.velocity.addTo(velocity1);

        ball1.velocity.multiplyWith(0.97);
    }

}

GameWorld.prototype.draw = function () {
    Canvas2D.drawImage(sprites.background);

    // 先画台面上的球与球杆，HUD 最后画（否则球杆会盖住玩家牌）
    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].draw();
    }

    this.stick.draw();

    // 自由球：白球外画一圈提示环（绿=可放置，红=压球/贴边/袋口）
    if (this.freeBall.active) {
        var rejected = Date.now() < this.freeBall.rejectUntil;
        var ok = this.freeBall.valid && !rejected;
        var pulse = (Math.sin(Date.now() / 260) + 1) * 0.5;
        Canvas2D.drawRing(this.whiteBall.position, BALL_VISUAL_RADIUS + 6 + pulse * 5,
            ok ? "#4ADE80" : "#FF5A5A", 3);
        Canvas2D.drawRing(this.whiteBall.position, BALL_VISUAL_RADIUS + 16 + pulse * 5,
            ok ? "rgba(74,222,128,0.45)" : "rgba(255,90,90,0.45)", 2);
    }

    // HUD（赢盘数 / 已落袋球）画在球和球杆之上，避免被遮住
    Game.policy.drawScores();

    // 对局中右上角绘制「菜单」按钮（替代原版 ESC 键）
    // 位置由 Game.menuButtonRect 统一算：有系统胶囊时自动让位到胶囊左侧
    var menuRect = Game.menuButtonRect();
    // 0.55：按钮常驻在台面上，压太实会挡住上右袋口附近的球
    Button.drawBox("菜单", new Vector2(menuRect.x, menuRect.y),
        new Vector2(menuRect.w, menuRect.h), false, 32, 0.55);

    // 底部状态条：左右是双方昵称芯片，中间是当前状态
    this.drawStatusBar(this.statusInfo());
};

// 底部状态条要显示什么：谁出杆、自由球怎么放、对手是否在打
// 名字已经由两侧的昵称芯片常驻显示，这里只留「在干什么」，避免同一行重复两遍名字
GameWorld.prototype.statusInfo = function () {
    var policy = Game.policy;
    var accent = policy.turnAccent();
    var score = this.scoreSuffix();

    if (this.freeBall.active) {
        var rejected = Date.now() < this.freeBall.rejectUntil;
        var ok = this.freeBall.valid && !rejected;
        return {
            text: ok
                ? "自由球：拖动白球到台面空位，松手放置"
                : "这里放不下（压球 / 贴边 / 袋口），换个位置",
            color: ok ? "#B7F7CE" : "#FFB4B4",
            accent: ok ? "#4ADE80" : "#FF5A5A"
        };
    }

    var myTurn = !(AI_ON && policy.turn === AI_PLAYER_NUM)
        && !(NET_ON && policy.turn !== NET_SEAT);

    // 球还在滚：告诉玩家这一杆已经打出去了
    if (this.ballsMoving()) {
        return {
            text: "击球中…" + score,
            color: "rgba(255,255,255,0.78)",
            accent: accent
        };
    }

    if (myTurn && !policy.turnPlayed) {
        var powerPercent = Math.round(this.stick.power / 75 * 100);
        return {
            text: "力度 " + powerPercent + "%" + this.groupSuffix(policy.turn) + score,
            color: "#FFFFFF",
            accent: accent
        };
    }

    // AI 思考中由顶部浮条提示，底部留空，避免两处重复
    if (AI_ON && policy.turn === AI_PLAYER_NUM) {
        return null;
    }

    return {
        text: "等待对方出杆…" + score,
        color: "rgba(255,255,255,0.82)",
        accent: accent
    };
};

// 出杆方的组别与进度：「 · 实心 1-7 · 本盘 2/7」，未分组时为空
GameWorld.prototype.groupSuffix = function (index) {
    var player = Game.policy.players[index];
    if (!player) {
        return "";
    }
    var group = Game.policy.colorName(index);
    if (!group) {
        return "";
    }
    return " · " + group + " · 本盘 " + player.matchScore.value + "/7";
};

// 赢盘数：台面不再画淡色大字，只有真的打过盘才挂在底部条尾部
GameWorld.prototype.scoreSuffix = function () {
    var players = Game.policy.players;
    var a = players[0].totalScore.value;
    var b = players[1].totalScore.value;
    if (a + b === 0) {
        return "";
    }
    return " · 盘分 " + a + ":" + b;
};

// 底部一条：左右两个昵称芯片常驻（对战双方随时能看到彼此叫什么），
// 中间胶囊是当前状态（力度 / 击球中 / 自由球提示 / 等待）。
// 出杆方的芯片用其主色描边高亮，一眼看出轮到谁。
GameWorld.prototype.drawStatusBar = function (status) {
    var y = 768;
    var h = 52;
    // 和球桌左右边界对齐，芯片不会悬在木框外面
    var pad = BORDER_SIZE;
    var gap = 12;
    var nameFs = 24;

    var policy = Game.policy;
    var names = [
        (policy.players[0] && policy.players[0].name) || "玩家 1",
        (policy.players[1] && policy.players[1].name) || "玩家 2"
    ];

    // 芯片宽度按名字长度自适应：10 个中文字约 240px，留出竖条和内边距
    var chipW = [];
    for (var i = 0; i < 2; i++) {
        chipW[i] = Math.min(312,
            Math.max(130, Canvas2D.measureText(names[i], nameFs, "sans-serif") + 64));
    }

    var leftX = pad;
    var rightX = Game.size.x - pad - chipW[1];
    var midLeft = leftX + chipW[0] + gap;
    var midRight = rightX - gap;

    var turn = policy.turn;
    this.drawNameChip(0, leftX, y, chipW[0], h, turn === 0);
    this.drawNameChip(1, rightX, y, chipW[1], h, turn === 1);

    if (!status || !status.text) {
        return;
    }

    // 中间可用宽度：两个芯片吃掉多少就剩多少，太窄就不画状态，只留名字
    var avail = midRight - midLeft;
    if (avail < 180) {
        return;
    }

    var fs = 26;
    var maxTextW = avail - 80;
    while (fs > 16 && Canvas2D.measureText(status.text, fs, "sans-serif") > maxTextW) {
        fs -= 2;
    }

    var textW = Canvas2D.measureText(status.text, fs, "sans-serif");
    var w = Math.min(avail, textW + 80);
    var x = midLeft + (avail - w) / 2;

    // 底板透明度压到 0.52：这层只是提示，不该把台面上的球和袋口糊住
    Canvas2D.fillRect(x, y, w, h, "rgba(6,16,12,0.52)", 25);
    Canvas2D.fillRect(x + 16, y + 13, 6, h - 26, status.accent || "#FFFFFF", 3);
    Canvas2D.drawText(status.text, new Vector2(x + w / 2 + 10, y + (h - fs) / 2 - 2),
        Vector2.zero, status.color, "center", "sans-serif", fs + "px");
};

// 单个昵称芯片：出杆方 = 主色描边 + 实底 + 白字；等待方 = 暗底 + 降低透明度
GameWorld.prototype.drawNameChip = function (index, x, y, w, h, isTurn) {
    var player = Game.policy.players[index] || {};
    var accent = player.accent || "#FFFFFF";
    var name = player.name || ("玩家 " + (index + 1));

    if (isTurn) {
        // 先铺一层主色当外框，再压一层深色内芯，等效于 2px 描边（Canvas2D 没有描边圆角矩形）
        // 内芯只留 0.60 不透明度：压得太实会把球桌边框整条盖掉
        Canvas2D.fillRect(x - 2, y - 2, w + 4, h + 4, accent, 26);
        Canvas2D.fillRect(x, y, w, h, "rgba(6,16,12,0.60)", 24);
    } else {
        Canvas2D.fillRect(x, y, w, h, "rgba(6,16,12,0.36)", 25);
    }

    Canvas2D.fillRect(x + 14, y + 13, 6, h - 26,
        isTurn ? accent : "rgba(255,255,255,0.28)", 3);

    // 名字过长（10 个字）时缩字号，保证完整显示而不截断
    var fs = 24;
    var maxW = w - 48;
    while (fs > 14 && Canvas2D.measureText(name, fs, "sans-serif") > maxW) {
        fs -= 1;
    }

    Canvas2D.drawText(name, new Vector2(x + 32, y + (h - fs) / 2 - 2), Vector2.zero,
        isTurn ? "#FFFFFF" : "rgba(255,255,255,0.74)", "left", "sans-serif", fs + "px");
};

GameWorld.prototype.reset = function () {
    this.gameOver = false;

    this.freeBall.active = false;
    this.freeBall.valid = true;
    this.freeBall.lastValid = null;

    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].reset();
    }

    this.stick.reset();

    if (AI_ON && AI_PLAYER_NUM === 0) {
        AI.startSession();
    }
};

GameWorld.prototype.initiateState = function (balls) {

    for (var i = 0; i < this.balls.length; i++) {
        this.balls[i].position.x = balls[i].position.x;
        this.balls[i].position.y = balls[i].position.y;
        this.balls[i].visible = balls[i].visible;
        this.balls[i].inHole = balls[i].inHole;
    }

    this.stick.position = this.whiteBall.position;
}

GameGlobal.GameWorld = GameWorld;
