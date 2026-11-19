"use strict";

// 原版从 index.html 里取 <canvas id="screen"> 并依赖 window.onresize + CSS 布局。
// 微信小游戏无 DOM：第一块 wx.createCanvas() 画布即屏幕画布，
// 这里按屏幕像素创建画布，并把 1500x825 的设计分辨率等比缩放、letterbox 居中。

function Canvas2D_Singleton() {
    this._canvas = null;
    this._canvasContext = null;
    this._viewScale = 1;
    this._viewOffset = Vector2.zero;
    this._dpr = 1;
    this._winW = 1;
    this._winH = 1;
}

// 画布像素上限：低端安卓 dpr 可达 3，若按 3 倍建画布（约 2400x1100）
// 每帧全屏 clear 就会明显掉帧，台球这种实时物理游戏会拖到「点了没反应」。
// 限制总像素量，超了就等比缩小 dpr。
Canvas2D_Singleton.MAX_PIXELS = 2600 * 1200;

Object.defineProperty(Canvas2D_Singleton.prototype, "offset",
    {
        get: function () {
            return this._viewOffset;
        }
    });

Object.defineProperty(Canvas2D_Singleton.prototype, "scale",
    {
        get: function () {
            return this._viewScale;
        }
    });

Canvas2D_Singleton.prototype.initialize = function () {
    var info = wx.getSystemInfoSync();

    // 逻辑窗口尺寸：触摸事件的 clientX/clientY 用的就是这套单位
    this._winW = Math.max(1, Math.round(info.windowWidth || info.screenWidth || 1));
    this._winH = Math.max(1, Math.round(info.windowHeight || info.screenHeight || 1));

    this._dpr = Math.min(info.pixelRatio || 2, 2);
    // 像素量超限则下调 dpr（保底 1），避免大屏手机上画布过大拖慢物理帧
    while (this._dpr > 1 && this._winW * this._winH * this._dpr * this._dpr > this.MAX_PIXELS) {
        this._dpr = this._dpr - 0.25;
    }
    if (this._dpr < 1) {
        this._dpr = 1;
    }

    this._canvas = wx.createCanvas();
    this._canvas.width = Math.round(this._winW * this._dpr);
    this._canvas.height = Math.round(this._winH * this._dpr);
    this._canvasContext = this._canvas.getContext("2d");

    this.resize();

    // 折叠屏 / 分屏 / 旋转时窗口会变，画布跟着重建，否则触摸坐标会整体偏移
    var self = this;
    if (typeof wx.onWindowResize === "function") {
        wx.onWindowResize(function (res) {
            try {
                if (res && res.size) {
                    self._winW = Math.max(1, Math.round(res.size.windowWidth || self._winW));
                    self._winH = Math.max(1, Math.round(res.size.windowHeight || self._winH));
                }
                self._canvas.width = Math.round(self._winW * self._dpr);
                self._canvas.height = Math.round(self._winH * self._dpr);
                self.resize();
            } catch (e) { }
        });
    }
};

// 设计分辨率（Game.size）到屏幕画布的等比缩放 + 居中偏移
Canvas2D_Singleton.prototype.resize = function () {
    var scale = Math.min(this._canvas.width / Game.size.x,
        this._canvas.height / Game.size.y);
    this._viewScale = scale;
    this._viewOffset = new Vector2(
        (this._canvas.width - Game.size.x * scale) / 2,
        (this._canvas.height - Game.size.y * scale) / 2
    );
};

// 触摸事件坐标（逻辑像素）-> 游戏逻辑坐标
// 用「比例换算」而不是直接乘 dpr：即使某机型给的是物理像素或竖屏坐标，
// 这里也能靠越界检测自动纠正，不会出现「手指在按钮上但点不中」。
Canvas2D_Singleton.prototype.toGamePosition = function (clientX, clientY) {
    var gx = clientX;
    var gy = clientY;

    if (gx > this._winW * 1.02 || gy > this._winH * 1.02) {
        if (gx / this._dpr <= this._winW * 1.02 && gy / this._dpr <= this._winH * 1.02) {
            gx = gx / this._dpr;
            gy = gy / this._dpr;
        } else if (gx <= this._winH * 1.02 && gy <= this._winW * 1.02) {
            var swap = gx;
            gx = gy;
            gy = swap;
        }
    }

    var sx = gx / this._winW * this._canvas.width;
    var sy = gy / this._winH * this._canvas.height;

    return new Vector2(
        (sx - this._viewOffset.x) / this._viewScale,
        (sy - this._viewOffset.y) / this._viewScale
    );
};

// 微信右上角胶囊按钮（「…」/「✕ 关闭」）在设计坐标下的矩形。
// 胶囊是小游戏系统层浮在画布之上的 UI，游戏自己画的东西如果压在它下面，
// 会出现「菜单」按钮被胶囊啃掉一半的情况，所以上层要按这个矩形主动让位。
// 浏览器预览 / 测试桩没有胶囊时返回 null，调用方沿用默认位置。
Canvas2D_Singleton.prototype.getCapsuleRect = function () {
    if (typeof wx === "undefined" || !wx ||
        typeof wx.getMenuButtonBoundingClientRect !== "function") {
        return null;
    }

    var r;
    try {
        r = wx.getMenuButtonBoundingClientRect();
    } catch (e) {
        return null;
    }

    if (!r || !(r.width > 0) || !(r.height > 0) || !(r.left >= 0)) {
        return null;
    }

    // 胶囊给的是逻辑像素（与 windowWidth 同一套单位），先换成画布像素再反算设计坐标，
    // 这样 dpr 和 letterbox 偏移都能自动吃掉
    var sx = this._canvas.width / this._winW;
    var sy = this._canvas.height / this._winH;

    var left = (r.left * sx - this._viewOffset.x) / this._viewScale;
    var top = (r.top * sy - this._viewOffset.y) / this._viewScale;
    var width = (r.width * sx) / this._viewScale;
    var height = (r.height * sy) / this._viewScale;

    return {
        left: left,
        top: top,
        right: left + width,
        bottom: top + height,
        width: width,
        height: height
    };
};

