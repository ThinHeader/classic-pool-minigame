"use strict";

// 好友对战大厅：创建房间 / 输码加入 / 等待对手。
// 复用主菜单的菜单容器（Game.mainMenu），动态替换 labels 与 buttons，
// 避免再写一套渲染循环。

var Lobby = {
    state: "home",
    code: "",
    input: "",
    hint: ""
};

Lobby.apply = function (labels, buttons) {
    Game.mainMenu.labels = labels;
    Game.mainMenu.buttons = buttons;
    Mouse.reset();
};

Lobby.title = function (text) {
    return new Label(text, new Vector2(100, 0), Vector2.zero, "white",
        "left", "sans-serif", "90px");
};

Lobby.line = function (text, y, size, color) {
    return new Label(text, new Vector2(100, y), Vector2.zero, color || "#DFF3E6",
        "left", "sans-serif", (size || 34) + "px");
};

Lobby.open = function () {
    Lobby.state = "home";
    Lobby.input = "";
    Lobby.hint = "正在连接服务器…";

    Lobby.showHome();

    Net.connect(function () {
        Lobby.hint = "";
        if (Lobby.state === "home") {
            Lobby.showHome();
        }
    });
};

Lobby.backToMain = function () {
    Net.leave();
    Game.mainMenu.labels = generateMainMenuLabels("经典8球台球");
    Game.mainMenu.buttons = generateMainMenuButtons(false);
    Mouse.reset();
};

Lobby.showHome = function () {
    Lobby.state = "home";

    var labels = [
        Lobby.title("好友对战"),
        Lobby.line("和好友用同一房间码实时对战，服务器裁决每一杆", 200, 34),
        Lobby.line(Lobby.hint, 260, 30, "#FFD479")
    ];

    var buttons = [
        new TextButton("创建房间", new Vector2(200, 340), function () {
            if (!Net.connected) {
                Lobby.hint = "还没连上服务器，请稍候再试";
                Lobby.showHome();
                return;
            }
            Net.createRoom();
            Lobby.hint = "创建中…";
            Lobby.showHome();
        }),
        new TextButton("加入房间", new Vector2(200, 500), function () {
            Lobby.showEnter();
        }),
        new TextButton("返回", new Vector2(200, 660), function () {
            Lobby.backToMain();
        }, new Vector2(280, 100), 40),
        muteButtonFactory()
    ];

    Lobby.apply(labels, buttons);
};

Lobby.onRoom = function (code, seat) {
    if (Lobby.state === "enter") {
        // 加入成功：等服务器下发 start
        Lobby.hint = "已加入房间 " + code + "，等待开局…";
        Lobby.showEnter(true);
        return;
    }

    Lobby.code = code;
    Lobby.showWaiting(code);
};

Lobby.showWaiting = function (code) {
    Lobby.state = "waiting";
    Lobby.code = code;

    var labels = [
        Lobby.title("等待对手"),
        Lobby.line("房间码", 220, 36),
        new Label(code, new Vector2(100, 270), Vector2.zero, "#FFD479",
            "left", "sans-serif", "150px"),
        Lobby.line("把房间码告诉好友，或点下面直接分享给他", 470, 30)
    ];

    var buttons = [
        new TextButton("分享给好友", new Vector2(200, 540), function () {
            wx.shareAppMessage({
                title: "房号 " + Lobby.code + "，来打一局台球",
                query: "room=" + Lobby.code
            });
        }, new Vector2(400, 100), 40),
        new TextButton("复制房间码", new Vector2(200, 660), function () {
            wx.setClipboardData({
                data: Lobby.code,
                success: function () {
                    wx.showToast({ title: "房间码已复制", icon: "none" });
                }
            });
        }, new Vector2(400, 100), 40),
        new TextButton("取消", new Vector2(700, 660), function () {
            Net.leave();
            Lobby.showHome();
        }, new Vector2(280, 100), 40),
        muteButtonFactory()
    ];

    Lobby.apply(labels, buttons);
};

// 数字键盘加入房间
Lobby.showEnter = function (alreadyJoined) {
    Lobby.state = "enter";

    var labels = [
        Lobby.title(alreadyJoined ? "加入房间" : "输入房间码"),
        new Label(Lobby.input || "____", new Vector2(100, 200), Vector2.zero, "#FFD479",
            "left", "sans-serif", "110px")
    ];

    if (Lobby.hint) {
        labels.push(Lobby.line(Lobby.hint, 320, 28, "#FFD479"));
    }

    var buttons = [];
    var startX = 420, startY = 340, keyW = 120, keyH = 100, gap = 20;

    for (var i = 1; i <= 9; i++) {
        var col = (i - 1) % 3;
        var row = Math.floor((i - 1) / 3);
        buttons.push(Lobby.keyButton(String(i),
            startX + col * (keyW + gap), startY + row * (keyH + gap), keyW, keyH));
    }

    buttons.push(Lobby.keyButton("0",
        startX + keyW + gap, startY + 3 * (keyH + gap), keyW, keyH));

    buttons.push(new TextButton("删除", new Vector2(startX + 3 * (keyW + gap) + 30, startY),
        function () {
            Lobby.input = Lobby.input.slice(0, -1);
            Lobby.hint = "";
            Lobby.showEnter(alreadyJoined);
        }, new Vector2(160, 100), 34));

    buttons.push(new TextButton("加入", new Vector2(startX + 3 * (keyW + gap) + 30, startY + 130),
        function () {
            if (Lobby.input.length < 4) {
                Lobby.hint = "请输入 4 位房间码";
                Lobby.showEnter(alreadyJoined);
                return;
            }
            if (!Net.connected) {
                Lobby.hint = "还没连上服务器，请稍候再试";
                Lobby.showEnter(alreadyJoined);
                return;
            }
            Net.joinRoom(Lobby.input);
            Lobby.hint = "正在加入…";
            Lobby.showEnter(alreadyJoined);
        }, new Vector2(160, 100), 34));

    buttons.push(new TextButton("返回", new Vector2(startX + 3 * (keyW + gap) + 30, startY + 260),
        function () {
            Lobby.hint = "";
            Lobby.showHome();
        }, new Vector2(160, 100), 30));

    buttons.push(muteButtonFactory());

    Lobby.apply(labels, buttons);
};

Lobby.keyButton = function (digit, x, y, w, h) {
    return new TextButton(digit, new Vector2(x, y), function () {
        if (Lobby.input.length >= 4) return;
        Lobby.input += digit;
        Lobby.hint = "";
        Lobby.showEnter(Lobby.state === "enter" && Lobby.hint.indexOf("等待开局") >= 0);
    }, new Vector2(w, h), 52);
};

// 从分享卡片进入时携带的房间码
Lobby.consumeLaunchRoom = function () {
    try {
        var opts = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
        var room = opts && opts.query && opts.query.room;
        if (room) {
            return String(room);
        }
    } catch (e) {
        console.warn("[Lobby] 读取启动参数失败", e);
    }
    return null;
};

Lobby.joinFromLaunch = function (code) {
    Lobby.input = String(code).slice(0, 4);
    Lobby.hint = "正在加入房间 " + Lobby.input + "…";
    Lobby.state = "enter";

    Net.connect(function () {
        Net.joinRoom(Lobby.input);
        Game.mainMenu.labels = [
            Lobby.title("加入房间"),
            Lobby.line("房间码 " + Lobby.input, 200, 90, "#FFD479"),
            Lobby.line("正在加入…", 330, 32)
        ];
    });
};

GameGlobal.Lobby = Lobby;
