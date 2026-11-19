"use strict";

// 原版 Game.js 依赖 window.requestAnimationFrame / document 画布 / Image 对象。
// 微信小游戏：requestAnimationFrame 原生可用；画布与图片改走 wx 接口。

// 兜底：极端情况下 rAF 不可用时用 setTimeout 模拟 60fps
if (typeof requestAnimationFrame !== "function") {
    GameGlobal.requestAnimationFrame = function (callback) {
        setTimeout(callback, 1000 / 60);
    };
}

function Game_Singleton() {
    this.size = undefined;
    this.spritesStillLoading = 0;
    this.gameWorld = undefined;
    this.sound = true;

    // 主循环重入保护：watchdog 与正常启动都走 startMainLoop，
    // 避免两条 rAF 循环并行（会让物理 dt 叠加、球速翻倍）
    this._loopRunning = false;
    // 开局 5 秒说明页期间还没有帧，标记一下让 watchdog 不要误判停摆
    this._pendingStart = false;
    // 连续重启计数：watchdog 用它做退避，值得每次正常出帧就归零
    this._restartCount = 0;
    // 是否在后台：切后台 rAF 会被系统暂停，不能当成停摆
    this._background = false;

    this.mainMenu = new Menu();
}

// 唯一的循环启动入口：每次启动发一个新令牌，旧循环下一帧发现令牌过期会自动退出，
// 这样 watchdog 重启时即使旧 rAF 又恢复，也不会出现两条循环并行（dt 叠加、球速翻倍）
Game_Singleton.prototype.startMainLoop = function () {
    this._loopToken = (this._loopToken || 0) + 1;
    this._loopRunning = true;
    var token = this._loopToken;
    requestAnimationFrame(function () {
        Game.mainLoop(token);
    });
};

// 设计分辨率固定为原版 1500x825，Canvas2D 负责等比缩放适配任意屏幕
Game_Singleton.prototype.start = function () {
    this.size = new Vector2(1500, 825);
    // 启动链上任何一环抛错都不能只留黑屏：画面上直接给出可截图的错误信息
    try {
        Diag.init();
        Canvas2D.initialize();
        this.startWatchdog();
        this.loadAssets();
        this.assetLoadingLoop();
    } catch (e) {
        console.error("[Classic Pool] 启动失败", e);
        try {
            Diag.fatalScreen("启动失败",
                (e && (e.stack || e.message)) || String(e),
                "请截图反馈给开发者");
        } catch (e2) {
            console.error("[Classic Pool] 错误屏绘制失败", e2);
        }
    }
};

Game_Singleton.prototype.initialize = function () {
    this.gameWorld = new GameWorld();
    this.policy = new GamePolicy();

    this.initMenus();

    AI.init(this.gameWorld, this.policy);
};

Game_Singleton.prototype.initMenus = function (inGame) {
    var labels = generateMainMenuLabels("经典8球台球");
    var buttons = generateMainMenuButtons(inGame);

    this.mainMenu.init
    (
        sprites.mainMenuBackground,
        labels,
        buttons,
        sounds.jazzTune
    );
};

// wx.createImage() 替代 new Image()
// 必须监听 onerror：某张图加载失败时若计数不回落，加载页会永远停在「加载中…」
Game_Singleton.prototype.loadSprite = function (imageName) {
    var image = wx.createImage();
    this.spritesStillLoading += 1;
    image.onload = function () {
        Game.spritesStillLoading -= 1;
    };
    image.onerror = function () {
        Game.spritesStillLoading -= 1;
        Diag.log("图片加载失败: " + imageName);
    };
    image.src = imageName;
    return image;
};

// 简易加载画面：黑底白字显示剩余资源数
Game_Singleton.prototype.assetLoadingLoop = function () {
    var ctx = Canvas2D._canvasContext;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, Canvas2D._canvas.width, Canvas2D._canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("加载中… 剩余资源 " + this.spritesStillLoading,
        Canvas2D._canvas.width / 2, Canvas2D._canvas.height / 2);

    if (this.spritesStillLoading === 0) {
        this.initialize();
        this.mainMenu.load();
        this.checkLaunchRoom();
    } else {
        var self = this;
        setTimeout(function () {
            requestAnimationFrame(function () { self.assetLoadingLoop(); });
        }, 100);
    }
};