Canvas2D_Singleton.prototype.clear = function () {
    this._canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    this._canvasContext.clearRect(0, 0, this._canvas.width, this._canvas.height);
};

Canvas2D_Singleton.prototype.drawImage = function (sprite, position, rotation, scale, origin) {
    var ctx = this._canvasContext;

    position = typeof position !== "undefined" ? position : Vector2.zero;
    rotation = typeof rotation !== "undefined" ? rotation : 0;
    scale = typeof scale !== "undefined" ? scale : 1;
    origin = typeof origin !== "undefined" ? origin : Vector2.zero;

    ctx.save();
    ctx.translate(this._viewOffset.x, this._viewOffset.y);
    ctx.scale(this._viewScale, this._viewScale);
    ctx.translate(position.x, position.y);
    ctx.rotate(rotation);
    ctx.drawImage(sprite, 0, 0,
        sprite.width, sprite.height,
        -origin.x * scale, -origin.y * scale,
        sprite.width * scale, sprite.height * scale);
    ctx.restore();
};

// 绘制圆角矩形（游戏逻辑坐标系），用于中文按钮等 UI
Canvas2D_Singleton.prototype.fillRect = function (x, y, w, h, color, radius) {
    var ctx = this._canvasContext;
    ctx.save();
    ctx.translate(this._viewOffset.x, this._viewOffset.y);
    ctx.scale(this._viewScale, this._viewScale);
    ctx.fillStyle = color;
    if (radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
};

// 程序化绘制一颗台球：实心球 / 花色球（白底 + 横带）/ 中间白圈 + 球号
// 用代码绘制而不是贴图，球号清晰可辨，也省掉 4 张球的位图
Canvas2D_Singleton.prototype.drawPoolBall = function (position, radius, color, isStripe, number) {
    var ctx = this._canvasContext;

    ctx.save();
    ctx.translate(this._viewOffset.x, this._viewOffset.y);
    ctx.scale(this._viewScale, this._viewScale);
    ctx.translate(position.x, position.y);

    // 球体底色（花色球为白底）
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();

    ctx.fillStyle = isStripe ? "#FFFFFF" : color;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

    if (isStripe) {
        ctx.fillStyle = color;
        ctx.fillRect(-radius, -radius * 0.60, radius * 2, radius * 1.20);
    }

    // 左上高光 + 右下暗部（两层纯色，避免逐帧建渐变）
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.beginPath();
    ctx.arc(-radius * 0.32, -radius * 0.34, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.arc(radius * 0.30, radius * 0.36, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 轮廓
    ctx.beginPath();
    ctx.arc(0, 0, radius - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 球号白圈
    if (number > 0) {
        var inner = radius * 0.56;
        ctx.beginPath();
        ctx.arc(0, 0, inner, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        ctx.fillStyle = "#101010";
        ctx.font = "500 " + (inner * 1.25).toFixed(1) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(number), 0, 0.5);
    }

    ctx.restore();
};

// 空心圆环（自由球可放置提示、选中高亮等）
Canvas2D_Singleton.prototype.drawRing = function (position, radius, color, lineWidth) {
    var ctx = this._canvasContext;

    ctx.save();
    ctx.translate(this._viewOffset.x, this._viewOffset.y);
    ctx.scale(this._viewScale, this._viewScale);
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 2;
    ctx.stroke();
    ctx.restore();
};

// 量一段文字的宽度（设计分辨率下的像素），用于把底部状态条包成自适应宽度
Canvas2D_Singleton.prototype.measureText = function (text, fontsize, fontname) {
    var ctx = this._canvasContext;
    var str = String(text);
    var size = fontsize || 20;

    ctx.save();
    ctx.font = size + "px " + (fontname || "sans-serif");
    var m = ctx.measureText ? ctx.measureText(str) : null;
    ctx.restore();

    if (m && typeof m.width === "number") {
        return m.width;
    }

    // 兜底（无 measureText 的环境 / 测试桩）：全角按整字宽，半角按 0.55 字宽
    var w = 0;
    for (var i = 0; i < str.length; i++) {
        w += str.charCodeAt(i) > 0x2E80 ? size : size * 0.55;
    }
    return w;
};

Canvas2D_Singleton.prototype.drawText = function (text, position, origin, color, textAlign, fontname, fontsize) {
    var ctx = this._canvasContext;

    position = typeof position !== "undefined" ? position : Vector2.zero;
    origin = typeof origin !== "undefined" ? origin : Vector2.zero;
    color = typeof color !== "undefined" ? color : Color.black;
    textAlign = typeof textAlign !== "undefined" ? textAlign : "top";
    fontname = typeof fontname !== "undefined" ? fontname : "sans-serif";
    fontsize = typeof fontsize !== "undefined" ? fontsize : "20px";

    ctx.save();
    ctx.translate(this._viewOffset.x, this._viewOffset.y);
    ctx.scale(this._viewScale, this._viewScale);
    ctx.translate(position.x - origin.x, position.y - origin.y);
    ctx.textBaseline = "top";
    ctx.font = fontsize + " " + fontname;
    ctx.fillStyle = color.toString();
    ctx.textAlign = textAlign;
    ctx.fillText(text, 0, 0);
    ctx.restore();
};

var Canvas2D = new Canvas2D_Singleton();
GameGlobal.Canvas2D = Canvas2D;
