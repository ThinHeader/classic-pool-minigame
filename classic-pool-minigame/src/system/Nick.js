"use strict";

// 玩家昵称：存本地、可在主菜单修改；联机时随建房/加入消息发给房间服务，
// 开局由服务器把双方昵称一起下发，这样两边看到的名字一致。
//
// 两个槽位：
//   playerNickname  —— 本机玩家（「我」）
//   playerNickname2 —— 同机双人对战时的「玩家 2」
// 双人模式两人共用一台手机，所以第二个名字也存在本地，进对局时一起显示。
var Nick = {
    STORAGE_KEY: "playerNickname",
    STORAGE_KEY_2: "playerNickname2",
    DEFAULT_SECOND: "玩家 2",
    LIMIT: 10,

    _cached: null,
    _cached2: null,

    _randomName: function () {
        return "球友" + (1000 + Math.floor(Math.random() * 9000));
    },

    // 规整 + 按「字符」截断。
    // 直接 slice(0, 10) 有两个坑：会把 emoji 的代理对劈成半个显示成方块；
    // 也不会处理换行和连续空格（showModal 里可以粘贴多行文本）。
    _clip: function (text) {
        if (text === null || text === undefined) {
            return "";
        }
        var s = String(text)
            .replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (!s) {
            return "";
        }

        // Array.from 按码点切分，基础库不支持时退回 split（此时 emoji 可能被截断，但不会报错）
        var chars;
        if (typeof Array.from === "function") {
            chars = Array.from(s);
        } else {
            chars = s.split("");
        }
        if (chars.length > this.LIMIT) {
            chars.length = this.LIMIT;
        }
        return chars.join("");
    },

    _read: function (key) {
        try {
            return wx.getStorageSync(key) || "";
        } catch (e) {
            return "";
        }
    },

    _write: function (key, value) {
        try {
            wx.setStorageSync(key, value);
        } catch (e) { }
    },

    // 本机玩家昵称：没有就用随机名并立刻落盘，保证重启后不变
    get: function () {
        if (this._cached) {
            return this._cached;
        }

        var stored = this._clip(this._read(this.STORAGE_KEY));
        if (!stored) {
            stored = this._randomName();
            this._write(this.STORAGE_KEY, stored);
        }

        this._cached = stored;
        return this._cached;
    },

    // 返回最终生效的名字（空输入不覆盖原值）
    set: function (name) {
        var value = this._clip(name);
        if (!value) {
            return this.get();
        }
        this._cached = value;
        this._write(this.STORAGE_KEY, value);
        return value;
    },

    // 同机双人对战的第二位玩家；没设过就用默认名，不随机、不立刻落盘
    getSecond: function () {
        if (this._cached2) {
            return this._cached2;
        }
        var stored = this._clip(this._read(this.STORAGE_KEY_2)) || this.DEFAULT_SECOND;
        this._cached2 = stored;
        return this._cached2;
    },

    setSecond: function (name) {
        var value = this._clip(name);
        if (!value) {
            return this.getSecond();
        }
        this._cached2 = value;
        this._write(this.STORAGE_KEY_2, value);
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
            placeholderText: "最多 " + this.LIMIT + " 个字",
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