// 右上角「菜单」按钮的矩形（设计坐标）。
// 默认贴设计区右上角；若系统胶囊（… / ✕）压到这块，就整体让到胶囊左边，
// 否则两个控件会叠在一起，玩家看到的「菜单」是残缺的、也点不准。
// 同时避开右上袋口：按钮盖住袋口会挡住球进洞的视线。
Game_Singleton.prototype.menuButtonRect = function () {
    var w = 80;
    var h = 70;

    // 与胶囊之间留的缝（设计像素）
    var gap = 16;

    // wx.getMenuButtonBoundingClientRect 每帧都问一次没必要（跨端调用），
    // 按画布尺寸缓存，窗口尺寸变了（折叠屏/分屏/旋转）自动失效重算
    var cacheKey = Canvas2D._canvas
        ? (Canvas2D._canvas.width + "x" + Canvas2D._canvas.height)
        : "none";

    if (this._menuRect && this._menuRectKey === cacheKey) {
        return this._menuRect;
    }

    // 胶囊如果在设计区右侧之外（宽屏 letterbox 时可能如此），就不必让位
    var capsule = Canvas2D.getCapsuleRect ? Canvas2D.getCapsuleRect() : null;
    var avoidCapsule = !!(capsule && capsule.left < this.size.x - 2);

    // 按钮右边界允许到哪：先取设计区右缘，再被胶囊、袋口依次压回来
    var rightLimit = this.size.x;
    if (avoidCapsule) {
        rightLimit = Math.min(rightLimit, capsule.left - gap);
    }
    if (Game.policy && Game.policy.topRightHolePos && typeof HOLE_RADIUS === "number") {
        rightLimit = Math.min(rightLimit,
            Game.policy.topRightHolePos.x - HOLE_RADIUS - 8);
    }

    var rect = { x: Math.max(40, rightLimit - w), y: 10, w: w, h: h };

    if (avoidCapsule) {
        // 和胶囊保持同一条水平中线，视觉上像一组按钮
        rect.y = Math.max(4, capsule.top + capsule.height / 2 - h / 2);
        rect.y = Math.min(rect.y, this.size.y - h - 4);
    }

    this._menuRect = rect;
    this._menuRectKey = cacheKey;
    return rect;
};

// 菜单按钮命中判定：留一点外扩，手指抖一下也能点中
Game_Singleton.prototype.menuButtonHit = function (p) {
    var r = this.menuButtonRect();
    var pad = 12;

    return p.x > r.x - pad && p.x < r.x + r.w + pad &&
        p.y > r.y - pad && p.y < r.y + r.h + pad;
};

// 原版按 ESC 呼出菜单 → 触屏改为点击右上角「菜单」按钮（GameWorld.draw 中绘制）
// 用点击队列判定：同一个触摸事件不会既被当成击球又被当成点菜单
Game_Singleton.prototype.handleInput = function () {
    if (!Mouse.consumeTap) {
        return;
    }

    var tap = Mouse.consumeTap();
    while (tap) {
        if (this.menuButtonHit(tap)) {
            Mouse.clearTaps();
            GAME_STOPPED = true;
            Game.initMenus(true);
            Game.mainMenu.load();
            return;
        }
        tap = Mouse.consumeTap();
    }
};

// 本局双方显示名：本地玩家用昵称，同机双人用「玩家 2」昵称，AI 用难度标识
Game_Singleton.prototype.matchNames = function () {
    var me = Nick.get();

    if (NET_ON) {
        return [me, "对手"];
    }
    if (!AI_ON) {
        // 同一台手机两个人：第二个名字也存本地，进对局后两侧芯片各显示各的
        return [me, Nick.getSecond()];
    }

    var aiName = "电脑 · " + (AI_LEVEL_NAME || "普通");
    return AI_PLAYER_NUM === 0 ? [aiName, me] : [me, aiName];
};

