"use strict";

// 真机诊断层。
// 小游戏在手机上出问题时既看不到 console，也没有 DOM 可以查，
// 所以这里把「异常 + 关键运行状态」画到屏幕上：
//   - 任何未捕获异常 / Promise reject 都会显示出来
//   - 帧循环停摆时会有 watchdog 自动重启，并把原因写屏
//
// 默认关闭：这块面板只在排查时才有用，平时会挡住左上球袋和台面，
// 而且玩家看到一串运行日志也只会以为是 bug。线上真出问题时再临时打开：
//   wx.setStorageSync("diag_on", 1)   强制显示
//   wx.setStorageSync("diag_off", 1)  强制关闭（优先于 diag_on）

var Diag = {
    show: false,
    lines: [],
    maxLines: 10,
    // 同一条日志的节流：停摆检测每 1.5 秒跑一次，不去重会把面板刷到永不消失
    _lastText: "",
    _lastLogAt: 0,
    frames: 0,
    fps: 0,
    lastFpsAt: 0,
    lastFrameAt: 0,
    lastHeartbeatAt: 0,
    fatal: false,
    _drawSeq: 0,
    _lastDrawnSeq: -1,

    init: function () {
        if (this._inited) {
            return;
        }
        this._inited = true;

        // 默认不显示（见文件头注释）。只有 storage 里显式打开才画，
        // 不做环境判断：开发/体验/正式版行为一致，避免「本机看得见、上线看不见」
        try {
            if (wx.getStorageSync && wx.getStorageSync("diag_on")) {
                this.show = true;
            }
            if (wx.getStorageSync && wx.getStorageSync("diag_off")) {
                this.show = false;
            }
        } catch (e) { }

        this.lastFrameAt = Date.now();
        this.lastFpsAt = Date.now();
        this.lastHeartbeatAt = Date.now();

        var self = this;
        if (typeof wx.onError === "function") {
            wx.onError(function (err) {
                var msg = err && (err.message || err.errMsg || err.stack) || String(err);
                self.fatal = true;
                self.log("运行错误: " + msg, true);
            });
        }
        if (typeof wx.onUnhandledRejection === "function") {
            wx.onUnhandledRejection(function (res) {
                var r = res && res.reason;
                self.log("Promise 异常: " + (r && (r.message || r.stack) || String(r)), true);
            });
        }
        // 从后台切回前台时 rAF 可能停摆，这里标记一下
        if (typeof wx.onShow === "function") {
            wx.onShow(function () {
                self.lastFrameAt = Date.now();
                self.lastHeartbeatAt = Date.now();
                self.log("回到前台");
            });
        }
    },

    log: function (msg, keep) {
        // 面板关着（正式版）就别攒日志了，省一点内存和字符串拼接
        if (!this.show) {
            return;
        }

        var text = String(msg);
        var now = Date.now();

        // 相同日志 5 秒内只记一条：停摆检测是 1.5 秒一轮，不去重会让面板一直亮着
        if (text === this._lastText && now - this._lastLogAt < 5000) {
            return;
        }
        this._lastText = text;
        this._lastLogAt = now;

        // 诊断信息不是运行错误：用 warn 级别，避免被「无 error」类验收/监控误判成崩溃
        if (console && console.warn) {
            console.warn("[diag] " + text);
        }
        this.lines.push(text.slice(0, 120));
        while (this.lines.length > this.maxLines) {
            this.lines.shift();
        }
        this._shownAt = now;
        this._drawSeq++;
    },

    // 每帧调用：统计 fps，检测停摆
    tick: function () {
        var now = Date.now();
        this.frames++;
        this.lastFrameAt = now;

        if (now - this.lastFpsAt >= 1000) {
            this.fps = Math.round(this.frames * 1000 / (now - this.lastFpsAt));
            this.frames = 0;
            this.lastFpsAt = now;
            this.lastHeartbeatAt = now;
        }
    },

    // 画在屏幕左上角（设计分辨率坐标），深色底 + 白字，最多 10 行
    // 非致命信息 8 秒后自动隐藏，不干扰正常游玩
    draw: function () {
        if (!this.show || !this.lines.length) {
            return;
        }
        if (!this.fatal && Date.now() - (this._shownAt || 0) > 8000) {
            return;
        }
        // 每帧都要重画：上一帧的 clear 会擦掉面板，不能做「只在变化时画」的优化
        this._lastDrawnSeq = this._drawSeq;
        this._fpsDrawn = this.fps;
        var x = 16;
        var y = 16;
        var lh = 26;

        // 面板宽度按最长一行估算（19px monospace：中文约 19、半角约 11）。
        // 以前固定 900 宽，一块大黑框会把左上球袋和台面一起糊住，调试时很碍事
        var longest = 0;
        for (var i = 0; i < this.lines.length; i++) {
            var line = this.lines[i];
            var len = 0;
            for (var j = 0; j < line.length; j++) {
                len += line.charCodeAt(j) > 255 ? 19 : 11;
            }
            if (len > longest) {
                longest = len;
            }
        }
        var w = Math.min(900, longest + 34);
        var h = 20 + this.lines.length * lh;

        Canvas2D.fillRect(x, y, w, h, "rgba(0,0,0,0.72)", 10);
        for (var k = 0; k < this.lines.length; k++) {
            Canvas2D.drawText(this.lines[k], new Vector2(x + 14, y + 10 + k * lh),
                Vector2.zero, this.fatal ? "#FF8A8A" : "#BFE9FF", "left", "monospace", "19px");
        }
    },

    // 覆盖式错误屏：连菜单都画不出来时用
    fatalScreen: function (title, detail, hint) {
        Canvas2D.clear();
        Canvas2D.fillRect(0, 0, Game.size.x, Game.size.y, "#0B1620");
        Canvas2D.drawText(title, new Vector2(Game.size.x / 2, 180), Vector2.zero,
            "#FF8A8A", "center", "sans-serif", "56px");
        var lines = String(detail || "").match(/.{1,46}/g) || [];
        for (var i = 0; i < Math.min(lines.length, 6); i++) {
            Canvas2D.drawText(lines[i], new Vector2(Game.size.x / 2, 280 + i * 44), Vector2.zero,
                "#D6E6F2", "center", "sans-serif", "30px");
        }
        if (hint) {
            Canvas2D.drawText(hint, new Vector2(Game.size.x / 2, 620), Vector2.zero,
                "#8FD6A8", "center", "sans-serif", "32px");
        }
    }
};

GameGlobal.Diag = Diag;
