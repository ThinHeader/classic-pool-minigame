"use strict";

// 昵称输入面板。
// 小游戏没有 DOM 输入框，两种方式各有坑：
//   - wx.showModal({editable}) 部分基础库不支持（点了没反应，也不报错）
//   - wx.showKeyboard 需要自己画输入框，但兼容性最好
// 这里默认走自绘面板 + 系统键盘，键盘不可用时降级到 showModal。

var NickPanel = {
    active: false,
    value: "",
    done: null,
    _keyboardBound: false,

    // 面板按钮区域（设计分辨率坐标）
    PANEL: { x: 400, y: 250, w: 700, h: 330 },

    open: function (done) {
        this.active = true;
        this.value = Nick.get();
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
                    self.value = String((res && res.value) || "").slice(0, 10);
                });
            }
            if (wx.onKeyboardConfirm) {
                wx.onKeyboardConfirm(function (res) {
                    if (!self.active) return;
                    self.value = String((res && res.value) || self.value).slice(0, 10);
                    self.commit();
                });
            }
            if (wx.onKeyboardComplete) {
                wx.onKeyboardComplete(function (res) {
                    if (!self.active) return;
                    self.value = String((res && res.value) || self.value).slice(0, 10);
                    self.commit();
                });
            }
        }

        wx.showKeyboard({
            defaultValue: this.value,
            maxLength: 10,
            multiple: false,
            confirmHold: false,
            confirmType: "done",
            fail: function () {
                self.active = false;
                self._fallbackModal(done);
            }
        });
    },

    _fallbackModal: function (done) {
        if (typeof wx === "undefined" || typeof wx.showModal !== "function") {
            if (done) done(Nick.get());
            return;
        }

        wx.showModal({
            title: "设置昵称",
            editable: true,
            placeholderText: "最多 10 个字",
            content: Nick.get(),
            success: function (res) {
                if (res && res.confirm && res.content) {
                    Nick.set(res.content);
                }
                if (done) done(Nick.get());
            },
            fail: function () {
                if (done) done(Nick.get());
            }
        });
    },

    commit: function () {
        if (!this.active) {
            return;
        }
        var value = Nick.set(this.value);
        this.close(value);
    },

    cancel: function () {
        if (!this.active) {
            return;
        }
        this.close(Nick.get());
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

    // 命中：确定 / 取消 / 面板外（= 取消）
    handleTap: function (p) {
        var box = this.PANEL;
        if (!p) {
            return;
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

        // 遮罩
        Canvas2D.fillRect(0, 0, Game.size.x, Game.size.y, "rgba(0,0,0,0.62)");

        // 面板
        Canvas2D.fillRect(box.x, box.y, box.w, box.h, "#101B26", 24);
        Canvas2D.fillRect(box.x, box.y, box.w, 6, "#4AA3FF", 3);

        Canvas2D.drawText("设置昵称", new Vector2(box.x + 40, box.y + 34), Vector2.zero,
            "#FFFFFF", "left", "sans-serif", "44px");
        Canvas2D.drawText("对局和联机时显示这个名字，最多 10 个字",
            new Vector2(box.x + 40, box.y + 96), Vector2.zero,
            "rgba(255,255,255,0.55)", "left", "sans-serif", "24px");

        // 输入框
        var field = { x: box.x + 40, y: box.y + 140, w: box.w - 80, h: 88 };
        Canvas2D.fillRect(field.x, field.y, field.w, field.h, "rgba(255,255,255,0.10)", 14);
        Canvas2D.fillRect(field.x, field.y, 5, field.h, "#4AA3FF", 2);

        var shown = this.value || "";
        Canvas2D.drawText(shown.length ? shown : "点屏幕上的键盘输入…",
            new Vector2(field.x + 26, field.y + field.h / 2 - 20), Vector2.zero,
            shown.length ? "#FFFFFF" : "rgba(255,255,255,0.35)",
            "left", "sans-serif", "38px");

        // 计数
        Canvas2D.drawText(shown.length + "/10",
            new Vector2(field.x + field.w - 20, field.y + field.h - 34), Vector2.zero,
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