Game_Singleton.prototype.startNewGame = function () {
    Ad.hideBanner(); // 进入对局隐藏菜单页 Banner

    // 说明页要停留 5 秒且不出帧，期间抑制 watchdog，避免它在说明页中途拉起主循环
    Game._pendingStart = true;

    Game.gameWorld = new GameWorld();
    Game.policy = new GamePolicy();
    // 注意：startNewGame 由 setTimeout 触发，this 不是 Game，必须显式引用
    Game.policy.setNames(Game.matchNames());

    // 开局操作说明（原版为英文 controls.png，触屏版改为中文文字提示）
    Canvas2D.clear();
    Canvas2D.fillRect(0, 0, Game.size.x, Game.size.y, "#000000");
    Canvas2D.drawText("操作说明", new Vector2(Game.size.x / 2, 140), new Vector2(0, 0), "#ffffff", "center", "sans-serif", "72px");
    Canvas2D.drawText("按住屏幕拖动：瞄准（球杆指向手指方向）", new Vector2(Game.size.x / 2, 300), new Vector2(0, 0), "#cccccc", "center", "sans-serif", "42px");
    Canvas2D.drawText("拉离白球越远：力量越大", new Vector2(Game.size.x / 2, 380), new Vector2(0, 0), "#cccccc", "center", "sans-serif", "42px");
    Canvas2D.drawText("松开手指：击球（轻点自动取消）", new Vector2(Game.size.x / 2, 460), new Vector2(0, 0), "#cccccc", "center", "sans-serif", "42px");
    Canvas2D.drawText("犯规后：拖动白球到合法位置松手放置", new Vector2(Game.size.x / 2, 540), new Vector2(0, 0), "#cccccc", "center", "sans-serif", "42px");
    Canvas2D.drawText("右上角「菜单」：暂停 / 重新开局", new Vector2(Game.size.x / 2, 620), new Vector2(0, 0), "#cccccc", "center", "sans-serif", "42px");
    Canvas2D.drawText("即将开始…", new Vector2(Game.size.x / 2, 720), new Vector2(0, 0), "#888888", "center", "sans-serif", "34px");

    setTimeout(function () {
        Game._pendingStart = false;
        AI.init(Game.gameWorld, Game.policy);

        if (AI_ON && AI_PLAYER_NUM == 0) {
            AI.startSession();
        }
        Game.startMainLoop();
    }, 5000);
};

// 联机对局：不走 5 秒说明页，直接按服务器下发的快照开局
Game_Singleton.prototype.startOnlineMatch = function (seat, snapshot, names) {
    Ad.hideBanner();

    NET_ON = true;
    NET_SEAT = seat;
    AI_ON = false;

    this.gameWorld = new GameWorld();
    this.policy = new GamePolicy();

    // names 由服务器统一下发（双方同名表），缺省时退回「我 / 对手」
    this.policy.setNames(names || Game.matchNames());

    if (snapshot) {
        Net.applySnapshot(snapshot);
    }

    this.mainMenu.active = false;
    GAME_STOPPED = false;
    DISPLAY = true;

    Canvas2D.clear();
    Game._loopRunning = false;
    Game.startMainLoop();
};

// 从好友分享卡片进入（query 带 room）时直接进入加入流程
Game_Singleton.prototype.checkLaunchRoom = function () {
    var room = Lobby.consumeLaunchRoom();
    if (!room) {
        return;
    }
    setTimeout(function () {
        Lobby.joinFromLaunch(room);
    }, 300);
};

Game_Singleton.prototype.continueGame = function () {
    Ad.hideBanner(); // 返回对局隐藏菜单页 Banner
    Game.startMainLoop();
};

