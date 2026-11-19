
// 原版 Button 为图片按钮（英文素材）；汉化后菜单主要用下方的 TextButton
// （Canvas 绘制的圆角矩形 + 中文文字），静音按钮仍用图标素材。

function Button(sprite, position, callback, hoverSprite) {

    this.sprite = sprite;
    this.hoverSprite = hoverSprite ? hoverSprite : sprite;
    this.position = position;
    this.callback = callback;
}

// 原版 hover 时设置 canvas.style.cursor —— 小游戏无 DOM，已移除；
// 触屏按下时落在按钮范围内即显示 hover 高亮图。
Button.prototype.draw = function () {

    if (this.mouseInsideBorders()) {
        Canvas2D.drawImage(this.hoverSprite, this.position, 0, 1);
    }
    else {
        Canvas2D.drawImage(this.sprite, this.position, 0, 0.98);
    }
}

Button.prototype.handleInput = function () {

    if (Mouse.left.pressed && this.mouseInsideBorders()) {
        this.callback();
    }
}

// 命中检测拆出来，供「点击队列」统一判定（不依赖某一帧恰好读到 pressed）
Button.prototype.hitTest = function (p) {

    if (!p) {
        return false;
    }

    return p.x > this.position.x
        && p.x < this.position.x + this.sprite.width
        && p.y > this.position.y
        && p.y < this.position.y + this.sprite.height;
};

Button.prototype.mouseInsideBorders = function () {

    mousePos = Mouse.position;

    if (mousePos.x > this.position.x
        &&
        mousePos.x < this.position.x + this.sprite.width
        &&
        mousePos.y > this.position.y
        &&
        mousePos.y < this.position.y + this.sprite.height
    ) {
        return true;
    }

    return false;
}

// ---------- 文字按钮（汉化用） ----------

// 统一绘制的圆角按钮底板 + 文字
// 深色台球桌背景上纯黑底板几乎不可见，所以用「浅色描边 + 深色内芯」的双层矩形
Button.drawBox = function (text, pos, size, hover, fontsize) {
    var rim = hover ? "#7fb2ff" : "rgba(255,255,255,0.42)";
    var bg = hover ? "#2f6fed" : "rgba(10,18,26,0.90)";

    // 文案过长（例如昵称占满 10 个字）时自动缩字号，避免文字溢出按钮
    var fs = fontsize;
    var maxW = size.x - 44;
    while (fs > 16 && Canvas2D.measureText(text, fs, "sans-serif") > maxW) {
        fs -= 2;
    }

    Canvas2D.fillRect(pos.x - 2, pos.y - 2, size.x + 4, size.y + 4, rim, 18);
    Canvas2D.fillRect(pos.x, pos.y, size.x, size.y, bg, 16);
    Canvas2D.drawText(
        text,
        new Vector2(pos.x + size.x / 2, pos.y + size.y / 2),
        new Vector2(0, fs * 0.55),
        "#ffffff",
        "center",
        "sans-serif",
        fs + "px"
    );
};

Button.boxContains = function (pos, size, p) {
    return p.x > pos.x && p.x < pos.x + size.x &&
        p.y > pos.y && p.y < pos.y + size.y;
};

function TextButton(text, position, callback, size, fontsize) {
    this.text = text;
    this.position = position;
    this.size = size || new Vector2(440, 110);
    this.callback = callback;
    this.fontsize = fontsize || 44;
}

TextButton.prototype.mouseInsideBorders = function () {
    return Button.boxContains(this.position, this.size, Mouse.position);
};

TextButton.prototype.hitTest = function (p) {
    return Button.boxContains(this.position, this.size, p);
};

TextButton.prototype.draw = function () {
    var hover = Mouse.left.down && this.mouseInsideBorders();
    Button.drawBox(this.text, this.position, this.size, hover, this.fontsize);
};

TextButton.prototype.handleInput = function () {
    if (Mouse.left.pressed && this.mouseInsideBorders()) {
        this.callback();
    }
};

GameGlobal.Button = Button;
GameGlobal.TextButton = TextButton;
