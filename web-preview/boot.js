/**
 * 浏览器端极简 CommonJS 加载器 + 启动器（仅供本地预览）
 *
 * 小游戏的每个 .js 是一个独立模块，靠 require 串联、靠 GameGlobal 共享变量。
 * 浏览器没有这两样，所以：
 *   1) 先把所有模块源码预取到内存（保证 require 可以同步完成）
 *   2) 用 new Function 包一层模块作用域（var 不污染全局，和 CommonJS 一致）
 *   3) GameGlobal 直接指向 window —— 于是 GameGlobal.Foo = x 之后，
 *      模块里的裸标识符 Foo 就能解析到，行为和真机一致
 */
(function () {
    'use strict';

    var bootEl = document.getElementById('boot');
    var barEl = document.getElementById('bootbar');
    var msgEl = document.getElementById('bootmsg');

    // 站点根路径：本地是 '/'，线上可能挂在子路径（如 Caddy handle_path 后面的 '/8ball/'）。
    // 从本脚本自己的 src 推出来，避免写死，两种部署都不用改代码。
    var BASE = '/';
    (function () {
        var self = document.currentScript;
        if (!self || !self.src) return;
        try {
            var p = new URL(self.src).pathname;
            var at = p.lastIndexOf('boot.js');
            if (at >= 0) BASE = p.slice(0, at);
        } catch (e) { }
    })();

    // 模块 id 仍是 '/src/x.js' 这类绝对形式（require 解析用），只在真正发请求时加前缀
    function assetUrl(id) {
        return BASE + String(id).replace(/^\/+/, '');
    }

    var sources = new Map();   // id -> 源码
    var modules = new Map();   // id -> { exports }

    function setProgress(done, total, text) {
        if (barEl && total) barEl.style.width = Math.round(done / total * 100) + '%';
        if (msgEl && text) msgEl.textContent = text;
    }

    function showError(title, detail) {
        console.error('[preview]', title, detail);
        if (!bootEl) return;
        bootEl.classList.remove('hide');
        bootEl.innerHTML = '<div class="title">启动失败</div>' +
            '<div class="err">' + String(title).replace(/[<>&]/g, function (c) {
                return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
            }) + '\n\n' + String(detail || '').slice(0, 600) + '</div>';
    }

    // '/src/a/B.js' + '../geom/V.js' -> '/src/geom/V.js'
    function resolvePath(fromId, request) {
        if (request.charAt(0) === '/') return request;
        var baseParts = fromId.split('/');
        baseParts.pop();
        var parts = baseParts.concat(request.split('/'));
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (!p || p === '.') continue;
            if (p === '..') { out.pop(); continue; }
            out.push(p);
        }
        return '/' + out.join('/');
    }

    function runModule(id) {
        if (modules.has(id)) return modules.get(id).exports;

        var code = sources.get(id);
        if (code === undefined) throw new Error('模块未预加载：' + id);

        var mod = { exports: {} };
        modules.set(id, mod);

        var fn = new Function('require', 'module', 'exports',
            code + '\n//# sourceURL=' + id);

        fn(function (request) {
            return runModule(resolvePath(id, request));
        }, mod, mod.exports);

        return mod.exports;
    }

    window.addEventListener('error', function (ev) {
        if (!bootEl || bootEl.classList.contains('hide')) return;
        showError(ev.message || '未知错误', ev.filename + ':' + ev.lineno);
    });

    function fetchText(url) {
        return fetch(url, { cache: 'no-store' }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
            return res.text();
        });
    }

    (async function boot() {
        try {
            setProgress(0, 1, '正在获取模块清单…');
            var manifest = await fetch(BASE + 'preview/manifest.json', { cache: 'no-store' }).then(function (r) {
                return r.json();
            });

            var ids = manifest.modules;
            var total = ids.length;
            var done = 0;

            // 并发预取，全部到位后才能同步 require
            await Promise.all(ids.map(function (id) {
                return fetchText(assetUrl(id)).then(function (text) {
                    sources.set(id, text);
                    done++;
                    setProgress(done, total, '正在加载游戏模块 ' + done + '/' + total + '…');
                });
            }));

            setProgress(total, total, '正在启动游戏…');

            // 与真机一致：GameGlobal 就是全局对象
            window.GameGlobal = window;

            runModule('/game.js');
            console.log('[preview] 已执行 /game.js，共 ' + total + ' 个模块');

            // 等游戏真正开始渲染（资源加载完 + 菜单激活）后再收起启动遮罩，
            // 否则遮罩会挡住画布，鼠标点不到按钮
            var waited = 0;
            var timer = setInterval(function () {
                waited += 100;
                var G = window.GameGlobal;
                var ready = G && G.Game && G.Game.mainMenu && G.Game.mainMenu.active === true;
                if (ready || waited > 30000) {
                    clearInterval(timer);
                    if (bootEl) {
                        bootEl.classList.add('hide');
                        setTimeout(function () {
                            if (bootEl.parentNode) bootEl.parentNode.removeChild(bootEl);
                        }, 400);
                    }
                }
            }, 100);
        } catch (e) {
            showError('加载游戏模块失败', e && (e.stack || e.message || e));
        }
    })();
})();
