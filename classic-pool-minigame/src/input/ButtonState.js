"use strict";

function ButtonState() {
    this.down = false;
    this.pressed = false;   // 本帧新按下
    this.released = false;  // 本帧刚抬起（用于「松手才放置白球」）
}
GameGlobal.ButtonState = ButtonState;
