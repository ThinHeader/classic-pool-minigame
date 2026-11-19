"use strict";

// 微信广告接入模块（Banner / 插屏 / 激励视频）
//
// 上线前 3 步：
//   1) mp.weixin.qq.com 小游戏后台 → 流量主 → 开通（需要一定累计注册用户）
//   2) 流量主 → 广告位管理 → 分别创建 Banner / 插屏 / 激励视频 广告位
//   3) 把下面的 ID 替换为真实 adunit-xxx，即可生效（未替换时本模块自动空转，不影响游戏）
//
// 接入位置：
//   - Banner：主菜单/暂停菜单底部展示，进入对局自动隐藏（Menu.load / Game.startNewGame / Game.continueGame）
//   - 插屏：每盘结束（黑球落袋结算）时展示，内置 60s 最小间隔防刷屏
//   - 激励视频：暂停菜单「看广告重新开局」按钮，完整观看后重摆棋盘

var AdConfig = {
    bannerId: "adunit-请替换成你的Banner广告位ID",
    interstitialId: "adunit-请替换成你的插屏广告位ID",
    rewardedVideoId: "adunit-请替换成你的激励视频广告位ID",
    interstitialMinInterval: 60000 // 插屏广告最小展示间隔（毫秒）
};

function Ad_Singleton() {
    this._banner = null;
    this._interstitial = null;
    this._rewarded = null;
    this._rewardCb = null;
    this._lastInterstitialAt = 0;
}

// 广告位 ID 是否已配置真实值
Ad_Singleton.prototype._ready = function () {
    return typeof wx !== "undefined" &&
        typeof wx.createBannerAd === "function" &&
        AdConfig.bannerId.indexOf("请替换") === -1 &&
        AdConfig.interstitialId.indexOf("请替换") === -1 &&
        AdConfig.rewardedVideoId.indexOf("请替换") === -1;
};

// ---------- Banner 广告（菜单页底部） ----------
Ad_Singleton.prototype.showBanner = function () {
    if (!this._ready()) return;
    try {
        this.hideBanner();
        var info = wx.getSystemInfoSync();
        var self = this;
        // Banner 宽度缩放范围 300~屏幕宽度，高度按比例自动计算
        var banner = wx.createBannerAd({
            adUnitId: AdConfig.bannerId,
            style: {
                x: 0, left: 0,
                y: info.windowHeight - 130, top: info.windowHeight - 130,
                width: info.windowWidth
            }
        });
        banner.onError(function (err) {
            console.log("[Ad] Banner 加载失败（体验版无广告/流量主未开通）", err);
            try { banner.destroy(); } catch (e) { }
            if (self._banner === banner) self._banner = null;
        });
        banner.onResize(function (res) {
            // 按真实高度贴底展示
            try { banner.style.y = info.windowHeight - res.height - 6; } catch (e) { }
        });
        banner.show().catch(function (err) {
            console.log("[Ad] Banner 展示失败", err);
        });
        this._banner = banner;
    } catch (e) {
        console.log("[Ad] Banner 创建异常", e);
    }
};

Ad_Singleton.prototype.hideBanner = function () {
    if (this._banner) {
        try { this._banner.destroy(); } catch (e) { }
        this._banner = null;
    }
};

// ---------- 插屏广告（一盘结束结算时） ----------
Ad_Singleton.prototype.showInterstitial = function () {
    if (!this._ready()) return;

    var now = Date.now();
    if (now - this._lastInterstitialAt < AdConfig.interstitialMinInterval)
        return; // 频控：间隔不足直接跳过
    this._lastInterstitialAt = now;

    try {
        var self = this;
        if (!this._interstitial) {
            this._interstitial = wx.createInterstitialAd({
                adUnitId: AdConfig.interstitialId
            });
            this._interstitial.onError(function (err) {
                console.log("[Ad] 插屏广告出错", err);
            });
        }
        this._interstitial.load().then(function () {
            self._interstitial.show().catch(function (err) {
                console.log("[Ad] 插屏展示失败（平台频控或无广告填充）", err);
            });
        }).catch(function (err) {
            console.log("[Ad] 插屏加载失败", err);
        });
    } catch (e) {
        console.log("[Ad] 插屏创建异常", e);
    }
};

// ---------- 激励视频广告（看广告重新开局） ----------
// 注意：RewardedVideoAd 是全局单例，onClose 只注册一次，
// 回调分发通过 _rewardCb 完成，避免重复注册导致多次触发。
Ad_Singleton.prototype.showRewardedVideo = function (onRewarded, onSkip) {
    if (!this._ready()) {
        console.log("[Ad] 广告位 ID 未配置，跳过激励视频");
        if (onSkip) onSkip();
        return;
    }
    try {
        var self = this;
        if (!this._rewarded) {
            this._rewarded = wx.createRewardedVideoAd({
                adUnitId: AdConfig.rewardedVideoId
            });
            this._rewarded.onError(function (err) {
                console.log("[Ad] 激励视频出错", err);
            });
            this._rewarded.onClose(function (res) {
                var cbs = self._rewardCb;
                self._rewardCb = null;
                if (!cbs) return;
                if (res && (res.isEnded || res.isEnded === undefined)) {
                    cbs.reward && cbs.reward(); // 完整观看才发奖
                } else {
                    cbs.skip && cbs.skip();     // 中途关闭不发奖
                }
            });
        }
        this._rewardCb = { reward: onRewarded, skip: onSkip };
        this._rewarded.show().catch(function (err) {
            console.log("[Ad] 激励视频展示失败，尝试重新加载", err);
            self._rewarded.load().then(function () {
                return self._rewarded.show();
            }).catch(function (err2) {
                console.log("[Ad] 激励视频重新加载失败", err2);
                var cbs = self._rewardCb;
                self._rewardCb = null;
                cbs && cbs.skip && cbs.skip();
            });
        });
    } catch (e) {
        console.log("[Ad] 激励视频创建异常", e);
        if (onSkip) onSkip();
    }
};

var Ad = new Ad_Singleton();
GameGlobal.Ad = Ad;
