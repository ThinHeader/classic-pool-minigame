/**
 * 微信小游戏 wx API 的浏览器模拟层（仅供本地预览调试，不参与小游戏打包）
 *
 * 目标：让 classic-pool-minigame 里的代码一行不改就能在桌面浏览器里跑。
 * 映射关系：
 *   wx.createCanvas()            -> 页面里那张铺满视口的 <canvas id="game">
 *   wx.getSystemInfoSync()       -> 视口尺寸 + devicePixelRatio
 *   wx.createImage()             -> new Image()（相对路径可直接命中 pkgAssets）
 *   wx.createInnerAudioContext() -> HTMLAudioElement 封装（volume/loop/autoplay/onEnded）
 *   wx.onTouchStart/Move/End     -> Pointer Event（鼠标与触摸都能用）
 *   wx.connectSocket()           -> WebSocket
 *   wx.loadSubpackage()          -> 直接成功（资源本来就在本地目录）
 */
(function () {
    'use strict';

    var canvas = document.getElementById('game');
    var toastEl = document.getElementById('toast');
    var toastTimer = null;

    function sysInfo() {
        return {
            windowWidth: Math.max(1, Math.round(window.innerWidth)),
            windowHeight: Math.max(1, Math.round(window.innerHeight)),
            screenWidth: Math.max(1, Math.round(window.innerWidth)),
            screenHeight: Math.max(1, Math.round(window.innerHeight)),
            pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
            platform: 'devtools',
            system: navigator.userAgent,
            safeArea: {
                top: 0, left: 0,
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    }

    // ---------- 提示 ----------
    function showToast(options) {
        var title = (options && options.title) || '';
        if (!toastEl) return;
        toastEl.textContent = title;
        toastEl.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toastEl.classList.remove('show');
        }, options && options.duration ? Math.max(1200, options.duration) : 1800);
    }

    // ---------- 音频 ----------
    // 浏览器的自动播放策略会拒绝未经用户手势的 play()，
    // 这里把失败的实例排队，等第一次点击/触摸时统一重放。
    var pendingAudio = [];

    function flushAudio() {
        var list = pendingAudio.slice();
        pendingAudio.length = 0;
        list.forEach(function (el) {
            // 用户已经操作过，这时候才允许把音乐真正下载下来
            if (el.preload === 'none') el.preload = 'auto';
            var p = el.play();
            if (p && p.catch) {
                p.catch(function () { /* 仍然被拒就放弃，不打断游戏 */ });
            }
        });
    }

    function InnerAudioContext() {
        var self = this;
        var el = new Audio();
        el.preload = 'auto';

        this._el = el;
        this._volume = 1;
        this._loop = false;
        this._autoplay = false;
        this._onEnded = null;
        this._onError = null;
        this._destroyed = false;

        el.addEventListener('ended', function () {
            if (!self._destroyed && self._onEnded) self._onEnded();
        });
        el.addEventListener('error', function () {
            if (!self._destroyed && self._onError) {
                self._onError({ errMsg: 'audio error: ' + (el.currentSrc || '') });
            }
        });

        Object.defineProperty(this, 'volume', {
            get: function () { return self._volume; },
            set: function (v) {
                self._volume = v;
                el.volume = Math.max(0, Math.min(1, v));
            }
        });

        Object.defineProperty(this, 'loop', {
            get: function () { return self._loop; },
            set: function (v) {
                self._loop = !!v;
                el.loop = !!v;
            }
        });

        Object.defineProperty(this, 'autoplay', {
            get: function () { return self._autoplay; },
            set: function (v) {
                self._autoplay = !!v;
                if (v && el.src) self.play();
            }
        });

        Object.defineProperty(this, 'src', {
            get: function () { return el.src; },
            set: function (v) {
                el.src = v;
                // 背景音乐有 8.7MB，是首屏体积的大头。线上素材要从 CDN 拉，
                // 让它参与启动阶段的并发下载会把首屏拖到几十秒。
                // 这里先不预取，等用户第一次操作（浏览器本来就要求手势才能播）再说。
                // 音效只有百来 KB，照常即时加载，不影响手感。
                el.preload = /bossa\.mp3$/i.test(String(v)) ? 'none' : 'auto';
                try { el.load(); } catch (e) { }
                if (self._autoplay) self.play();
            }
        });
    }

    InnerAudioContext.prototype.play = function () {
        var el = this._el;
        // 还没轮到音乐：先记下来，等用户第一次操作再加载播放
        if (el.preload === 'none') {
            if (pendingAudio.indexOf(el) === -1) pendingAudio.push(el);
            return undefined;
        }
        el.volume = this._volume;
        el.loop = this._loop;
        var p;
        try {
            p = el.play();
        } catch (e) {
            return undefined;
        }
        if (p && p.catch) {
            p.catch(function () {
                if (pendingAudio.indexOf(el) === -1) pendingAudio.push(el);
            });
        }
        return p;
    };

    InnerAudioContext.prototype.pause = function () {
        try { this._el.pause(); } catch (e) { }
    };

    InnerAudioContext.prototype.stop = function () {
        try {
            this._el.pause();
            this._el.currentTime = 0;
        } catch (e) { }
    };

    InnerAudioContext.prototype.seek = function (t) {
        try { this._el.currentTime = t; } catch (e) { }
    };

    InnerAudioContext.prototype.destroy = function () {
        this._destroyed = true;
        try {
            this._el.pause();
            this._el.removeAttribute('src');
            this._el.load();
        } catch (e) { }
        this._onEnded = null;
        this._onError = null;
    };

    InnerAudioContext.prototype.onEnded = function (cb) { this._onEnded = cb; };
    InnerAudioContext.prototype.offEnded = function () { this._onEnded = null; };
    InnerAudioContext.prototype.onError = function (cb) { this._onError = cb; };
    InnerAudioContext.prototype.offError = function () { this._onError = null; };
    InnerAudioContext.prototype.onPlay = function () { };
    InnerAudioContext.prototype.onPause = function () { };
    InnerAudioContext.prototype.onStop = function () { };

    // ---------- 触摸事件 ----------
    var touchHandlers = { start: [], move: [], end: [], cancel: [] };
    var activePointers = {};

    function dispatch(kind, ev) {
        var list = touchHandlers[kind];
        if (!list || !list.length) return;
        var point = {
            clientX: ev.clientX,
            clientY: ev.clientY,
            pageX: ev.clientX,
            pageY: ev.clientY,
            identifier: ev.pointerId || 0
        };
        var touches = Object.keys(activePointers).map(function (id) {
            return activePointers[id];
        });
        if (!touches.length) touches = [point];
        var payload = {
            touches: touches,
            changedTouches: [point],
            timeStamp: performance.now()
        };
        list.forEach(function (fn) {
            try { fn(payload); } catch (e) { console.error('[wx-shim] touch handler error', e); }
        });
    }

    // Pointer Events：鼠标、触摸、触控笔统一走这套
    canvas.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        activePointers[ev.pointerId] = { clientX: ev.clientX, clientY: ev.clientY, identifier: ev.pointerId };
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) { }
        flushAudio();
        dispatch('start', ev);
    });

    canvas.addEventListener('pointermove', function (ev) {
        if (!(ev.pointerId in activePointers)) return;
        ev.preventDefault();
        activePointers[ev.pointerId] = { clientX: ev.clientX, clientY: ev.clientY, identifier: ev.pointerId };
        dispatch('move', ev);
    });

    function pointerUp(ev) {
        if (ev.pointerId !== undefined && !(ev.pointerId in activePointers)) return;
        if (ev.pointerId !== undefined) delete activePointers[ev.pointerId];
        dispatch('end', ev);
    }

    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', function (ev) {
        if (ev.pointerId !== undefined) delete activePointers[ev.pointerId];
        dispatch('cancel', ev);
    });
    // 指针被浏览器抢走（例如拖到窗口外松手）时兜底
    window.addEventListener('blur', function () {
        activePointers = {};
        dispatch('cancel', { clientX: 0, clientY: 0, pointerId: 0 });
    });

    // ---------- WebSocket ----------
    function connectSocket(options) {
        var url = options && options.url;
        // 本机预览时把线上地址转到本机房间服务；线上（GitHub Pages 等）不做改写，
        // 直接连小游戏共用的 wss://wandou.dongpouu.top/pool
        if (/^wss?:\/\//i.test(url) && /wandou\.dongpouu\.top|8ball\.dongpouu\.top/i.test(url)) {
            var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
            if (isLocal) {
                var proto = location.protocol === 'https:' ? 'wss' : 'ws';
                url = proto + '://' + location.hostname + ':3010/pool';
                console.log('[wx-shim] 联机地址已重写为本地服务：' + url);
            }
        }

        var socket = {
            _onOpen: null,
            _onMessage: null,
            _onClose: null,
            _onError: null
        };
        var ws = null;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            setTimeout(function () {
                if (socket._onError) socket._onError({ errMsg: String(e) });
            }, 0);
            return socket;
        }

        ws.onopen = function () { if (socket._onOpen) socket._onOpen({}); };
        ws.onmessage = function (ev) { if (socket._onMessage) socket._onMessage({ data: ev.data }); };
        ws.onclose = function (ev) {
            if (socket._onClose) socket._onClose({ code: ev.code, reason: ev.reason });
        };
        ws.onerror = function () { if (socket._onError) socket._onError({ errMsg: 'socket error' }); };

        socket.onOpen = function (cb) { socket._onOpen = cb; };
        socket.onMessage = function (cb) { socket._onMessage = cb; };
        socket.onClose = function (cb) { socket._onClose = cb; };
        socket.onError = function (cb) { socket._onError = cb; };
        socket.send = function (opt) {
            if (ws.readyState === 1) ws.send(opt.data);
        };
        socket.close = function () { try { ws.close(); } catch (e) { } };
        return socket;
    }

    // ---------- 键盘（模拟 wx.showKeyboard）----------
    // 小游戏里键盘是系统浮层，这里用页面里的真实 input 顶替：
    // 输入即 onKeyboardInput，回车 = onKeyboardConfirm，失焦 = onKeyboardComplete。
    // 这样浏览器预览也能真正改昵称，自动化验收不用再绕过输入。
    function kbHandlers() {
        if (!window.__wxKeyboardHandlers) {
            window.__wxKeyboardHandlers = { input: [], confirm: [], complete: [] };
        }
        return window.__wxKeyboardHandlers;
    }

    function kbFire(type, value) {
        var list = kbHandlers()[type] || [];
        for (var i = 0; i < list.length; i++) {
            try { list[i]({ value: value }); } catch (e) { }
        }
    }

    function kbInput() {
        if (window.__wxKeyboardInput) {
            return window.__wxKeyboardInput;
        }

        var el = document.createElement('input');
        el.type = 'text';
        el.setAttribute('data-wx-keyboard', '1');
        el.style.cssText = [
            'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
            'width:64%', 'max-width:440px', 'padding:10px 14px', 'font-size:16px',
            'font-family:inherit', 'border-radius:10px', 'border:2px solid #4AA3FF',
            'background:#101B26', 'color:#fff', 'outline:none', 'z-index:99999',
            'box-shadow:0 8px 28px rgba(0,0,0,0.55)'
        ].join(';');

        el.addEventListener('input', function () {
            kbFire('input', el.value);
        });
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                kbFire('confirm', el.value);
                el.blur();
            }
        });
        el.addEventListener('blur', function () {
            kbFire('complete', el.value);
        });

        document.body.appendChild(el);
        window.__wxKeyboardInput = el;
        return el;
    }

    // ---------- 汇总 ----------
    var wx = {
        createCanvas: function () {
            return canvas;
        },
        createOffscreenCanvas: function () {
            return document.createElement('canvas');
        },
        getSystemInfoSync: sysInfo,
        getWindowInfo: sysInfo,
        createImage: function () {
            return new Image();
        },
        createInnerAudioContext: function () {
            return new InnerAudioContext();
        },
        onTouchStart: function (cb) { touchHandlers.start.push(cb); },
        onTouchMove: function (cb) { touchHandlers.move.push(cb); },
        onTouchEnd: function (cb) { touchHandlers.end.push(cb); },
        onTouchCancel: function (cb) { touchHandlers.cancel.push(cb); },
        loadSubpackage: function (opt) {
            // 资源就在同级目录，直接视为加载完成
            setTimeout(function () {
                if (opt && opt.success) opt.success({});
            }, 16);
        },
        showToast: showToast,
        hideToast: function () {
            if (toastEl) toastEl.classList.remove('show');
        },
        showLoading: function () { },
        hideLoading: function () { },
        connectSocket: connectSocket,
        getLaunchOptionsSync: function () {
            var query = {};
            new URLSearchParams(location.search).forEach(function (v, k) {
                query[k] = v;
            });
            return { query: query, scene: 1001 };
        },
        shareAppMessage: function (opt) {
            var room = '';
            if (opt && opt.query && /room=(\d+)/.test(opt.query)) {
                room = RegExp.$1;
            }
            showToast({
                title: room
                    ? '预览版分享不可用\n房间码：' + room + '（另开标签页用 ?room=' + room + ' 加入）'
                    : '预览版分享不可用'
            });
            // 预览环境顺带把链接写进地址栏，方便复制给另一个标签页
            if (room) {
                history.replaceState(null, '', '?room=' + room);
            }
        },
        // editable 模式的输入框：浏览器没有等价 API，用 prompt 顶替
        showModal: function (opt) {
            var o = opt || {};
            if (o.editable) {
                var input = window.prompt(o.title || "请输入", o.content || "");
                setTimeout(function () {
                    if (input === null) {
                        if (o.fail) o.fail({ errMsg: "showModal:fail cancel" });
                    } else if (o.success) {
                        o.success({ confirm: true, cancel: false, content: input });
                    }
                }, 0);
                return;
            }
            var ok = window.confirm((o.title ? o.title + "\n\n" : "") + (o.content || ""));
            setTimeout(function () {
                if (o.success) o.success({ confirm: ok, cancel: !ok });
            }, 0);
        },
        setClipboardData: function (opt) {            var text = (opt && opt.data) || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    if (opt && opt.success) opt.success({});
                }).catch(function () {
                    showToast({ title: '房间码：' + text });
                    if (opt && opt.success) opt.success({});
                });
            } else {
                showToast({ title: '房间码：' + text });
                if (opt && opt.success) opt.success({});
            }
        },
        getStorageSync: function (key) {
            try { return JSON.parse(localStorage.getItem('wx_' + key)) || ''; } catch (e) { return ''; }
        },
        setStorageSync: function (key, value) {
            try { localStorage.setItem('wx_' + key, JSON.stringify(value)); } catch (e) { }
        },
        removeStorageSync: function (key) {
            try { localStorage.removeItem('wx_' + key); } catch (e) { }
        },
        showKeyboard: function (opt) {
            opt = opt || {};
            var el = kbInput();
            el.maxLength = opt.maxLength || 140;
            el.value = opt.defaultValue === undefined || opt.defaultValue === null ? '' : String(opt.defaultValue);
            // 先同步一次当前值，避免面板打开后输入框是空的而游戏里还是旧名字
            kbFire('input', el.value);
            setTimeout(function () {
                try { el.focus(); el.select(); } catch (e) { }
                if (opt.success) opt.success({});
            }, 0);
        },
        hideKeyboard: function (opt) {
            var el = window.__wxKeyboardInput;
            if (el) {
                try { el.blur(); } catch (e) { }
            }
            if (opt && opt.success) setTimeout(function () { opt.success({}); }, 0);
        },
        onKeyboardInput: function (cb) { if (typeof cb === 'function') kbHandlers().input.push(cb); },
        onKeyboardConfirm: function (cb) { if (typeof cb === 'function') kbHandlers().confirm.push(cb); },
        onKeyboardComplete: function (cb) { if (typeof cb === 'function') kbHandlers().complete.push(cb); },
        getMenuButtonBoundingClientRect: function () {
            return { top: 0, left: window.innerWidth - 100, width: 90, height: 32, bottom: 32, right: window.innerWidth };
        },
        setPreferredFramesPerSecond: function () { },
        onShow: function () { },
        onHide: function () { },
        onWindowResize: function (cb) { window.addEventListener('resize', cb); },
        triggerGC: function () { },
        env: { USER_DATA_PATH: '/userdata' }
    };

    window.wx = wx;

    // 视口尺寸变化：同步画布像素尺寸并重新计算缩放
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            var G = window.GameGlobal;
            if (!G || !G.Canvas2D || !G.Game || !G.Game.size) return;
            var info = sysInfo();
            var c2d = G.Canvas2D;
            c2d._dpr = info.pixelRatio;
            var cv = c2d._canvas;
            if (!cv) return;
            cv.width = Math.round(info.windowWidth * c2d._dpr);
            cv.height = Math.round(info.windowHeight * c2d._dpr);
            c2d.resize();
        }, 120);
    });
})();
