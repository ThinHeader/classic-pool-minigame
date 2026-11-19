"use strict";

// 玩家昵称：存本地、可在主菜单修改；联机时随建房/加入消息发给房间服务，
// 开局由服务器把双方昵称一起下发，这样两边看到的名字一致。
var Nick = {
    STORAGE_KEY: "playerNickname",
    _cached: null,

    _randomName: function () {
        return "球友" + (1000 + Math.floor(Math.random() * 9000));
    },

    get: function () {
        if (this._cached) {
            return this._cached;
        }

        var stored = "";
        try {
            stored = wx.getStorageSync(this.STORAGE_KEY) || "";
        } catch (e) {
            stored = "";
        }

        if (!stored) {
            stored = this._randomName();
            try {
                wx.setStorageSync(this.STORAGE_KEY, stored);
            } catch (e) { }
        }

        this._cached = String(stored).slice(0, 10);
        return this._cached;
    },

    set: function (name) {
        var value = String(name || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 10);
        if (!value) {
            return this.get();
        }
        this._cached = value;
        try {
            wx.setStorageSync(this.STORAGE_KEY, value);
        } catch (e) { }
        return value;
    },

    // 弹系统输入框修改昵称（wx.showModal 的 editable 模式，不需要额外权限）
    ask: function (done) {
        var self = this;

        if (typeof wx === "undefined" || typeof wx.showModal !== "function") {
            if (done) done(self.get());
            return;
        }

        wx.showModal({
            title: "修改昵称",
            editable: true,
            placeholderText: "最多 10 个字",
            content: self.get(),
            success: function (res) {
                if (res && res.confirm) {
                    self.set(res.content);
                }
                if (done) done(self.get());
            },
            fail: function () {
                if (done) done(self.get());
            }
        });
    }
};

GameGlobal.Nick = Nick;