Game_Singleton.prototype.mainLoop = function (token) {
    // 被新一轮循环取代的旧循环直接退出
    if (token !== undefined && token !== Game._loopToken) {
        return;
    }

    if (!DISPLAY || GAME_STOPPED) {
        Game._loopRunning = false;
        return;
    }

    // 单帧异常不能断帧：否则一次报错就永久黑屏，玩家看到的是「画面在那但完全不动」
    try {
        Game.gameWorld.handleInput(DELTA);
        Game.gameWorld.update(DELTA);
        Canvas2D.clear();
        Game.gameWorld.draw();
        Diag.tick();
        Game._restartCount = 0; // 正常出帧，重启退避归零
        Diag.draw();
        Mouse.reset();
        Game.handleInput();

        // 联机：本地球停下后套用服务器裁决快照
        if (NET_ON && Net.pendingSnapshot && !Game.gameWorld.ballsMoving()) {
            Net.applyPendingIfIdle();
        }
    } catch (e) {
        // catch 里再调 Diag 若它本身不可用会二次抛错，把帧循环彻底打断
        if (typeof Diag !== "undefined") {
            Diag.log("主循环异常: " + (e && e.message));
        } else {
            console.error("[Classic Pool] 主循环异常", e);
        }
        Mouse.reset();
    }

    requestAnimationFrame(function () {
        // 传进入本帧时的令牌，而不是当前值：
        // 被新一轮循环取代后，旧循环下一帧读到的是「自己的」旧令牌，会自行退出
        Game.mainLoop(token);
    });
};

// 帧循环看门狗：小游戏切后台 / 来电 / 折叠屏切换后 rAF 有可能不再回调，
// 表现为「回来以后画面是静的、点什么都没反应」。这里检测停摆并重新拉起循环。
Game_Singleton.prototype.startWatchdog = function () {
    if (this._watchdogTimer) {
        return;
    }

    var self = this;

    // 切后台时 rAF 被系统暂停，setInterval 却还在跑：
    // 不加这个标记，每次切后台都会被判成「停摆」并反复重启，
    // 回到前台时就有好几条 rAF 循环并行（dt 叠加、球速翻倍）
    if (typeof wx.onHide === "function") {
        wx.onHide(function () {
            self._background = true;
        });
    }
    if (typeof wx.onShow === "function") {
        wx.onShow(function () {
            self._background = false;
            self._restartCount = 0;
            Diag.lastFrameAt = Date.now();
        });
    }

    this._watchdogTimer = setInterval(function () {
        // 开局 5 秒说明页期间本来就没有帧，不算停摆
        if (self._pendingStart || self._background) {
            return;
        }

        // 诊断层被裁包移除时会话就没了帧时间戳来源，此时不做停摆判定，
        // 否则这个定时器自己先抛 ReferenceError、彻底失效
        if (typeof Diag === "undefined") {
            return;
        }

        var idle = Date.now() - Diag.lastFrameAt;

        // 连续重启后逐次拉长判定阈值（2.5s → 6.5s → 10.5s …，上限 30s）。
        // rAF 只是被节流时，不要每 1.5 秒就重启一次，否则会堆出一串循环
        var threshold = Math.min(2500 + self._restartCount * 4000, 30000);
        if (idle < threshold) {
            return;
        }

        if (self.mainMenu && self.mainMenu.active) {
            Diag.log("菜单循环停摆，已重启");
            // 先关掉旧循环标志，避免重启后两套循环同时跑、按钮被点两次
            self.mainMenu.active = false;
            Diag.lastFrameAt = Date.now();
            setTimeout(function () { self.mainMenu.load(); }, 0);
            return;
        }

        if (!GAME_STOPPED && DISPLAY) {
            // 连续重启 3 次还没有帧，说明 rAF 是被系统暂停了（IDE 窗口失焦、
            // 手机锁屏、切到其他 App），不是「循环对象丢了」。这时再拉新循环
            // 只会在恢复瞬间堆出一串并行循环，等 onShow 把计数归零即可
            if (self._restartCount >= 3) {
                return;
            }
            self._restartCount++;
            Diag.log("主循环停摆，已重启");
            Diag.lastFrameAt = Date.now();
            self.startMainLoop();
        }
    }, 1500);
};

var Game = new Game_Singleton();
GameGlobal.Game = Game;
