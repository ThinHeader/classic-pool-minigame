"use strict";

// 昵称输入面板。
// 小游戏没有 DOM 输入框，两种方式各有坑：
//   - wx.showModal({editable}) 部分基础库不支持（点了没反应，也不报错）
//   - wx.showKeyboard 需要自己画输入框，但兼容性最好
// 这里默认走自绘面板 + 系统键盘，键盘不可用时降级到 showModal。
//
// 面板有两个页签：本机玩家（「我」）和同机双人对战的「玩家 2」。
// 双人模式两个人用一台手机，各自的昵称都存在本地，进对局时一起显示。

var NickPanel = {
    active: false,
    value: "",
    done: null,
    target: 0,
    _draft: ["", ""],
    _keyboardBound: false,

    // 面板区域（设计分辨率坐标）
    // 纵向排布：标题 28 / 页签 96~152 / 说明 162 / 输入框 196~280 / 按钮 300~376
    // 高度必须容得下「输入框底 500」和「按钮顶 520」，否则两处会叠在一起
    PANEL: { x: 400, y: 220, w: 700, h: 410 },

    // 页签区域（相对面板左上角）
    TABS: { x: 40, y: 96, w: 200, h: 56, gap: 12 },

    open: function (done, target) {
        this.active = true;
        this.target = target === 1 ? 1 : 0;
        this._draft[0] = Nick.get();
        this._draft[1] = Nick.getSecond();
        this.value = this._draft[this.target];
        this.done = done || null;

        var self = this;

        if (typeof wx === "undefined" || typeof wx.showKeyboard !== "function") {
            this._fallbackModal(done);
            return;
        }

        if (!this._keyboardBound) {
            this._keyboardBound = true;
            if (wx.onKeyboardInput) {
                wx.onKeyboardInput(function (res) {
                    if (!self.active) return;
                    self.value = self._limit((res && res.value) || "");
                });
            }
            if (wx.onKeyboardConfirm) {
                wx.onKeyboardConfirm(function (res) {
                    if (!self.active) return;
                    self.value = self._limit((res && res.value) || self.value);
                    self.commit();
                });
            }
            if (wx.onKeyboardComplete) {
                wx.onKeyboardComplete(function (res) {
                    if (!self.active) return;
                    self.value = self._limit((res && res.value) || self.value);
                    self.commit();
                });
            }
        }

        this._showKeyboard(done);
    },

    _limit: function (text) {
        var s = String(text === null || text === undefined ? "" : text);
        var chars = typeof Array.from === "function" ? Array.from(s) : s.split("");
        if (chars.length > Nick.LIMIT) {
            chars.length = Nick.LIMIT;
        }
        return chars.join("");
    },

    _showKeyboard: function (done) {
        var self = this;
        if (typeof wx === "undefined" || typeof wx.showKeyboard !== "function") {
            return;
        }

        wx.showKeyboard({
            defaultValue: this.value,
            maxLength: Nick.LIMIT,
            multiple: false,
            confirmHold: false,
            confirmType: "done",
            fail: function () {
                self.active = false;
                self._fallbackModal(done);
            }
        });
    },

    // 切换页签：先把当前输入存进草稿，再载入目标页签的值并刷新键盘内容
    switchTo: function (target) {
        if (target !== 0 && target !== 1) {
            return;
        }
        if (target === this.target) {
            return;
        }
        this._draft[this.target] = this.value;
        this.target = target;
        this.value = this._draft[target];
        this._showKeyboard(this.done);
    },

    _fallbackModal: function (done) {
        if (typeof wx === "undefined" || typeof wx.showModal !== "function") {
            if (done) done(Nick.get());
            return;
        }

        var self = this;
        var isSecond = this.target === 1;
        var current = isSecond ? Nick.getSecond() : Nick.get();

        wx.showModal({
            title: isSecond ? "设置玩家 2 昵称" : "设置昵称",
            editable: true,
            placeholderText: "最多 " + Nick.LIMIT + " 个字",
            content: current,
            success: function (res) {
                if (res && res.confirm) {
                    if (isSecond) {
                        self._draft[1] = Nick.setSecond(res.content);
                    } else {
                        self._draft[0] = Nick.set(res.content);
                    }
                }
                self.active = false;
                if (done) done(isSecond ? Nick.getSecond() : Nick.get());
            },
            fail: function () {
                self.active = false;
                if (done) done(isSecond ? Nick.getSecond() : Nick.get());
            }
        });
    },

    commit: function () {
        if (!this.active) {
            return;
        }
        // 两个页签的草稿一起落盘：用户可能切过去改过一个再切回来
        this._draft[this.target] = this.value;
        Nick.set(this._draft[0]);
        Nick.setSecond(this._draft[1]);
        this.close(this.target === 1 ? Nick.getSecond() : Nick.get());
    },

    cancel: function () {
        if (!this.active) {
            return;
        }
        this.close(this.target === 1 ? Nick.getSecond() : Nick.get());
    },

    close: function (value) {
        this.active = false;
        if (typeof wx !== "undefined" && wx.hideKeyboard) {
            try { wx.hideKeyboard({}); } catch (e) { }
        }
        var done = this.done;
        this.done = null;
        if (done) {
            done(value);
        }
    },

    tabRect: function (index) {
        var box = this.PANEL;
        var tabs = this.TABS;
        return {
            x: box.x + tabs.x + index * (tabs.w + tabs.gap),
            y: box.y + tabs.y,
            w: tabs.w,
            h: tabs.h
        };
    },

    // 命中：页签 / 确定 / 取消
    handleTap: function (p) {
        var box = this.PANEL;
        if (!p) {
            return;
        }

        for (var i = 0; i < 2; i++) {
            var tab = this.tabRect(i);
            if (p.x > tab.x && p.x < tab.x + tab.w && p.y > tab.y && p.y < tab.y + tab.h) {
                this.switchTo(i);
                return;
            }
        }

        var okX = box.x + box.w - 320;
        var btnY = box.y + box.h - 110;

        if (p.x > okX && p.x < okX + 140 && p.y > btnY && p.y < btnY + 76) {
            this.commit();
            return;
        }
        if (p.x > okX + 160 && p.x < okX + 300 && p.y > btnY && p.y < btnY + 76) {
            this.cancel();
            return;
        }
        // 点面板其他地方不关闭，避免误触丢掉正在输入的内容
    },

    draw: function () {
        if (!this.active) {
            return;
        }

        var box = this.PANEL;
        var isSecond = this.target === 1;

        // 遮罩
        Canvas2D.fillRect(0, 0, Game.size.x, Game.size.y, "rgba(0,0,0,0.62)");

        // 面板
        Canvas2D.fillRect(box.x, box.y, box.w, box.h, "#101B26", 24);
        Canvas2D.fillRect(box.x, box.y, box.w, 6, isSecond ? "#FF9F43" : "#4AA3FF", 3);

        Canvas2D.drawText("设置昵称", new Vector2(box.x + 40, box.y + 28), Vector2.zero,
            "#FFFFFF", "left", "sans-serif", "44px");

        // 页签：我 / 玩家 2
        var labels = ["我的昵称", "玩家 2 昵称"];
        var accents = ["#4AA3FF", "#FF9F43"];
        for (var i = 0; i < 2; i++) {
            var tab = this.tabRect(i);
            var on = i === this.target;
            Canvas2D.fillRect(tab.x, tab.y, tab.w, tab.h,
                on ? accents[i] : "rgba(255,255,255,0.10)", 14);
            Canvas2D.drawText(labels[i], new Vector2(tab.x + tab.w / 2, tab.y + 14), Vector2.zero,
                on ? "#FFFFFF" : "rgba(255,255,255,0.62)", "center", "sans-serif", "26px");
        }

        Canvas2D.drawText(isSecond
            ? "同机双人对战时，右边玩家显示这个名字"
            : "联机和对局时显示这个名字，最多 " + Nick.LIMIT + " 个字",
            new Vector2(box.x + 40, box.y + 162), Vector2.zero,
            "rgba(255,255,255,0.55)", "left", "sans-serif", "22px");

        // 输入框
        var field = { x: box.x + 40, y: box.y + 196, w: box.w - 80, h: 84 };
        Canvas2D.fillRect(field.x, field.y, field.w, field.h, "rgba(255,255,255,0.10)", 14);
        Canvas2D.fillRect(field.x, field.y, 5, field.h, isSecond ? "#FF9F43" : "#4AA3FF", 2);

        var shown = this.value || "";
        Canvas2D.drawText(shown.length ? shown : "点屏幕上的键盘输入…",
            new Vector2(field.x + 26, field.y + field.h / 2 - 20), Vector2.zero,
            shown.length ? "#FFFFFF" : "rgba(255,255,255,0.35)",
            "left", "sans-serif", "36px");

        // 计数
        var count = typeof Array.from === "function" ? Array.from(shown).length : shown.length;
        Canvas2D.drawText(count + "/" + Nick.LIMIT,
            new Vector2(field.x + field.w - 20, field.y + field.h - 32), Vector2.zero,
            "rgba(255,255,255,0.42)", "right", "sans-serif", "22px");

        // 按钮
        var okX = box.x + box.w - 320;
        var btnY = box.y + box.h - 110;
        Canvas2D.fillRect(okX, btnY, 140, 76, "#2F6FED", 16);
        Canvas2D.drawText("确定", new Vector2(okX + 70, btnY + 20), Vector2.zero,
            "#FFFFFF", "center", "sans-serif", "34px");

        Canvas2D.fillRect(okX + 160, btnY, 140, 76, "rgba(255,255,255,0.14)", 16);
        Canvas2D.drawText("取消", new Vector2(okX + 230, btnY + 20), Vector2.zero,
            "rgba(255,255,255,0.82)", "center", "sans-serif", "34px");
    }
};

GameGlobal.NickPanel = NickPanel;
