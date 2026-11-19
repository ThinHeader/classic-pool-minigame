"use strict";

// 原版基于 document.onmousemove/mousedown/mouseup，微信小游戏无 DOM、
// 无鼠标，替换为 wx.onTouchStart/Move/End，并保持 Mouse 抽象层接口不变：
//   Mouse.left.down    = 手指是否按住屏幕
//   Mouse.left.pressed = 本帧是否有新的按下（每帧在 Mouse.reset() 中清零）
//   Mouse.position     = 当前触点对应的游戏逻辑坐标（1500x825 设计分辨率）
//
// 真机适配要点（这些差异是「模拟器能点、手机上点不动」的常见根因）：
//   1) 不同基础库 / 机型上触点字段名不一致：clientX、pageX、x 至少要兜住
//   2) changedTouches 可能为空，此时退回 touches[0]
//   3) touchend 也要把 down 复位，否则 iOS 上漏一次 end 会让手指状态永久「按住」
//   4) 点击改成事件队列（_taps），不依赖某帧恰好读到 pressed，
//      避免 rAF 卡顿 / 后台切回时点按被吞

function readTouch(evt) {
    if (!evt) {
        return null;
    }
    var list = evt.changedTouches;
    if (!list || !list.length) {
        list = evt.touches;
    }
    if (!list || !list.length) {
        return null;
    }
    return list[0];
}

function touchX(touch) {
    if (typeof touch.clientX === "number") return touch.clientX;
    if (typeof touch.pageX === "number") return touch.pageX;
    if (typeof touch.x === "number") return touch.x;
    return 0;
}

function touchY(touch) {
    if (typeof touch.clientY === "number") return touch.clientY;
    if (typeof touch.pageY === "number") return touch.pageY;
    if (typeof touch.y === "number") return touch.y;
    return 0;
}

function updateTouchPosition(touch) {
    var gx = touchX(touch);
    var gy = touchY(touch);
    Mouse._rawX = gx;
    Mouse._rawY = gy;
    Mouse._position = Canvas2D.toGamePosition(gx, gy);
}

// 首触点的原始坐标只记一次，出问题时屏幕上能看到环境真实返回值
function noteFirstTouch(touch) {
    if (Mouse._loggedFirstTouch) {
        return;
    }
    Mouse._loggedFirstTouch = true;
    Diag.log("触点 " + Math.round(touchX(touch)) + "," + Math.round(touchY(touch))
        + " 屏 " + Math.round(Canvas2D._winW) + "x" + Math.round(Canvas2D._winH)
        + " 画布 " + Canvas2D._canvas.width + "x" + Canvas2D._canvas.height);
}

function handleTouchStart(evt) {
    // 多指按下时只处理第一根手指的按下，避免第二个触点把球杆甩飞
    if (Mouse._left.down) {
        return;
    }
    var touch = readTouch(evt);
    if (!touch) return;

    updateTouchPosition(touch);
    noteFirstTouch(touch);

    Mouse._left.down = true;
    Mouse._left.pressed = true;
    Mouse._pushTap(Mouse._position);
}

function handleTouchMove(evt) {
    var touch = readTouch(evt);
    if (!touch) return;
    updateTouchPosition(touch);
}

function handleTouchEnd(evt) {
    var touch = readTouch(evt);
    if (touch) updateTouchPosition(touch);
    Mouse._left.down = false;
    Mouse._left.released = true;
}

function Mouse_Singleton() {
    this._position = Vector2.zero;
    this._left = new ButtonState();
    this._middle = new ButtonState();
    this._right = new ButtonState();
    this._taps = [];
    this._rawX = 0;
    this._rawY = 0;
    this._loggedFirstTouch = false;

    wx.onTouchStart(handleTouchStart);
    wx.onTouchMove(handleTouchMove);
    wx.onTouchEnd(handleTouchEnd);
    wx.onTouchCancel(handleTouchEnd);
}

Object.defineProperty(Mouse_Singleton.prototype, "left",
    {
        get: function () {
            return this._left;
        }
    });

Object.defineProperty(Mouse_Singleton.prototype, "position",
    {
        get: function () {
            return this._position;
        }
    });

Mouse_Singleton.prototype._pushTap = function (pos) {
    // 只保留最近 3 次，防止某段时间没人消费导致点击堆积后连续误触发
    if (this._taps.length > 2) {
        this._taps.shift();
    }
    this._taps.push(new Vector2(pos.x, pos.y));
};

// 取出一个待处理点击（无则返回 undefined）
Mouse_Singleton.prototype.consumeTap = function () {
    return this._taps.shift();
};

Mouse_Singleton.prototype.clearTaps = function () {
    this._taps.length = 0;
};

Mouse_Singleton.prototype.reset = function () {
    this._left.pressed = false;
    this._left.released = false;
    this._middle.pressed = false;
    this._right.pressed = false;
};

Mouse_Singleton.prototype.containsMouseDown = function (rect) {
    return this._left.down && rect.contains(this._position);
};

Mouse_Singleton.prototype.containsMousePress = function (rect) {
    return this._left.pressed && rect.contains(this._position);
};

var Mouse = new Mouse_Singleton();
GameGlobal.Mouse = Mouse;
